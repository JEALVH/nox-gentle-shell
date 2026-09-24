import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createSpotifyAuth as productionSpotifyAuth,
  linuxSecretKeyring,
  spotifyAuthDiagnostic,
} from "../extensions/spotify-auth.js";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import {
  clientFingerprint,
  type SpotifyState,
} from "../extensions/spotify-state.js";
import {
  CredentialLockUnavailable,
  type CredentialLease,
} from "../extensions/spotify-lock.js";

function isolatedCredentials() {
  const client = clientFingerprint("public-id");
  let current: ReturnType<SpotifyState["read"]> = null;
  const state: SpotifyState = {
    read: () => current,
    reserve(status) {
      current = {
        version: 2,
        client,
        status,
        generation: randomBytes(32).toString("hex"),
      };
      current.intent = {
        generation: current.generation,
        operation: status === "connected" ? "login" : "logout",
      };
      return current;
    },
    reserveIntent(operation) {
      const intent = { generation: randomBytes(32).toString("hex"), operation };
      current = current
        ? { ...current, intent }
        : {
            version: 2,
            client,
            status: "disconnected",
            generation: randomBytes(32).toString("hex"),
            intent,
          };
      return intent;
    },
    commitIntent(id, status) {
      if (!current || current.intent?.generation !== id) return false;
      current = { ...current, generation: id, status };
      return true;
    },
    isCurrent(id) {
      return (
        !!current &&
        current.status === "connected" &&
        current.generation === id &&
        current.intent?.generation === id &&
        current.intent.operation !== "logout"
      );
    },
  };
  let tail = Promise.resolve();
  const lease: CredentialLease = {
    run(operation) {
      const result = tail.then(() => operation(new AbortController().signal));
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
  const envelope = (refresh: string) => {
    const generation = state.reserve("connected").generation;
    return JSON.stringify({ version: 1, client, generation, refresh });
  };
  const intentLease: CredentialLease = {
    run: async (operation) => operation(new AbortController().signal),
  };
  return { state, lease, intentLease, envelope };
}

function createSpotifyAuth(
  options: Parameters<typeof productionSpotifyAuth>[0] = {},
) {
  const fixture = isolatedCredentials();
  return productionSpotifyAuth({
    lease: fixture.lease,
    intentLease: fixture.intentLease,
    state: fixture.state,
    keyring: {
      load: async () => null,
      save: async () => true,
      clear: async () => {},
    },
    ...options,
  });
}

function sharedFixture() {
  let stored: string | null = null;
  let unavailable = false;
  const fixture = isolatedCredentials();
  const keyring = {
    load: async () => {
      if (unavailable) throw new Error("private-keyring-error");
      return stored;
    },
    save: async (token: string) => {
      if (unavailable) return false;
      stored = token;
      return true;
    },
    clear: async () => {
      stored = null;
    },
  };
  const make = (fetcher: typeof fetch) =>
    createSpotifyAuth({
      clientId: "public-id",
      keyring,
      lease: fixture.lease,
      intentLease: fixture.intentLease,
      state: fixture.state,
      fetch: fetcher,
    });
  return {
    make,
    keyring,
    seed: async (token: string) => keyring.save(fixture.envelope(token)),
    get stored() {
      return stored;
    },
    set unavailable(value: boolean) {
      unavailable = value;
    },
  };
}

async function login(
  auth: ReturnType<typeof createSpotifyAuth>,
  code = "login",
) {
  return auth.connect(({ authorizationUrl, redirectUri }) => {
    const state = new URL(authorizationUrl).searchParams.get("state");
    fetch(`${redirectUri}?code=${code}&state=${state}`).catch(() => {});
  });
}

const tokens = (access: string, refresh: string, seconds = 3600) =>
  new Response(
    JSON.stringify({
      access_token: access,
      refresh_token: refresh,
      expires_in: seconds,
    }),
  );

test("post-callback diagnostics whitelist status and distinguish unsafe persistence from cancellation", async () => {
  const secret = "private-code /home/private token-body";
  for (const [fetcher, expected] of [
    [async () => new Response(secret, { status: 429 }), "token_http:429"],
    [
      async () => {
        throw new Error(secret);
      },
      "token_transport",
    ],
    [async () => new Response(secret), "token_response"],
  ] as const) {
    const auth = createSpotifyAuth({
      clientId: "public-id",
      fetch: fetcher as typeof fetch,
    });
    await assert.rejects(login(auth), (error: unknown) => {
      const diagnostic = spotifyAuthDiagnostic(error);
      assert.equal(
        `${diagnostic.category}${diagnostic.status ? `:${diagnostic.status}` : ""}`,
        expected,
      );
      assert.doesNotMatch(
        JSON.stringify(diagnostic),
        /private|home|token-body/,
      );
      return true;
    });
  }
  const auth = createSpotifyAuth({ clientId: "public-id", timeoutMs: 10 });
  await assert.rejects(
    auth.connect(() => {}),
    (error: unknown) => {
      assert.equal(spotifyAuthDiagnostic(error).category, "timeout");
      return true;
    },
  );
  assert.deepEqual(spotifyAuthDiagnostic(new Error(secret)), {
    category: "unknown",
  });
  const uncertain = createSpotifyAuth({
    clientId: "public-id",
    fetch: async () => tokens("access", "refresh"),
    keyring: {
      load: async () => null,
      save: async () => false,
      clear: async () => {},
    },
  });
  await assert.rejects(login(uncertain), (error: unknown) => {
    assert.equal(
      spotifyAuthDiagnostic(error).category,
      "persistence_uncertain",
    );
    return true;
  });
  const cancelled = createSpotifyAuth({ clientId: "public-id" });
  const pending = cancelled.connect(() => {
    cancelled.cancelPending?.();
  });
  await assert.rejects(pending, (error: unknown) => {
    assert.equal(spotifyAuthDiagnostic(error).category, "cancelled");
    return true;
  });
});

test("in-flight external abort and cancelPending are cancellation, not deadline timeout", async () => {
  for (const cancel of ["signal", "pending"] as const) {
    const controller = new AbortController();
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const auth = createSpotifyAuth({
      clientId: "public-id",
      fetch: (async (_url, init) => {
        entered();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private-body /home/secret")),
            { once: true },
          );
        });
      }) as typeof fetch,
    });
    const pending = loginWithSignal(auth, controller.signal);
    await waiting;
    if (cancel === "signal") controller.abort();
    else auth.cancelPending?.();
    await assert.rejects(pending, (error: unknown) => {
      assert.deepEqual(spotifyAuthDiagnostic(error), { category: "cancelled" });
      assert.doesNotMatch(String(error), /private-body|home\/secret/);
      return true;
    });
  }
});

