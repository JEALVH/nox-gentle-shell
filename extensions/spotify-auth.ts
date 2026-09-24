import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import type { Writable, Readable } from "node:stream";
import type { EventEmitter } from "node:events";
import {
  clientFingerprint,
  durableSpotifyState,
  type SpotifyState,
} from "./spotify-state.js";
import {
  CredentialLeaseLost,
  CredentialLockUnavailable,
  linuxCredentialLease,
  type CredentialLease,
} from "./spotify-lock.js";

export type SpotifyAuthCategory =
  | "token_http"
  | "token_transport"
  | "token_response"
  | "coordination"
  | "persistence_uncertain"
  | "cancelled"
  | "timeout"
  | "unknown";
export type SpotifyAuthDiagnostic = {
  category: SpotifyAuthCategory;
  status?: number;
};
class SpotifyAuthFailure extends Error {
  constructor(readonly diagnostic: SpotifyAuthDiagnostic) {
    super(
      {
        cancelled: "Spotify connection cancelled",
        timeout: "Spotify connection timed out",
        token_response:
          "Spotify token response missing refresh token or invalid",
        persistence_uncertain: "Spotify credential persistence UNCERTAIN",
        token_http: "Spotify token endpoint HTTP failure",
        token_transport: "Spotify token transport failure",
        coordination: "Spotify credential coordination unavailable",
        unknown: "Spotify authorization failed",
      }[diagnostic.category],
    );
  }
}
export function spotifyAuthDiagnostic(error: unknown): SpotifyAuthDiagnostic {
  return error instanceof SpotifyAuthFailure
    ? error.diagnostic
    : { category: "unknown" };
}

export interface RefreshKeyring {
  load(): Promise<string | null>;
  save(token: string): Promise<boolean>;
  clear(): Promise<void>;
}

