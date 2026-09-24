import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clientFingerprint,
  durableSpotifyState,
} from "../extensions/spotify-state.js";

test("durable generation survives reconstruction and tombstones disconnect", () => {
  const home = mkdtempSync(join(tmpdir(), "nox-state-test-"));
  const a = durableSpotifyState("public-id", home);
  const first = a.reserve("connected");
  assert.equal(
    durableSpotifyState("public-id", home).read()?.generation,
    first.generation,
  );
  const tomb = a.reserve("disconnected");
  assert.notEqual(tomb.generation, first.generation);
  assert.equal(
    durableSpotifyState("public-id", home).read()?.status,
    "disconnected",
  );
  assert.equal(statSync(join(home, "nox-spotify-auth")).mode & 0o777, 0o700);
  assert.equal(
    statSync(
      join(
        home,
        "nox-spotify-auth",
        `credential-state-${clientFingerprint("public-id")}.json`,
      ),
    ).mode & 0o777,
    0o600,
  );
  assert.doesNotMatch(
    readFileSync(
      join(
        home,
        "nox-spotify-auth",
        `credential-state-${clientFingerprint("public-id")}.json`,
      ),
      "utf8",
    ),
    /refresh|access/,
  );
});

test("different clients retain independent metadata and corrupt metadata fails closed", () => {
  const home = mkdtempSync(join(tmpdir(), "nox-state-test-"));
  const first = durableSpotifyState("first", home);
  const second = durableSpotifyState("second", home);
  const connected = first.reserve("connected");
  second.reserve("disconnected");
  assert.deepEqual(first.read(), connected);
  assert.equal(second.read()?.status, "disconnected");
});

test("newer logout intent fences stale commits and denies old credential", () => {
  const home = mkdtempSync(join(tmpdir(), "nox-state-test-"));
  const state = durableSpotifyState("public-id", home);
  const login = state.reserveIntent("login");
  assert.equal(state.commitIntent(login.generation, "connected"), true);
  assert.equal(state.isCurrent(login.generation), true);
  const logout = state.reserveIntent("logout");
  assert.equal(state.isCurrent(login.generation), false);
  assert.equal(state.read()?.status, "connected");
  assert.equal(state.commitIntent(login.generation, "connected"), false);
  assert.equal(state.commitIntent(logout.generation, "disconnected"), true);
  assert.equal(state.isCurrent(logout.generation), false);
});

test("two reservations fence the first, and malformed metadata fails closed", () => {
  const home = mkdtempSync(join(tmpdir(), "nox-state-test-"));
  const first = durableSpotifyState("first", home);
  const other = durableSpotifyState("other", home);
  const prior = first.reserveIntent("login");
  const latest = first.reserveIntent("refresh");
  assert.equal(first.commitIntent(prior.generation, "connected"), false);
  assert.equal(first.commitIntent(latest.generation, "connected"), true);
  assert.equal(other.read(), null);
  const path = join(
    home,
    "nox-spotify-auth",
    `credential-state-${clientFingerprint("first")}.json`,
  );
  writeFileSync(
    path,
    JSON.stringify({
      ...first.read(),
      intent: { generation: "bad", operation: "logout" },
    }),
  );
  assert.throws(() => first.read(), /unavailable/);
  assert.throws(() => first.reserveIntent("login"), /unavailable/);
});

test("absent configured root initializes durable state", () => {
  const root = join(mkdtempSync(join(tmpdir(), "nox-state-test-")), "state");
  const state = durableSpotifyState("public-id", root);
  assert.doesNotThrow(() => state.reserve("connected"));
});

test("absent state never implies a connected credential", () => {
  const home = mkdtempSync(join(tmpdir(), "nox-state-test-"));
  assert.equal(durableSpotifyState("public-id", home).read(), null);
});