test("token deadline wins over an abort-ignoring late response", async () => {
  let entered!: () => void;
  let resolveFetch!: (response: Response) => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let saves = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    fetch: (async () => {
      entered();
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    }) as typeof fetch,
    keyring: {
      load: async () => null,
      save: async () => {
        saves++;
        return true;
      },
      clear: async () => {},
    },
  });
  mock.timers.enable({ apis: ["setTimeout"] });
  const pending = login(auth);
  await waiting;
  try {
    mock.timers.tick(15000);
    await assert.rejects(pending, (error: unknown) => {
      assert.deepEqual(spotifyAuthDiagnostic(error), { category: "timeout" });
      assert.doesNotMatch(String(error), /private-access|private-refresh/);
      return true;
    });
    resolveFetch(tokens("private-access", "private-refresh"));
    await Promise.resolve();
    assert.equal(saves, 0);
    assert.equal(await auth.getAccessToken(), null);
  } finally {
    mock.timers.reset();
  }
});

test("body parsing is bounded by the exchange deadline and cannot save late tokens", async () => {
  let entered!: () => void;
  let finish!: (value: unknown) => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let saves = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    fetch: (async () =>
      ({
        ok: true,
        json: () => {
          entered();
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      }) as Response) as typeof fetch,
    keyring: {
      load: async () => null,
      save: async () => {
        saves++;
        return true;
      },
      clear: async () => {},
    },
  });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = login(auth);
    await waiting;
    mock.timers.tick(15000);
    await assert.rejects(pending, (error: unknown) => {
      assert.deepEqual(spotifyAuthDiagnostic(error), { category: "timeout" });
      return true;
    });
    finish({
      access_token: "private-access",
      refresh_token: "private-refresh",
      expires_in: 3600,
    });
    await Promise.resolve();
    assert.equal(saves, 0);
    assert.equal(await auth.getAccessToken(), null);
  } finally {
    mock.timers.reset();
  }
});

test("external abort during body parsing wins over a late private JSON rejection", async () => {
  const controller = new AbortController();
  let entered!: () => void;
  let fail!: (error: Error) => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let saves = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    fetch: (async () =>
      ({
        ok: true,
        json: () => {
          entered();
          return new Promise((_resolve, reject) => {
            fail = reject;
          });
        },
      }) as Response) as typeof fetch,
    keyring: {
      load: async () => null,
      save: async () => {
        saves++;
        return true;
      },
      clear: async () => {},
    },
  });
  const pending = loginWithSignal(auth, controller.signal);
  await waiting;
  controller.abort();
  await assert.rejects(pending, (error: unknown) => {
    assert.deepEqual(spotifyAuthDiagnostic(error), { category: "cancelled" });
    assert.doesNotMatch(String(error), /private-body|home\/secret/);
    return true;
  });
  fail(new Error("private-body /home/secret"));
  await Promise.resolve();
  assert.equal(saves, 0);
  assert.equal(await auth.getAccessToken(), null);
});

test("external cancellation wins when deadline precedes delayed fetch rejection", async () => {
  const controller = new AbortController();
  let entered!: () => void;
  let rejectFetch!: (reason: Error) => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let saves = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    fetch: (async () => {
      entered();
      return new Promise<Response>((_resolve, reject) => {
        rejectFetch = reject;
      });
    }) as typeof fetch,
    keyring: {
      load: async () => null,
      save: async () => {
        saves++;
        return true;
      },
      clear: async () => {},
    },
  });
  mock.timers.enable({ apis: ["setTimeout"] });
  const pending = loginWithSignal(auth, controller.signal);
  await waiting;
  try {
    controller.abort();
    mock.timers.tick(15000);
    await assert.rejects(pending, (error: unknown) => {
      assert.deepEqual(spotifyAuthDiagnostic(error), { category: "cancelled" });
      assert.doesNotMatch(String(error), /private-body|home\/secret/);
      return true;
    });
    rejectFetch(new Error("private-body /home/secret"));
    await Promise.resolve();
    assert.equal(saves, 0);
    assert.equal(await auth.getAccessToken(), null);
  } finally {
    mock.timers.reset();
  }
});

async function loginWithSignal(
  auth: ReturnType<typeof createSpotifyAuth>,
  signal: AbortSignal,
) {
  return auth.connect(({ authorizationUrl, redirectUri }) => {
    const state = new URL(authorizationUrl).searchParams.get("state");
    fetch(`${redirectUri}?code=login&state=${state}`).catch(() => {});
  }, signal);
}

test("login reservation failure reports coordination without leaking state details", async () => {
  const fixture = isolatedCredentials();
  const auth = createSpotifyAuth({
    clientId: "public-id",
    state: {
      ...fixture.state,
      reserveIntent: () => {
        throw new Error("credential state unavailable /home/private-code");
      },
    },
    fetch: async () => {
      throw new Error("exchange must not run");
    },
  });
  await assert.rejects(login(auth), (error: unknown) => {
    assert.deepEqual(spotifyAuthDiagnostic(error), {
      category: "coordination",
    });
    assert.doesNotMatch(String(error), /home|private-code/);
    return true;
  });
});