// secret-tool accepts secrets on stdin; never pass a token as an argument or shell command.
export function linuxSecretKeyring(
  spawnProcess: (
    command: string,
    args: string[],
    options: { stdio: ["pipe", "pipe", "ignore"] },
  ) => EventEmitter & { stdin: Writable; stdout: Readable } = (
    command,
    args,
    options,
  ) => spawn(command, args, { stdio: options.stdio }),
  clientId = process.env.SPOTIFY_CLIENT_ID ?? "",
): RefreshKeyring {
  const args = [
    "service",
    "nox-spotify-connect",
    "account",
    clientFingerprint(clientId),
  ];
  const run = (
    command: string,
    input?: string,
  ): Promise<{ code: number; output: string }> =>
    new Promise((resolve) => {
      if (process.platform !== "linux") return resolve({ code: 1, output: "" });
      const child = spawnProcess(
        "secret-tool",
        command === "store"
          ? [command, "--label=Spotify Connect for Nox", ...args]
          : [command, ...args],
        {
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
      let output = "";
      let timedOut = false;
      let finished = false;
      const complete = (code: number, value = "") => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ code, output: value });
      };
      const timer = setTimeout(() => {
        timedOut = true;
        (child as { kill?: () => void }).kill?.();
        // Do not release the credential lease until the subprocess has closed.
      }, 8000);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.on("error", () => complete(1));
      child.on("close", (code) => complete(timedOut ? 1 : (code ?? 1), output));
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
  return {
    async load() {
      const result = await run("lookup");
      return result.code === 0 ? result.output.trimEnd() || null : null;
    },
    async save(token) {
      return (await run("store", token)).code === 0;
    },
    async clear() {
      if (process.platform !== "linux") return;
      if ((await run("clear")).code !== 0)
        throw new Error(
          "Spotify keyring credential removal failed; credential may remain. Revoke Spotify access or remove it manually.",
        );
    },
  };
}

export interface SpotifyAuthOptions {
  clientId?: string;
  fetch?: typeof fetch;
  keyring?: RefreshKeyring;
  timeoutMs?: number;
  lease?: CredentialLease;
  intentLease?: CredentialLease;
  state?: SpotifyState;
}
export interface AuthorizationRequest {
  authorizationUrl: string;
  redirectUri: string;
}
export interface SpotifyAuth {
  connect(
    open: (request: AuthorizationRequest) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<{ persistenceAvailable: boolean }>;
  getAccessToken(signal?: AbortSignal): Promise<string | null>;
  refreshRejectedToken?(
    rejected: string,
    signal?: AbortSignal,
  ): Promise<string | null>;
  disconnect(): Promise<void>;
  cancelPending?(): void;
  readonly persistenceAvailable: boolean;
}

export function createSpotifyAuth(
  options: SpotifyAuthOptions = {},
): SpotifyAuth {
  const clientId = options.clientId ?? process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is required");
  const request = options.fetch ?? fetch;
  const keyring = options.keyring ?? linuxSecretKeyring(undefined, clientId);
  const lease = options.lease ?? linuxCredentialLease();
  if (
    options.lease &&
    (!options.intentLease || options.intentLease === options.lease)
  )
    throw new Error(
      "An independent intentLease is required with a custom credential lease",
    );
  const intentLease =
    options.intentLease ?? linuxCredentialLease(5000, clientId);
  const state = options.state ?? durableSpotifyState(clientId);
  const intentState = state as Required<
    Pick<SpotifyState, "reserveIntent" | "commitIntent">
  > &
    SpotifyState;
  const reserveIntent = (operation: "login" | "refresh" | "logout") =>
    intentLease.run(() =>
      Promise.resolve(intentState.reserveIntent(operation)),
    );
  const currentIntent = (id: string) => state.read()?.intent?.generation === id;
  const guarded = (id: string, operation: () => boolean) =>
    intentLease.run(() => Promise.resolve(currentIntent(id) && operation()));
  const client = clientFingerprint(clientId);
  const decode = (
    value: string | null,
    current: ReturnType<SpotifyState["read"]>,
  ) => {
    if (
      !value ||
      !current ||
      current.status !== "connected" ||
      current.intent?.operation === "logout" ||
      (current.intent &&
        current.intent.generation !== current.generation &&
        current.intent.operation !== "refresh")
    )
      return null;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== "object") return null;
      const record = parsed as Record<string, unknown>;
      if (
        record.version !== 1 ||
        record.client !== client ||
        record.generation !== current.generation ||
        typeof record.refresh !== "string" ||
        !record.refresh ||
        Object.keys(record).length !== 4
      )
        return null;
      return record.refresh;
    } catch {
      return null;
    }
  };
  const envelope = (token: string, id: string) =>
    JSON.stringify({ version: 1, client, generation: id, refresh: token });
  let access: string | null = null;
  let refresh: string | null = null;
  let expires = 0;
  let persistenceAvailable = false;
  let memoryOnly = false;
  let memoryOwner: string | undefined;
  let persistedOwner: string | undefined;
  let generation = 0;
  let refreshing: Promise<string | null> | undefined;
  let mutations: Promise<void> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutations.then(operation);
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const pendingCallbacks = new Set<() => void>();
  const exchanges = new Set<AbortController>();
  const cancelPending = () => {
    ++generation;
    for (const cancel of pendingCallbacks) cancel();
    for (const controller of exchanges) controller.abort();
  };

  async function exchange(
    body: URLSearchParams,
    version: number,
    signal?: AbortSignal,
    persist = true,
    intent?: string,
  ): Promise<boolean> {
    const controller = new AbortController();
    exchanges.add(controller);
    let firstAbort: "timeout" | "cancelled" | undefined;
    let rejectAbort!: (reason: SpotifyAuthFailure) => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const recordAbort = (category: "timeout" | "cancelled") => {
      if (firstAbort) return;
      firstAbort = category;
      controller.abort();
      rejectAbort(new SpotifyAuthFailure({ category }));
    };
    const abort = () => recordAbort("cancelled");
    controller.signal.addEventListener("abort", abort, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    const deadline = setTimeout(() => recordAbort("timeout"), 15000);
    if (signal?.aborted || controller.signal.aborted) abort();
    let data: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    try {
      data = await Promise.race([
        (async () => {
          let response: Response;
          try {
            response = await request("https://accounts.spotify.com/api/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
              signal: controller.signal,
            });
          } catch {
            throw new SpotifyAuthFailure({ category: "token_transport" });
          }
          if (!response.ok)
            throw new SpotifyAuthFailure({
              category: "token_http",
              ...(Number.isInteger(response.status) &&
              response.status >= 100 &&
              response.status <= 599
                ? { status: response.status }
                : {}),
            });
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            throw new SpotifyAuthFailure({ category: "token_response" });
          }
          if (!payload || typeof payload !== "object")
            throw new SpotifyAuthFailure({ category: "token_response" });
          const fields = payload as Record<string, unknown>;
          if (
            typeof fields.access_token !== "string" ||
            !fields.access_token ||
            (fields.refresh_token !== undefined &&
              (typeof fields.refresh_token !== "string" ||
                !fields.refresh_token)) ||
            typeof fields.expires_in !== "number" ||
            !Number.isFinite(fields.expires_in) ||
            fields.expires_in <= 0
          )
            throw new SpotifyAuthFailure({ category: "token_response" });
          return fields as unknown as typeof data;
        })(),
        aborted,
      ]);
      if (firstAbort) throw new SpotifyAuthFailure({ category: firstAbort });
    } catch (error) {
      if (firstAbort || version !== generation)
        throw new SpotifyAuthFailure({ category: firstAbort ?? "cancelled" });
      if (error instanceof SpotifyAuthFailure) throw error;
      throw new SpotifyAuthFailure({ category: "token_transport" });
    } finally {
      exchanges.delete(controller);
      clearTimeout(deadline);
      controller.signal.removeEventListener("abort", abort);
      signal?.removeEventListener("abort", abort);
    }
    const payload = data;
    if (
      version !== generation ||
      signal?.aborted ||
      controller.signal.aborted ||
      (intent && !currentIntent(intent))
    )
      return false;
    const nextRefresh =
      data.refresh_token ??
      (body.get("grant_type") === "refresh_token" ? refresh : null);
    if (!nextRefresh) {
      // A code grant cannot inherit a previous login's refresh credential.
      // Tombstone only our own intent, leaving any newer login untouched.
      if (intent)
        await guarded(intent, () =>
          intentState.commitIntent(intent, "disconnected"),
        );
      access = refresh = null;
      expires = 0;
      persistenceAvailable = false;
      memoryOnly = false;
      memoryOwner = persistedOwner = undefined;
      throw new SpotifyAuthFailure({ category: "token_response" });
    }
    access = payload.access_token!;
    expires = Date.now() + data.expires_in! * 1000;
    refresh = nextRefresh;
    if (!persist) {
      memoryOnly = true;
      memoryOwner = intent;
      persistenceAvailable = false;
      return version === generation && !signal?.aborted;
    }
    try {
      const token = refresh;
      const persisted = await serialize(async () => {
        if (version !== generation || signal?.aborted) return false;
        if (signal?.aborted) return false;
        // Durable reservation precedes the external write: a late save may overwrite
        // the keyring, but cannot match a subsequent tombstone or generation.
        if (intent && !currentIntent(intent)) return false;
        const reserved = intent
          ? intent
          : state.reserve("connected").generation;
        let saved = false;
        try {
          saved = await keyring.save(envelope(token, reserved));
        } catch {
          // A rejected store may already have reached the keyring service.
        }
        const committed = intent
          ? await guarded(
              intent,
              () => saved && intentState.commitIntent(intent, "connected"),
            )
          : saved && state.read()?.generation === reserved;
        if (!saved || !committed || version !== generation || signal?.aborted) {
          if (intent && currentIntent(intent))
            await guarded(intent, () =>
              intentState.commitIntent(intent, "disconnected"),
            );
          else if (!intent) state.reserve("disconnected");
          access = refresh = null;
          expires = 0;
          persistenceAvailable = false;
          if (!saved)
            throw new SpotifyAuthFailure({ category: "persistence_uncertain" });
          return false;
        }
        return true;
      });
      if (version !== generation || signal?.aborted) return false;
      persistenceAvailable = persisted;
      if (persisted) persistedOwner = intent ?? state.read()?.generation;
      memoryOnly = !persisted;
      memoryOwner = persisted ? undefined : intent;
    } catch (error) {
      if (
        error instanceof SpotifyAuthFailure &&
        error.diagnostic.category === "persistence_uncertain"
      )
        throw error;
      if (
        error instanceof Error &&
        /credential state unavailable/.test(error.message)
      )
        throw new SpotifyAuthFailure({ category: "coordination" });
      persistenceAvailable = false;
      memoryOnly = true;
      memoryOwner = intent;
    }
    return (
      version === generation && !signal?.aborted && !controller.signal.aborted
    );
  }

  return {
    get persistenceAvailable() {
      return persistenceAvailable;
    },
    async connect(open, signal) {
      const version = ++generation;
      for (const cancel of pendingCallbacks) cancel();
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(64).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const server = createServer();
      const callback = "/spotify/callback";
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
          });
        });
        if (version !== generation || signal?.aborted)
          throw new SpotifyAuthFailure({ category: "cancelled" });
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Loopback listener unavailable");
        const redirectUri = `http://127.0.0.1:${address.port}${callback}`;
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: "user-read-playback-state user-modify-playback-state",
          state,
          code_challenge_method: "S256",
          code_challenge: challenge,
        });
        const abort = () =>
          rejectCode?.(new SpotifyAuthFailure({ category: "cancelled" }));
        let rejectCode: ((reason: Error) => void) | undefined;
        const code = await new Promise<string>((resolve, reject) => {
          rejectCode = reject;
          pendingCallbacks.add(abort);
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) return abort();
          timeout = setTimeout(
            () => reject(new SpotifyAuthFailure({ category: "timeout" })),
            options.timeoutMs ?? 120_000,
          );
          server.on("request", (req, res) => {
            const url = new URL(req.url ?? "/", redirectUri);
            if (
              req.method !== "GET" ||
              url.pathname !== callback ||
              req.headers.host !== `127.0.0.1:${address.port}`
            ) {
              res.writeHead(404).end();
              return;
            }
            const received = url.searchParams.get("state");
            const value = url.searchParams.get("code");
            if (received !== state || !value || url.searchParams.has("error")) {
              res.writeHead(400).end("Spotify connection rejected");
              if (received === state && url.searchParams.has("error"))
                reject(new Error("Spotify authorization denied or rejected"));
              return;
            }
            res
              .writeHead(200, { "Content-Type": "text/plain" })
              .end(
                "Authorization received. Return to Pi to confirm connection.",
              );
            resolve(value);
          });
          Promise.resolve()
            .then(() =>
              open({
                authorizationUrl: `https://accounts.spotify.com/authorize?${params}`,
                redirectUri,
              }),
            )
            .catch(reject);
        }).finally(() => {
          pendingCallbacks.delete(abort);
          signal?.removeEventListener("abort", abort);
        });
        if (version !== generation || signal?.aborted)
          throw new SpotifyAuthFailure({ category: "cancelled" });
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        });
        let accepted: boolean;
        let intent: string | undefined;
        try {
          try {
            intent = (await reserveIntent("login")).generation;
          } catch {
            throw new SpotifyAuthFailure({ category: "coordination" });
          }
          accepted = await lease.run((lockSignal) => {
            if (!currentIntent(intent!)) return Promise.resolve(false);
            return exchange(
              body,
              version,
              signal ? AbortSignal.any([signal, lockSignal]) : lockSignal,
              true,
              intent,
            );
          });
        } catch (error) {
          if (!(error instanceof CredentialLockUnavailable)) throw error;
          accepted = await exchange(body, version, signal, false, intent);
        }
        if (!accepted || version !== generation) {
          throw new SpotifyAuthFailure({ category: "cancelled" });
        }
        return { persistenceAvailable };
      } finally {
        if (timeout) clearTimeout(timeout);
        server.close();
      }
    },
    async getAccessToken(signal) {
      if (!refreshing) {
        const version = generation;
        refreshing = (async () => {
          let intent: string | undefined;
          const lookup = async (persist: boolean, lockSignal: AbortSignal) => {
            if (intent && !currentIntent(intent)) return null;
            if (version !== generation || signal?.aborted) return null;
            if (persist) {
              try {
                const current = state.read();
                const loaded =
                  current?.status === "connected" &&
                  current.intent?.operation !== "logout"
                    ? await keyring.load()
                    : null;
                if (
                  version !== generation ||
                  signal?.aborted ||
                  lockSignal.aborted
                )
                  return null;
                const latest = state.read();
                const verified =
                  latest?.intent?.operation === "logout"
                    ? null
                    : decode(loaded, latest);
                if (verified !== refresh) {
                  refresh = verified;
                  access = null;
                  expires = 0;
                }
                persistenceAvailable = verified !== null;
                persistedOwner =
                  verified === null ? undefined : latest?.generation;
                if (verified !== null) {
                  memoryOnly = false;
                  memoryOwner = undefined;
                }
              } catch {
                persistenceAvailable = false;
                // Durable metadata failure cannot authorize cached access.
                access = refresh = null;
                return null;
              }
            } else {
              persistenceAvailable = false;
            }
            if (access && Date.now() < expires - 30_000) return access;
            if (!refresh) return null;
            try {
              if (persist && !memoryOnly && !intent)
                intent = (await reserveIntent("refresh")).generation;
              if (intent && !currentIntent(intent)) return null;
              const accepted = await exchange(
                new URLSearchParams({
                  grant_type: "refresh_token",
                  refresh_token: refresh,
                  client_id: clientId,
                }),
                version,
                signal ? AbortSignal.any([signal, lockSignal]) : lockSignal,
                persist && !memoryOnly,
                intent,
              );
              return accepted && version === generation ? access : null;
            } catch (error) {
              if (
                error instanceof Error &&
                /UNCERTAIN|credential state unavailable/.test(error.message)
              )
                throw error;
              if (version === generation) access = null;
              return null;
            }
          };
          try {
            // Inspect under the credential lease, then release it before reserving
            // the refresh intent under the independent intent lease.
            const candidate = await lease.run(async (lockSignal) => {
              if (
                version !== generation ||
                signal?.aborted ||
                lockSignal.aborted
              )
                return null;
              const current = state.read();
              const loaded =
                current?.status === "connected" &&
                current.intent?.operation !== "logout"
                  ? await keyring.load()
                  : null;
              if (
                lockSignal.aborted ||
                version !== generation ||
                signal?.aborted
              )
                return null;
              const latest = state.read();
              const verified = decode(loaded, latest);
              persistedOwner =
                verified === null ? undefined : latest?.generation;
              if (verified !== refresh) {
                refresh = verified;
                access = null;
                expires = 0;
              }
              persistenceAvailable = verified !== null;
              if (verified !== null) {
                memoryOnly = false;
                memoryOwner = undefined;
              }
              if (access && Date.now() < expires - 30_000)
                return { cached: access };
              return verified ? { token: verified } : null;
            });
            if (!candidate) return null;
            if ("cached" in candidate) return candidate.cached ?? null;
            intent = (await reserveIntent("refresh")).generation;
            if (!currentIntent(intent)) return null;
            return await lease.run(async (lockSignal) => {
              if (
                lockSignal.aborted ||
                !currentIntent(intent!) ||
                version !== generation ||
                signal?.aborted
              )
                return null;
              const current = state.read();
              const loaded =
                current?.status === "connected" ? await keyring.load() : null;
              if (
                lockSignal.aborted ||
                !currentIntent(intent!) ||
                decode(loaded, state.read()) !== candidate.token
              )
                return null;
              return lookup(true, lockSignal);
            });
          } catch (error) {
            if (error instanceof CredentialLeaseLost) throw error;
            if (!(error instanceof CredentialLockUnavailable)) throw error;
            // No unlocked keyring access: only this process's already valid access remains.
            persistenceAvailable = false;
            return memoryOnly && access && Date.now() < expires - 30_000
              ? access
              : null;
          }
        })().finally(() => {
          refreshing = undefined;
        });
      }
      const candidate = await refreshing;
      if (!candidate || signal?.aborted) return null;
      // The short intent lease linearizes this grant against logout reservation.
      // Previously issued access tokens cannot be revoked by this check.
      try {
        return await intentLease.run(() => {
          const shared = state.read(); // unreadable metadata fails closed
          return Promise.resolve(
            !signal?.aborted &&
              shared !== null &&
              shared.intent?.operation !== "logout" &&
              (memoryOnly
                ? !!memoryOwner &&
                  shared.intent?.generation === memoryOwner &&
                  shared.intent.operation === "login"
                : !!persistedOwner &&
                  shared.status === "connected" &&
                  shared.generation === persistedOwner &&
                  shared.intent?.generation === persistedOwner)
              ? candidate
              : null,
          );
        });
      } catch {
        return null;
      }
    },
    async refreshRejectedToken(rejected, signal) {
      if (signal?.aborted || !rejected || access !== rejected) return null;
      access = null;
      expires = 0;
      return this.getAccessToken(signal);
    },
    cancelPending,
    async disconnect() {
      cancelPending();
      access = refresh = null;
      expires = 0;
      persistenceAvailable = false;
      memoryOnly = false;
      memoryOwner = undefined;
      // Publish logout immediately, before waiting on an in-flight credential lease.
      const intent = (await reserveIntent("logout")).generation;
      await serialize(() =>
        lease.run(async (lockSignal) => {
          if (lockSignal.aborted) throw new CredentialLeaseLost();
          if (!currentIntent(intent)) return;
          await keyring.clear();
          await guarded(intent, () =>
            intentState.commitIntent(intent, "disconnected"),
          );
        }),
      ).catch(() => {
        throw new Error(
          "Spotify keyring credential removal failed; credential may remain. Revoke Spotify access or remove it manually.",
        );
      });
    },
  };
}
