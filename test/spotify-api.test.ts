import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSpotifyApi,
  SpotifyApiError,
} from "../extensions/spotify-api.js";

test("active playback 204 and controls never select a device", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const api = createSpotifyApi({
    auth: { getAccessToken: async () => "token" },
    fetch: async (url, init) => {
      calls.push([String(url), init]);
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(await api.getPlayback(), null);
  await api.play();
  await api.pause();
  await api.next();
  await api.previous();
  assert.deepEqual(
    calls.map(([url]) => new URL(url).pathname),
    [
      "/v1/me/player",
      "/v1/me/player/play",
      "/v1/me/player/pause",
      "/v1/me/player/next",
      "/v1/me/player/previous",
    ],
  );
  assert.ok(calls.every(([url]) => !url.includes("device_id")));
});

test("401 retries once with a fresh credential for GET and controls", async () => {
  for (const method of ["getPlayback", "play"] as const) {
    const seen: string[] = [];
    let forced = 0;
    const api = createSpotifyApi({
      auth: {
        getAccessToken: async () => (forced ? "fresh" : "stale"),
        refreshRejectedToken: async (rejected: string) => {
          assert.equal(rejected, "stale");
          forced++;
          return "fresh";
        },
      },
      fetch: async (_url, init) => {
        seen.push(
          String((init?.headers as Record<string, string>).Authorization),
        );
        return new Response(null, { status: seen.length === 1 ? 401 : 204 });
      },
    });
    await api[method]();
    assert.deepEqual(seen, ["Bearer stale", "Bearer fresh"]);
    assert.equal(forced, 1);
  }
});

test("repeated 401 and other failures never replay beyond the bounded recovery", async () => {
  for (const status of [401, 403, 429, 0]) {
    let calls = 0;
    let forced = 0;
    const api = createSpotifyApi({
      auth: {
        getAccessToken: async () => "private-stale",
        refreshRejectedToken: async () => {
          forced++;
          return "private-fresh";
        },
      },
      fetch: async () => {
        calls++;
        if (status === 0) throw new Error("private-network-url");
        return new Response("private-body", { status });
      },
    });
    await assert.rejects(api.getPlayback(), (error: unknown) => {
      assert.doesNotMatch(
        String(error),
        /private-stale|private-fresh|private-body|private-network-url/,
      );
      return true;
    });
    assert.equal(calls, status === 401 ? 2 : 1);
    assert.equal(forced, status === 401 ? 1 : 0);
  }
});

test("unauthorized, forbidden, and bounded throttling are typed and secret free", async () => {
  for (const status of [401, 403, 429]) {
    const api = createSpotifyApi({
      auth: { getAccessToken: async () => "secret-token" },
      fetch: async () =>
        new Response("secret-token", {
          status,
          headers: { "Retry-After": "999999" },
        }),
    });
    await assert.rejects(api.getPlayback(), (error: unknown) => {
      assert.ok(error instanceof SpotifyApiError);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes("secret-token"));
      if (status === 429) assert.equal(error.retryAfterMs, 999_999_000);
      return true;
    });
  }
});