test("later disconnect intent beats an earlier callback despite reversed credential acquisition", async () => {
  const fixture = isolatedCredentials();
  let stored: string | null = null;
  let release!: () => void;
  let waiting!: () => void;
  const queued = new Promise<void>((resolve) => {
    waiting = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquisitions = 0;
  const lease: CredentialLease = {
    async run(operation) {
      if (++acquisitions === 1) {
        waiting();
        await gate;
      }
      return operation(new AbortController().signal);
    },
  };
  let exchanges = 0;
  let saves = 0;
  const options = {
    clientId: "public-id",
    state: fixture.state,
    lease,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => stored,
      save: async (value: string) => {
        saves++;
        stored = value;
        return true;
      },
      clear: async () => {
        stored = null;
      },
    },
    fetch: (async () => {
      exchanges++;
      return tokens("access", "refresh");
    }) as typeof fetch,
  };
  const a = productionSpotifyAuth(options);
  const b = productionSpotifyAuth(options);
  const connecting = assert.rejects(login(a), /cancelled/);
  await queued;
  await b.disconnect();
  release();
  await connecting;
  assert.equal(exchanges, 0);
  assert.equal(saves, 0);
  assert.equal(fixture.state.read()?.status, "disconnected");
  assert.equal(await b.getAccessToken(), null);
});

test("refresh intent precedes queued credential lease and later logout wins", async () => {
  const fixture = isolatedCredentials();
  let stored = fixture.envelope("initial");
  let release!: () => void;
  let queued!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    queued = resolve;
  });
  let acquisitions = 0;
  const lease: CredentialLease = {
    async run(operation) {
      if (++acquisitions === 2) {
        queued();
        await gate;
      }
      return operation(new AbortController().signal);
    },
  };
  let exchanges = 0;
  let saves = 0;
  const options = {
    clientId: "public-id",
    state: fixture.state,
    lease,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => stored,
      save: async (value: string) => {
        saves++;
        stored = value;
        return true;
      },
      clear: async () => {
        stored = "";
      },
    },
    fetch: (async () => {
      exchanges++;
      return tokens("stale", "rotated");
    }) as typeof fetch,
  };
  const a = productionSpotifyAuth(options);
  const b = productionSpotifyAuth(options);
  const pending = a.getAccessToken();
  await waiting;
  assert.equal(fixture.state.read()?.intent?.operation, "refresh");
  await b.disconnect();
  release();
  assert.equal(await pending, null);
  assert.equal(exchanges, 0);
  assert.equal(saves, 0);
  assert.equal(fixture.state.read()?.status, "disconnected");
});

test("logout intent during refresh network wait prevents persistence", async () => {
  const fixture = isolatedCredentials();
  let stored = fixture.envelope("initial");
  let entered!: () => void;
  let finish!: (response: Response) => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let saves = 0;
  const options = {
    clientId: "public-id",
    state: fixture.state,
    lease: fixture.lease,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => stored,
      save: async (value: string) => {
        saves++;
        stored = value;
        return true;
      },
      clear: async () => {
        stored = "";
      },
    },
    fetch: (async () => {
      entered();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }) as typeof fetch,
  };
  const a = productionSpotifyAuth(options);
  const b = productionSpotifyAuth(options);
  const pending = a.getAccessToken();
  await waiting;
  const logout = b.disconnect();
  while (fixture.state.read()?.intent?.operation !== "logout")
    await new Promise((resolve) => setTimeout(resolve, 0));
  finish(tokens("stale", "rotated"));
  assert.equal(await pending, null);
  await logout;
  assert.equal(saves, 0);
  assert.equal(stored, "");
});

test("missing metadata at final grant rejects persisted and memory-only access", async () => {
  for (const memoryOnly of [false, true]) {
    const fixture = isolatedCredentials();
    let atGrant = false;
    const state: SpotifyState = {
      ...fixture.state,
      read: () => (atGrant ? null : fixture.state.read()),
    };
    const intentLease: CredentialLease = {
      run: async (operation) => {
        atGrant = true;
        try {
          return await operation(new AbortController().signal);
        } finally {
          atGrant = false;
        }
      },
    };
    const unavailable: CredentialLease = {
      run: async () => {
        throw new CredentialLockUnavailable();
      },
    };
    const auth = productionSpotifyAuth({
      clientId: "public-id",
      state,
      lease: memoryOnly ? unavailable : fixture.lease,
      intentLease,
      keyring: {
        load: async () => (memoryOnly ? null : fixture.envelope("refresh")),
        save: async () => true,
        clear: async () => {},
      },
      fetch: (async () => tokens("secret-access", "refresh")) as typeof fetch,
    });
    if (memoryOnly) await login(auth);
    assert.equal(await auth.getAccessToken(), null);
  }
});

test("memory-only access rejects shared logout and unreadable state even with unavailable lease", async () => {
  const fixture = isolatedCredentials();
  let unreadable = false;
  const state: SpotifyState = {
    ...fixture.state,
    read: () => {
      if (unreadable) throw new Error("unreadable");
      return fixture.state.read();
    },
  };
  const unavailable: CredentialLease = {
    run: async () => {
      throw new CredentialLockUnavailable();
    },
  };
  const options = {
    clientId: "public-id",
    state,
    lease: unavailable,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => null,
      save: async () => true,
      clear: async () => {},
    },
    fetch: (async () =>
      tokens("memory-access", "memory-refresh")) as typeof fetch,
  };
  const a = productionSpotifyAuth(options);
  const b = productionSpotifyAuth({ ...options, lease: fixture.lease });
  await login(a);
  assert.equal(await a.getAccessToken(), "memory-access");
  unreadable = true;
  assert.equal(await a.getAccessToken(), null);
  unreadable = false;
  await b.disconnect();
  assert.equal(await a.getAccessToken(), null);
});

