import test from "node:test";
import assert from "node:assert/strict";
import visualLayerExtension from "../extensions/visual-layer.js";
import {
  NOX_GENTLE_SHELL_COMMAND_NAME,
  NOX_GENTLE_SHELL_SHORTCUTS,
  NOX_GENTLE_SHELL_STATUS_KEY,
  NOX_GENTLE_SHELL_WIDGET_KEY,
} from "../extensions/constants.js";

type RegisteredCommand = { name: string; options: { handler: Function } };
type RegisteredShortcut = { key: string; options: { handler: Function } };

function createExtensionRegistration() {
  const handlers = new Map<string, Function[]>();
  const commands: RegisteredCommand[] = [];
  const shortcuts: RegisteredShortcut[] = [];
  const mockPi = {
    on: (event: string, handler: Function) => {
      const current = handlers.get(event) ?? [];
      current.push(handler);
      handlers.set(event, current);
    },
    registerCommand: (name: string, options: { handler: Function }) => {
      commands.push({ name, options });
    },
    registerShortcut: (key: string, options: { handler: Function }) => {
      shortcuts.push({ key, options });
    },
  };

  visualLayerExtension(mockPi as never);
  return { handlers, commands, shortcuts };
}

function createContext(mode: "tui" | "print" = "tui") {
  const calls: Array<[string, ...unknown[]]> = [];
  return {
    calls,
    ctx: {
      mode,
      hasUI: mode === "tui",
      model: { provider: "nox", id: "nox-model" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({
        tokens: 420,
        contextWindow: 1_000,
        percent: 42,
      }),
      ui: {
        setHeader: (...args: unknown[]) => calls.push(["header", ...args]),
        setStatus: (...args: unknown[]) => calls.push(["status", ...args]),
        setWidget: (...args: unknown[]) => calls.push(["widget", ...args]),
        setWorkingMessage: (...args: unknown[]) =>
          calls.push(["workingMessage", ...args]),
        setWorkingIndicator: (...args: unknown[]) =>
          calls.push(["workingIndicator", ...args]),
        notify: (...args: unknown[]) => calls.push(["notify", ...args]),
      },
    },
  };
}

test("registers one namespaced command, accepted shortcuts, and telemetry lifecycle handlers", () => {
  const { handlers, commands, shortcuts } = createExtensionRegistration();

  assert.deepEqual(
    commands.map((command) => command.name),
    [NOX_GENTLE_SHELL_COMMAND_NAME],
  );
  assert.deepEqual(
    shortcuts.map((shortcut) => shortcut.key),
    [
      NOX_GENTLE_SHELL_SHORTCUTS.cycleMode.key,
      NOX_GENTLE_SHELL_SHORTCUTS.toggleHeader.key,
    ],
  );
  for (const event of [
    "session_start",
    "session_shutdown",
    "message_start",
    "message_update",
    "message_end",
    "turn_start",
    "turn_end",
    "model_select",
    "session_compact",
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
  ]) {
    assert.equal(handlers.get(event)?.length, 1, `register ${event}`);
  }
});

test("registered command is inert in print mode", async () => {
  const { commands } = createExtensionRegistration();
  const { ctx, calls } = createContext("print");

  const command = commands[0]!;
  await command.options.handler("detailed", ctx as never);
  await command.options.handler("", ctx as never);

  assert.deepEqual(calls, []);
});

test("session shutdown restores every owned TUI surface and remains safe when repeated", () => {
  const { handlers } = createExtensionRegistration();
  const { ctx, calls } = createContext();
  const start = handlers.get("session_start")?.[0]!;
  const shutdown = handlers.get("session_shutdown")?.[0]!;

  start({}, ctx as never);
  calls.length = 0;
  shutdown({}, ctx as never);

  assert.deepEqual(calls, [
    ["status", NOX_GENTLE_SHELL_STATUS_KEY, undefined],
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY, undefined],
    ["header", undefined],
    ["workingMessage"],
    ["workingIndicator"],
  ]);

  calls.length = 0;
  shutdown({}, ctx as never);
  assert.deepEqual(calls, [
    ["status", NOX_GENTLE_SHELL_STATUS_KEY, undefined],
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY, undefined],
    ["header", undefined],
    ["workingMessage"],
    ["workingIndicator"],
  ]);
});
