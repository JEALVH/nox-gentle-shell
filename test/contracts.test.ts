import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {
  NOX_GENTLE_SHELL_COMMAND_NAME,
  NOX_GENTLE_SHELL_IDENTIFIERS,
  NOX_GENTLE_SHELL_SHORTCUTS,
  NOX_GENTLE_SHELL_STATUS_KEY,
  NOX_GENTLE_SHELL_WIDGET_KEY,
} from "../extensions/constants.js";

const projectPath = (...segments: string[]) =>
  path.resolve(__dirname, "..", ...segments);

test("tests use only public Pi package entry points", () => {
  const testSources = ["theme.test.ts", "manifest.test.ts"].map((file) =>
    fs.readFileSync(projectPath("test", file), "utf-8"),
  );

  for (const source of testSources) {
    assert.doesNotMatch(
      source,
      /@earendil-works\/pi-(?:coding-agent|tui)\/dist\//,
      "Tests must not depend on private Pi dist paths",
    );
  }
});

test("exports stable command, UI key, and shortcut values", () => {
  assert.strictEqual(NOX_GENTLE_SHELL_COMMAND_NAME, "nox-gentle-shell");
  assert.strictEqual(NOX_GENTLE_SHELL_STATUS_KEY, "nox-gentle-shell.status");
  assert.strictEqual(NOX_GENTLE_SHELL_WIDGET_KEY, "nox-gentle-shell.widget");
  assert.deepStrictEqual(NOX_GENTLE_SHELL_SHORTCUTS, {
    cycleMode: {
      identifier: "nox-gentle-shell.shortcut.cycle-mode",
      key: "ctrl+alt+t",
    },
    toggleHeader: {
      identifier: "nox-gentle-shell.shortcut.toggle-header",
      key: "ctrl+alt+h",
    },
  });
});

test("extension identifiers cannot collide or escape the namespace", () => {
  assert.strictEqual(
    new Set(NOX_GENTLE_SHELL_IDENTIFIERS).size,
    NOX_GENTLE_SHELL_IDENTIFIERS.length,
    "Extension identifiers must remain unique",
  );

  const ownsIdentifier = (identifier: string) =>
    identifier === NOX_GENTLE_SHELL_COMMAND_NAME ||
    identifier.startsWith(`${NOX_GENTLE_SHELL_COMMAND_NAME}.`);

  for (const identifier of NOX_GENTLE_SHELL_IDENTIFIERS) {
    assert.ok(
      ownsIdentifier(identifier),
      `Extension identifier must be namespaced: ${identifier}`,
    );
  }

  assert.strictEqual(
    ownsIdentifier("nox-gentle-shell-other"),
    false,
    "Lookalike identifiers must not pass the namespace boundary",
  );

  const shortcutKeys = Object.values(NOX_GENTLE_SHELL_SHORTCUTS).map(
    (shortcut) => shortcut.key,
  );
  assert.strictEqual(
    new Set(shortcutKeys).size,
    shortcutKeys.length,
    "Shortcut values must remain distinct",
  );
});

test("declares the Pi 0.85.1 compatibility baseline", () => {
  const manifest = JSON.parse(
    fs.readFileSync(projectPath("package.json"), "utf-8"),
  ) as { peerDependencies: Record<string, string> };

  assert.strictEqual(
    manifest.peerDependencies["@earendil-works/pi-coding-agent"],
    "^0.85.1",
  );
  assert.strictEqual(
    manifest.peerDependencies["@earendil-works/pi-tui"],
    "^0.85.1",
  );
});