test("memory-only cached token rejects newer login and adopts persisted owner", async () => {
  const fixture = isolatedCredentials();
  let stored: string | null = null;
  let unavailable = true;
  const lease: CredentialLease = {
    run: (operation) =>
      unavailable
        ? Promise.reject(new CredentialLockUnavailable())
        : fixture.lease.run(operation),
  };
  const options = {
    clientId: "public-id",
    state: fixture.state,
    lease,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => stored,
      save: async (value: string) => {
        stored = value;
        return true;
      },
      clear: async () => {
        stored = null;
      },
    },
    fetch: (async (_url: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(init?.body as string);
      return body.get("grant_type") === "refresh_token"
        ? tokens("access-B", "refresh-B")
        : body.get("code") === "A"
          ? tokens("access-A", "refresh-A")
          : tokens("access-B", "refresh-B");
    }) as typeof fetch,
  };
  const a = productionSpotifyAuth(options);
  const b = productionSpotifyAuth(options);
  await login(a, "A");
  const owner = fixture.state.read()?.intent?.generation;
  assert.equal(await a.getAccessToken(), "access-A");
  unavailable = false;
  await login(b, "B");
  assert.notEqual(fixture.state.read()?.intent?.generation, owner);
  unavailable = true;
  assert.equal(await a.getAccessToken(), null);
  unavailable = false;
  assert.equal(await a.getAccessToken(), "access-B");
  unavailable = true;
  fixture.state.reserveIntent!("logout");
  assert.equal(await a.getAccessToken(), null);
});

test("persisted cached access rejects newer login between credential release and grant", async () => {
  for (const completed of [false, true]) {
    const fixture = isolatedCredentials();
    const owner = fixture.state.reserve("connected").generation;
    let stored = JSON.stringify({
      version: 1,
      client: clientFingerprint("public-id"),
      generation: owner,
      refresh: "refresh-A",
    });
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const lease: CredentialLease = {
      run: async (operation) => {
        const result = await operation(new AbortController().signal);
        if (++calls === 3) {
          entered();
          await gate;
        }
        return result;
      },
    };
    const options = {
      clientId: "public-id",
      state: fixture.state,
      lease,
      intentLease: fixture.intentLease,
      keyring: {
        load: async () => stored,
        save: async (value: string) => {
          stored = value;
          return true;
        },
        clear: async () => {
          stored = "";
        },
      },
      fetch: (async () => tokens("access-A", "refresh-A")) as typeof fetch,
    };
    const a = productionSpotifyAuth(options);
    assert.equal(await a.getAccessToken(), "access-A");
    const pending = a.getAccessToken();
    await waiting;
    const replacement = fixture.state.reserveIntent!("login").generation;
    if (completed) fixture.state.commitIntent!(replacement, "connected");
    release();
    assert.equal(
      await pending,
      null,
      completed ? "committed replacement" : "pending replacement",
    );
  }
});

test("cached access rejects logout intent reserved while credential lease releases", async () => {
  const fixture = isolatedCredentials();
  let stored = fixture.envelope("refresh");
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const lease: CredentialLease = {
    run: async (operation) => {
      const result = await operation(new AbortController().signal);
      if (++calls === 3) {
        entered();
        await gate;
      }
      return result;
    },
  };
  const options = {
    clientId: "public-id",
    state: fixture.state,
    lease,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => stored,
      save: async (value: string) => {
        stored = value;
        return true;
      },
      clear: async () => {
        stored = "";
      },
    },
    fetch: (async () => tokens("cached-access", "refresh")) as typeof fetch,
  };
  const a = productionSpotifyAuth(options);
  await a.getAccessToken();
  const pending = a.getAccessToken();
  await waiting;
  fixture.state.reserveIntent!("logout");
  release();
  assert.equal(await pending, null);
});

test("non-reentrant credential lease without independent intent lease fails fast", () => {
  const fixture = isolatedCredentials();
  assert.throws(
    () =>
      productionSpotifyAuth({
        clientId: "public-id",
        lease: fixture.lease,
        state: fixture.state,
      }),
    /intentLease|independent/i,
  );
});

test("legacy bare refresh tokens are refused without exchange", async () => {
  const shared = sharedFixture();
  await shared.keyring.save("legacy-private-refresh");
  const auth = shared.make(async () => {
    throw new Error("legacy token must not be exchanged");
  });
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(auth.persistenceAvailable, false);
});

test("an already open tab discovers a later keyring login", async () => {
  const shared = sharedFixture();
  const fetcher: typeof fetch = async (_url, init) => {
    const body = new URLSearchParams(init?.body as string);
    return body.get("grant_type") === "authorization_code"
      ? tokens("first", "login-refresh")
      : tokens("restored", "login-refresh");
  };
  const a = shared.make(fetcher);
  assert.equal(await a.getAccessToken(), null);
  await login(shared.make(fetcher));
  assert.equal(await a.getAccessToken(), "restored");
});

test("loopback callback acknowledges receipt without claiming a connection before exchange", async () => {
  const auth = createSpotifyAuth({
    clientId: "public-id",
    fetch: async () =>
      new Response(
        JSON.stringify({ access_token: "private-access", expires_in: 3600 }),
      ),
  });
  let resolveCallback!: (response: Response) => void;
  const callback = new Promise<Response>((resolve) => {
    resolveCallback = resolve;
  });
  const connecting = assert.rejects(
    auth.connect(({ authorizationUrl, redirectUri }) => {
      const state = new URL(authorizationUrl).searchParams.get("state");
      fetch(`${redirectUri}?code=private-code&state=${state}`).then(
        resolveCallback,
      );
    }),
    /missing refresh token/,
  );
  const response = await callback;
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  const callbackText = await response.text();
  await connecting;
  assert.match(callbackText, /authorization received|return to pi/i);
  assert.doesNotMatch(callbackText, /connected|private-code|private-access/i);
  assert.equal(await auth.getAccessToken(), null);
});

test("initial code response without refresh_token fails closed without reviving prior credentials", async () => {
  const shared = sharedFixture();
  await shared.seed("private-prior-refresh");
  const previous = shared.stored;
  let saves = 0;
  const auth = shared.make(
    async () =>
      new Response(
        JSON.stringify({
          access_token: "private-new-access",
          expires_in: 3600,
        }),
      ),
  );
  const originalSave = shared.keyring.save;
  shared.keyring.save = async (value) => {
    saves++;
    return originalSave(value);
  };
  await assert.rejects(login(auth), (error: unknown) => {
    assert.match(String(error), /refresh token|credential/i);
    assert.doesNotMatch(
      String(error),
      /private-prior-refresh|private-new-access/,
    );
    return true;
  });
  assert.equal(saves, 0);
  assert.equal(shared.stored, previous);
  assert.equal(auth.persistenceAvailable, false);
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(
    await shared
      .make(async () => {
        throw new Error("stale exchange");
      })
      .getAccessToken(),
    null,
  );
});

test("malformed token response fields fail closed without keyring writes or secret diagnostics", async () => {
  const secret = "private-token-body";
  for (const mode of ["login", "refresh"] as const) {
    for (const [field, value] of [
      ["access_token", { secret }],
      ["access_token", 42],
      ["refresh_token", { secret }],
      ["refresh_token", 42],
      ["refresh_token", ""],
      ["expires_in", "3600"],
      ["expires_in", "NaN"],
    ] as const) {
      const shared = sharedFixture();
      if (mode === "refresh") await shared.seed("private-prior-refresh");
      const before = shared.stored;
      let saves = 0;
      const originalSave = shared.keyring.save;
      shared.keyring.save = async (token) => {
        saves++;
        return originalSave(token);
      };
      const payload = {
        access_token: "private-access",
        refresh_token: "private-refresh",
        expires_in: 3600,
        [field]: value,
      };
      const auth = shared.make(
        async () => new Response(JSON.stringify(payload)),
      );
      if (mode === "login") {
        await assert.rejects(
          login(auth),
          (error: unknown) => {
            assert.deepEqual(spotifyAuthDiagnostic(error), {
              category: "token_response",
            });
            assert.doesNotMatch(String(error), /private|secret/);
            return true;
          },
          `${mode}: ${field}=${String(value)}`,
        );
      } else {
        assert.equal(
          await auth.getAccessToken(),
          null,
          `${mode}: ${field}=${String(value)}`,
        );
      }
      assert.equal(saves, 0);
      assert.equal(shared.stored, before);
      assert.equal(await auth.getAccessToken(), null);
    }
  }
});

test("refresh response without refresh_token commits prior credential under new generation", async () => {
  const shared = sharedFixture();
  await shared.seed("private-prior-refresh");
  const before = JSON.parse(shared.stored!);
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(
      new URLSearchParams(init?.body as string).get("refresh_token"),
      "private-prior-refresh",
    );
    return new Response(
      JSON.stringify({ access_token: "private-new-access", expires_in: 3600 }),
    );
  };
  const first = shared.make(fetcher);
  assert.equal(await first.getAccessToken(), "private-new-access");
  assert.equal(first.persistenceAvailable, true);
  const after = JSON.parse(shared.stored!);
  assert.equal(after.refresh, "private-prior-refresh");
  assert.notEqual(after.generation, before.generation);
  assert.equal(
    await shared.make(fetcher).getAccessToken(),
    "private-new-access",
  );
});

test("two tabs serialize rotated refresh and cannot overwrite newer credentials", async () => {
  const shared = sharedFixture();
  await shared.seed("initial");
  const seen: string[] = [];
  let started!: () => void;
  let release!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetcher: typeof fetch = async (_url, init) => {
    const input = new URLSearchParams(init?.body as string).get(
      "refresh_token",
    )!;
    seen.push(input);
    if (input === "initial") {
      started();
      await barrier;
    }
    return tokens(input, input === "initial" ? "rotated" : "newest", 1);
  };
  const [a, b] = [shared.make(fetcher), shared.make(fetcher)];
  const first = a.getAccessToken();
  await firstEntered;
  const second = b.getAccessToken();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ["initial"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(seen, ["initial", "rotated"]);
  assert.equal(JSON.parse(shared.stored!).refresh, "newest");
});

test("disconnect wins over stale cached access and another tab's refresh", async () => {
  const shared = sharedFixture();
  await shared.seed("initial");
  const fetcher: typeof fetch = async () => tokens("cached", "rotated");
  const [a, b] = [shared.make(fetcher), shared.make(fetcher)];
  assert.equal(await b.getAccessToken(), "cached");
  await a.disconnect();
  assert.equal(await b.getAccessToken(), null);
  assert.equal(shared.stored, null);
});

test("a save that writes then fails tombstones durable state", {
  timeout: 20000,
}, async () => {
  const fixture = isolatedCredentials();
  let stored: string | null = null;
  const auth = productionSpotifyAuth({
    clientId: "public-id",
    state: fixture.state,
    lease: fixture.lease,
    intentLease: fixture.intentLease,
    keyring: {
      load: async () => stored,
      save: async (value) => {
        stored = value;
        return false;
      },
      clear: async () => {
        stored = null;
      },
    },
    fetch: async () => tokens("private-access", "private-refresh"),
  });
  await assert.rejects(login(auth), /UNCERTAIN/);
  assert.equal(fixture.state.read()?.status, "disconnected");
  assert.equal(await auth.getAccessToken(), null);
  assert.ok(stored);
});

test("memory-only login stays usable without claiming cross-tab persistence", async () => {
  const keyring = {
    load: async () => null,
    save: async () => {
      throw new Error("keyring write must not occur without a lease");
    },
    clear: async () => {},
  };
  const auth = createSpotifyAuth({
    clientId: "public-id",
    keyring,
    lease: {
      run: async () => {
        throw new CredentialLockUnavailable();
      },
    },
    fetch: async (_url, init) => {
      const body = new URLSearchParams(init?.body as string);
      return tokens(
        "memory-access",
        body.get("grant_type") === "authorization_code"
          ? "memory-refresh"
          : "next-memory-refresh",
        3600,
      );
    },
  });
  assert.equal((await login(auth)).persistenceAvailable, false);
  assert.equal(await auth.getAccessToken(), "memory-access");
  assert.equal(auth.persistenceAvailable, false);
});

test("transient unavailable keyring does not lock out later discovery or claim persistence", async () => {
  const shared = sharedFixture();
  shared.unavailable = true;
  const auth = shared.make(async () => tokens("access", "persisted"));
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(auth.persistenceAvailable, false);
  shared.unavailable = false;
  await shared.seed("persisted");
  assert.equal(await auth.getAccessToken(), "access");
  assert.equal(auth.persistenceAvailable, true);
});

test("secret-tool store uses label and stdin, never token argv", async () => {
  const calls: string[][] = [];
  const keyring = linuxSecretKeyring((_command, args) => {
    calls.push(args);
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable;
      stdout: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stdin = new Writable({
      write(chunk, _encoding, done) {
        assert.equal(String(chunk), "private-refresh");
        done();
      },
    });
    child.stdin.on("finish", () =>
      queueMicrotask(() => child.emit("close", 0)),
    );
    return child as unknown as import("node:events").EventEmitter & {
      stdin: Writable;
      stdout: import("node:stream").Readable;
    };
  });
  assert.equal(await keyring.save("private-refresh"), true);
  assert.deepEqual(calls[0]?.slice(0, 2), [
    "store",
    "--label=Spotify Connect for Nox",
  ]);
  assert.ok(!calls[0]?.join(" ").includes("private-refresh"));
});

test("disconnect waits for an in-flight store before clearing", async () => {
  let release!: () => void;
  let started!: () => void;
  const saving = new Promise<void>((resolve) => {
    started = resolve;
  });
  let stored: string | null = null;
  let disconnected = false;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    timeoutMs: 2000,
    keyring: {
      load: async () => null,
      save: async (token) => {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        stored = token;
        return true;
      },
      clear: async () => {
        stored = null;
      },
    },
    fetch: async () =>
      new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
        }),
      ),
  });
  const connecting = assert.rejects(
    auth.connect(({ authorizationUrl, redirectUri }) => {
      fetch(
        `${redirectUri}?code=valid&state=${new URL(authorizationUrl).searchParams.get("state")}`,
      ).catch(() => {});
    }),
    /cancelled/,
  );
  await saving;
  const disconnecting = auth.disconnect().then(() => {
    disconnected = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(disconnected, false);
  release();
  await disconnecting;
  await connecting;
  assert.equal(stored, null);
  assert.equal(await auth.getAccessToken(), null);
});

test("cancelPending fences an in-flight save", {
  timeout: 2000,
}, async () => {
  for (const prior of [null, "prior-refresh"]) {
    let stored = prior;
    let start!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const auth = createSpotifyAuth({
      clientId: "public-id",
      keyring: {
        load: async () => stored,
        save: async (token) => {
          if (JSON.parse(token).refresh === "new-refresh") {
            start();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          stored = token;
          return true;
        },
        clear: async () => {
          stored = null;
        },
      },
      fetch: async () =>
        new Response(
          JSON.stringify({
            access_token: "access",
            refresh_token: "new-refresh",
            expires_in: 3600,
          }),
        ),
    });
    const connecting = auth.connect(({ authorizationUrl, redirectUri }) => {
      const state = new URL(authorizationUrl).searchParams.get("state");
      fetch(`${redirectUri}?code=valid&state=${state}`).catch(() => {});
    });
    await started;
    auth.cancelPending?.();
    release();
    await assert.rejects(connecting, /cancelled/);
    assert.equal(await auth.getAccessToken(), null);
    assert.equal(
      stored === prior || JSON.parse(stored!).refresh === "new-refresh",
      true,
    );
  }
});

test("failed stale-save compensation reports uncertainty without exposing credentials", {
  timeout: 2000,
}, async () => {
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const auth = createSpotifyAuth({
    clientId: "public-id",
    keyring: {
      load: async () => "prior-refresh",
      save: async (token) => {
        if (JSON.parse(token).refresh === "new-refresh") {
          start();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return true;
        }
        throw new Error("private-token");
      },
      clear: async () => {},
    },
    fetch: async () =>
      new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        }),
      ),
  });
  const connecting = auth.connect(({ authorizationUrl, redirectUri }) => {
    const state = new URL(authorizationUrl).searchParams.get("state");
    fetch(`${redirectUri}?code=valid&state=${state}`).catch(() => {});
  });
  await started;
  auth.cancelPending?.();
  release();
  await assert.rejects(connecting, (error: unknown) => {
    assert.match(String(error), /cancelled/);
    assert.doesNotMatch(
      String(error),
      /private-token|prior-refresh|new-refresh/,
    );
    return true;
  });
});

test("failed keyring removal is reported without credentials", async () => {
  const auth = createSpotifyAuth({
    clientId: "public-id",
    keyring: {
      load: async () => null,
      save: async () => true,
      clear: async () => {
        throw new Error("private-token");
      },
    },
  });
  await assert.rejects(auth.disconnect(), (error: unknown) => {
    assert.match(String(error), /credential|keyring/i);
    assert.doesNotMatch(String(error), /private-token/);
    return true;
  });
});

test("secret-tool nonzero clear rejects", async () => {
  const keyring = linuxSecretKeyring(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable;
      stdout: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stdin = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    child.stdin.on("finish", () =>
      queueMicrotask(() => child.emit("close", 1)),
    );
    return child as never;
  });
  await assert.rejects(keyring.clear(), /credential|keyring/i);
});

test("matching-state denial ends OAuth, wrong-state denial does not", async () => {
  const auth = createSpotifyAuth({ clientId: "public-id", timeoutMs: 2000 });
  const pending = auth.connect(async ({ redirectUri, authorizationUrl }) => {
    const wrong = await fetch(`${redirectUri}?state=wrong&error=access_denied`);
    assert.equal(wrong.status, 400);
    const state = new URL(authorizationUrl).searchParams.get("state");
    const denied = await fetch(
      `${redirectUri}?state=${state}&error=access_denied`,
    );
    assert.equal(denied.status, 400);
  });
  await assert.rejects(pending, /denied|rejected/i);
});

test("disconnect cancels pending OAuth without an external signal", async () => {
  const auth = createSpotifyAuth({
    clientId: "public-id",
    timeoutMs: 2000,
    keyring: {
      load: async () => null,
      save: async () => true,
      clear: async () => {},
    },
  });
  let ready!: () => void;
  const opened = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const pending = assert.rejects(
    auth.connect(() => {
      ready();
    }),
    /cancelled/,
  );
  await opened;
  await auth.disconnect();
  await pending;
});

test("serialized stale save cannot erase newer connect, and disconnect clears last", {
  timeout: 2000,
}, async () => {
  let release!: () => void;
  let started!: () => void;
  const saving = new Promise<void>((resolve) => {
    started = resolve;
  });
  let stored: string | null = null;
  let saves = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    timeoutMs: 2000,
    keyring: {
      load: async () => null,
      save: async (token) => {
        if (++saves === 1) {
          started();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        stored = token;
        return true;
      },
      clear: async () => {
        stored = null;
      },
    },
    fetch: async (_url, init) => {
      const body = new URLSearchParams(init?.body as string);
      return new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: body.get("code"),
          expires_in: 3600,
        }),
      );
    },
  });
  const connect = (code: string) =>
    auth.connect(({ authorizationUrl, redirectUri }) => {
      const state = new URL(authorizationUrl).searchParams.get("state");
      fetch(`${redirectUri}?code=${code}&state=${state}`).catch(() => {});
    });
  const old = assert.rejects(connect("old"), /cancelled/);
  await saving;
  const newest = connect("new");
  release();
  await old;
  await newest;
  assert.equal(JSON.parse(stored!).refresh, "new");
  await auth.disconnect();
  assert.equal(stored, null);
});

test("older cancelled connection cannot remove a newer connection's disconnect cancellation", async () => {
  const auth = createSpotifyAuth({
    clientId: "public-id",
    timeoutMs: 120_000,
    keyring: {
      load: async () => null,
      save: async () => true,
      clear: async () => {},
    },
  });
  let aOpened!: () => void;
  const aReady = new Promise<void>((resolve) => {
    aOpened = resolve;
  });
  const old = assert.rejects(
    auth.connect(() => {
      aOpened();
    }),
    /cancelled/,
  );
  await aReady;
  let bOpened!: () => void;
  const bReady = new Promise<void>((resolve) => {
    bOpened = resolve;
  });
  let redirectUri = "";
  const newer = assert.rejects(
    auth.connect(({ redirectUri: uri }) => {
      redirectUri = uri;
      bOpened();
    }),
    /cancelled/,
  );
  await bReady;
  await old;
  const deadline = AbortSignal.timeout(500);
  await Promise.race([
    (async () => {
      await auth.disconnect();
      await newer;
    })(),
    new Promise<never>((_, reject) =>
      deadline.addEventListener(
        "abort",
        () => reject(new Error("newer connection was not cancelled promptly")),
        { once: true },
      ),
    ),
  ]);
  const port = Number(new URL(redirectUri).port);
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("newer listener remained open"));
    });
    socket.once("error", (error: NodeJS.ErrnoException) =>
      error.code === "ECONNREFUSED" ? resolve() : reject(error),
    );
  });
});

test("synchronous second connect cancels the first before its listener binds", async () => {
  const auth = createSpotifyAuth({ clientId: "public-id", timeoutMs: 120_000 });
  let firstOpened = false;
  const first = auth.connect(() => {
    firstOpened = true;
  });
  const second = auth.connect(() => {});
  await assert.rejects(
    Promise.race([
      first,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("first did not cancel promptly")),
          500,
        ),
      ),
    ]),
    /cancelled/,
  );
  assert.equal(firstOpened, false);
  auth.cancelPending?.();
  await assert.rejects(second, /cancelled/);
});

test("cancelling a delayed exchange prevents saving without clearing saved credentials", async () => {
  let release!: (response: Response) => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let saved = "existing-refresh";
  let clears = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    keyring: {
      load: async () => saved,
      save: async (token) => {
        saved = token;
        return true;
      },
      clear: async () => {
        clears++;
        saved = "";
      },
    },
    fetch: async () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const connecting = auth.connect(({ authorizationUrl, redirectUri }) => {
    const state = new URL(authorizationUrl).searchParams.get("state");
    fetch(`${redirectUri}?code=valid&state=${state}`).catch(() => {});
  });
  await waiting;
  auth.cancelPending?.();
  release(
    new Response(
      JSON.stringify({
        access_token: "access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }),
    ),
  );
  await assert.rejects(connecting, /cancelled/);
  assert.equal(saved, "existing-refresh");
  assert.equal(clears, 0);
});

test("abort closes the pending loopback listener", async () => {
  const controller = new AbortController();
  let redirectUri = "";
  const auth = createSpotifyAuth({
    clientId: "public-id",
    timeoutMs: 2000,
    keyring: {
      load: async () => null,
      save: async () => false,
      clear: async () => {},
    },
    fetch: async () => {
      throw new Error("token exchange must not run");
    },
  });
  const pending = auth.connect((request) => {
    redirectUri = request.redirectUri;
    controller.abort();
  }, controller.signal);
  await assert.rejects(pending, /cancelled/);
  const port = new URL(redirectUri).port;
  assert.match(port, /^\d+$/);
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number(port) });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("listener remained open"));
    });
    socket.once("error", (error: NodeJS.ErrnoException) =>
      error.code === "ECONNREFUSED" ? resolve() : reject(error),
    );
  });
});

test("disconnect invalidates pending keyring restoration", {
  timeout: 20000,
}, async () => {
  const fixture = isolatedCredentials();
  fixture.state.reserve("connected");
  let resolveLoad!: (value: string) => void;
  let loads = 0;
  let started!: () => void;
  const loading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const auth = createSpotifyAuth({
    clientId: "public-id",
    state: fixture.state,
    lease: fixture.lease,
    keyring: {
      load: () => {
        if (++loads > 1) return Promise.resolve(null);
        return new Promise((resolve) => {
          resolveLoad = resolve;
          started();
        });
      },
      save: async () => true,
      clear: async () => {},
    },
    fetch: async () => {
      throw new Error("stale refresh must not run");
    },
  });
  const pending = auth.getAccessToken();
  await loading;
  const disconnecting = auth.disconnect();
  resolveLoad("stale-refresh");
  await disconnecting;
  assert.equal(await pending, null);
  assert.equal(await auth.getAccessToken(), null);
});

test("disconnect during token response prevents persistence for connect and refresh", async () => {
  for (const mode of ["connect", "refresh"]) {
    let release!: (response: Response) => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const saved: string[] = [];
    const fixture = isolatedCredentials();
    let stored =
      mode === "refresh" ? fixture.envelope("initial-refresh") : null;
    const auth = createSpotifyAuth({
      clientId: "public-id",
      timeoutMs: 2000,
      state: fixture.state,
      lease: fixture.lease,
      keyring: {
        load: async () => stored,
        save: async (token) => {
          saved.push(token);
          stored = token;
          return true;
        },
        clear: async () => {
          stored = null;
        },
      },
      fetch: async () => {
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    const operation =
      mode === "refresh"
        ? auth.getAccessToken()
        : assert.rejects(
            auth.connect(({ authorizationUrl, redirectUri }) => {
              const state = new URL(authorizationUrl).searchParams.get("state");
              fetch(`${redirectUri}?code=valid&state=${state}`).catch(() => {});
            }),
            /cancelled/,
          );
    await waiting;
    const disconnecting = auth.disconnect();
    release(
      new Response(
        JSON.stringify({
          access_token: "stale-access",
          refresh_token: "stale-refresh",
          expires_in: 3600,
        }),
      ),
    );
    await disconnecting;
    if (mode === "connect") await operation;
    else assert.equal(await operation, null);
    assert.deepEqual(saved, []);
    assert.equal(await auth.getAccessToken(), null);
  }
});

test("wrong-state callback is rejected while a later valid callback succeeds", async () => {
  let calls = 0;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    fetch: async () => {
      calls++;
      return new Response(
        JSON.stringify({
          access_token: "safe-access",
          refresh_token: "safe-refresh",
          expires_in: 3600,
        }),
      );
    },
    timeoutMs: 2000,
  });
  const pending = auth.connect(async ({ redirectUri, authorizationUrl }) => {
    const url = new URL(redirectUri);
    const invalid = await fetch(
      `${url.origin}${url.pathname}?code=private-code&state=wrong`,
    );
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);
    const state = new URL(authorizationUrl).searchParams.get("state");
    await fetch(`${redirectUri}?code=valid-code&state=${state}`);
  });
  await pending;
  assert.equal(calls, 1);
});

test("PKCE callback exchanges then refreshes without disclosing secrets in errors", async () => {
  const requests: URLSearchParams[] = [];
  let persisted: string | null = null;
  const auth = createSpotifyAuth({
    clientId: "public-id",
    timeoutMs: 2000,
    keyring: {
      load: async () => persisted,
      save: async (token) => {
        persisted = token;
        return true;
      },
      clear: async () => {
        persisted = null;
      },
    },
    fetch: async (_url, init) => {
      requests.push(new URLSearchParams(init?.body as string));
      return new Response(
        JSON.stringify({
          access_token: "secret-access",
          refresh_token: "secret-refresh",
          expires_in: 1,
        }),
        { status: 200 },
      );
    },
  });
  const result = await auth.connect(({ authorizationUrl, redirectUri }) => {
    const url = new URL(authorizationUrl);
    assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.deepEqual(url.searchParams.get("scope")?.split(" "), [
      "user-read-playback-state",
      "user-modify-playback-state",
    ]);
    const callback = new URL(redirectUri);
    fetch(
      `${callback.origin}${callback.pathname}?code=private-code&state=${url.searchParams.get("state")}`,
    ).catch(() => {});
  });
  assert.equal(result.persistenceAvailable, true);
  assert.ok(requests[0]?.get("code_verifier"));
  assert.equal(requests[0]?.get("code"), "private-code");
  assert.equal(await auth.getAccessToken(), "secret-access");
  assert.equal(requests[1]?.get("grant_type"), "refresh_token");
  await auth.disconnect();
  assert.equal(await auth.getAccessToken(), null);
});
