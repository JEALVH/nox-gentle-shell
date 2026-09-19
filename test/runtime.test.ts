import test from "node:test";
import assert from "node:assert/strict";
import { createVisualController } from "../extensions/runtime.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  NOX_GENTLE_SHELL_STATUS_KEY,
  NOX_GENTLE_SHELL_WIDGET_KEY,
} from "../extensions/constants.js";

const SINGLETON_UI_SURFACES = new Set([
  "header",
  "workingMessage",
  "workingIndicator",
]);

function createContext(mode: "tui" | "rpc" | "json" | "print" = "tui") {
  const calls: Array<[string, ...unknown[]]> = [];
  let entries: unknown[] = [];
  const ui = {
    setHeader: (...args: unknown[]) => calls.push(["header", ...args]),
    setStatus: (...args: unknown[]) => calls.push(["status", ...args]),
    setWidget: (...args: unknown[]) => calls.push(["widget", ...args]),
    setWorkingMessage: (...args: unknown[]) =>
      calls.push(["workingMessage", ...args]),
    setWorkingIndicator: (...args: unknown[]) =>
      calls.push(["workingIndicator", ...args]),
    notify: (...args: unknown[]) => calls.push(["notify", ...args]),
  };

  return {
    calls,
    ctx: {
      mode,
      hasUI: mode === "tui" || mode === "rpc",
      ui,
      model: { provider: "nox", id: "nox-model" },
      sessionManager: { getEntries: () => entries },
      getContextUsage: () => ({
        tokens: 420,
        contextWindow: 1_000,
        percent: 42,
      }),
    },
    setEntries: (next: unknown[]) => {
      entries = next;
    },
  };
}

test("controller starts compact TUI UI with namespaced telemetry only", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();

  controller.start(ctx as never);

  assert.deepEqual(
    calls.find((call) => call[0] === "status"),
    [
      "status",
      NOX_GENTLE_SHELL_STATUS_KEY,
      "◉ 42% · ↑ 0 · ↓ 0 · ◇ 0 · $ 0.00 · ⚙ 0",
    ],
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "widget"),
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY, undefined],
  );
  assert.ok(calls.every(([surface]) => !SINGLETON_UI_SURFACES.has(surface)));
});

test("controller uses only RPC-compatible UI and leaves no-UI modes untouched", () => {
  const rpc = createContext("rpc");
  createVisualController().start(rpc.ctx as never);

  assert.ok(rpc.calls.some((call) => call[0] === "status"));
  assert.ok(rpc.calls.some((call) => call[0] === "widget"));
  assert.ok(!rpc.calls.some((call) => call[0] === "header"));
  assert.ok(!rpc.calls.some((call) => call[0].startsWith("working")));

  const noUi = createContext("json");
  createVisualController().start(noUi.ctx as never);
  assert.deepEqual(noUi.calls, []);
});

test("commands and shortcuts cycle modes and reject invalid input without changing state", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);

  controller.runCommand("detailed", ctx as never);
  assert.equal(controller.state.mode, "detailed");
  controller.runCommand("off", ctx as never);
  assert.equal(controller.state.mode, "off");
  controller.runCommand("compact", ctx as never);
  assert.equal(controller.state.mode, "compact");

  controller.cycleMode(ctx as never);
  assert.equal(controller.state.mode, "detailed");
  assert.deepEqual(
    calls
      .filter((call) => call[0] === "widget")
      .at(-1)
      ?.slice(0, 2),
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY],
  );
  controller.cycleMode(ctx as never);
  assert.equal(controller.state.mode, "off");
  controller.cycleMode(ctx as never);
  assert.equal(controller.state.mode, "compact");

  controller.runCommand("status", ctx as never);
  assert.match(String(calls.at(-1)?.[1]), /Nox mode: compact/);

  const previous = { ...controller.state };
  controller.runCommand("unknown", ctx as never);
  assert.deepEqual(controller.state, previous);
  assert.deepEqual(calls.at(-1), [
    "notify",
    "⚠ Usage: /nox-gentle-shell [compact|detailed|off|status]",
    "warning",
  ]);
});

test("refreshes finalized telemetry and reduces interleaved concurrent tool lifecycles", () => {
  const { ctx, calls, setEntries } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  setEntries([
    {
      type: "message",
      message: {
        role: "assistant",
        usage: {
          input: 12,
          output: 3,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
        },
      },
    },
  ]);
  controller.refresh(ctx as never);
  assert.match(
    String(calls.filter((call) => call[0] === "status").at(-1)?.[2]),
    /↑ 12/,
  );

  controller.updateTools(
    { type: "start", toolCallId: "one", toolName: "read" },
    ctx as never,
  );
  controller.updateTools(
    { type: "start", toolCallId: "two", toolName: "bash" },
    ctx as never,
  );
  controller.updateTools(
    { type: "update", toolCallId: "one", toolName: "read" },
    ctx as never,
  );
  controller.updateTools(
    { type: "end", toolCallId: "two", toolName: "bash" },
    ctx as never,
  );
  assert.match(
    String(calls.filter((call) => call[0] === "status").at(-1)?.[2]),
    /⚙ 1/,
  );
  controller.updateTools(
    { type: "end", toolCallId: "one", toolName: "read" },
    ctx as never,
  );
  assert.equal(Object.keys(controller.state.activeTools).length, 0);
});

test("detailed TUI widgets render every Unicode model line within the terminal width", () => {
  const { ctx, calls } = createContext();
  ctx.model = { provider: "nox", id: "模型👨‍👩‍👧‍👦-with-a-very-long-label" };
  const controller = createVisualController();

  controller.start(ctx as never);
  controller.setMode("detailed", ctx as never);

  const widget = calls.filter((call) => call[0] === "widget").at(-1);
  assert.equal(typeof widget?.[2], "function");
  const component = (widget?.[2] as Function)(
    {},
    { fg: (_color: string, text: string) => text },
  );
  const lines = component.render(12);
  assert.ok(lines.every((line: string) => visibleWidth(line) <= 12));
  assert.ok(lines.some((line: string) => line.includes("model")));
});

test("detailed RPC widgets remain public string arrays at a deterministic fallback width", () => {
  const { ctx, calls } = createContext("rpc");
  ctx.model = { provider: "nox", id: "模型👨‍👩‍👧‍👦-with-a-very-long-label" };
  const controller = createVisualController();

  controller.start(ctx as never);
  controller.setMode("detailed", ctx as never);

  const widget = calls.filter((call) => call[0] === "widget").at(-1);
  assert.ok(Array.isArray(widget?.[2]));
  assert.ok(
    (widget?.[2] as string[]).every((line) => visibleWidth(line) <= 120),
  );
});

test("print and JSON modes never issue visual calls, even after commands", () => {
  for (const mode of ["print", "json"] as const) {
    const { ctx, calls } = createContext(mode);
    const controller = createVisualController();

    controller.start(ctx as never);
    controller.runCommand("detailed", ctx as never);
    controller.runCommand("off", ctx as never);

    assert.deepEqual(calls, [], `${mode} must remain visually inert`);
  }
});

test("session replacement clears detailed telemetry before a fresh compact session starts", () => {
  const oldSession = createContext();
  oldSession.ctx.model = { provider: "old", id: "old-model" };
  const oldController = createVisualController();
  oldController.start(oldSession.ctx as never);
  oldController.updateTools(
    { type: "start", toolCallId: "stale", toolName: "bash" },
    oldSession.ctx as never,
  );
  oldController.setMode("detailed", oldSession.ctx as never);
  oldController.cleanup(oldSession.ctx as never);

  assert.deepEqual(oldController.state, {
    mode: "compact",
    activeTools: {},
    telemetry: undefined,
    model: undefined,
  });

  const freshSession = createContext();
  freshSession.ctx.model = { provider: "fresh", id: "fresh-model" };
  const freshController = createVisualController();
  freshController.start(freshSession.ctx as never);

  assert.equal(freshController.state.mode, "compact");
  assert.equal(freshController.state.model, "fresh/fresh-model");
  assert.deepEqual(freshController.state.activeTools, {});
  assert.equal(
    freshSession.calls.filter((call) => call[0] === "widget").at(-1)?.[2],
    undefined,
  );
});

test("cleanup is idempotent and clears only namespaced UI surfaces", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  controller.cleanup(ctx as never);
  controller.cleanup(ctx as never);
  assert.equal(controller.state.mode, "compact");
  assert.ok(
    calls.filter((call) => call[0] === "status" && call[2] === undefined)
      .length >= 2,
  );
  assert.ok(calls.every(([surface]) => !SINGLETON_UI_SURFACES.has(surface)));
});

test("bare command reports current state and concise usage through one info notification", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  const initialState = { ...controller.state };
  calls.length = 0;

  controller.runCommand("", ctx as never);

  assert.deepEqual(controller.state, initialState);
  assert.deepEqual(calls, [
    [
      "notify",
      "ℹ Nox mode: compact; telemetry: available; active tools: 0. Usage: /nox-gentle-shell [compact|detailed|off|status]",
      "info",
    ],
  ]);
});

test("explicit status remains useful through one info notification", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  calls.length = 0;

  controller.runCommand("status", ctx as never);

  assert.deepEqual(calls, [
    [
      "notify",
      "ℹ Nox mode: compact; telemetry: available; active tools: 0",
      "info",
    ],
  ]);
});

test("missing and extra command arguments notify without changing visual state", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  const initialState = { ...controller.state };
  const invalidArguments = [
    "compact extra",
    "status extra",
    "header show",
    "unknown option",
  ];

  for (const args of invalidArguments) {
    calls.length = 0;
    controller.runCommand(args, ctx as never);
    assert.deepEqual(
      controller.state,
      initialState,
      args || "missing argument",
    );
    assert.deepEqual(calls, [
      [
        "notify",
        "⚠ Usage: /nox-gentle-shell [compact|detailed|off|status]",
        "warning",
      ],
    ]);
  }
});

test("off clears every owned surface and cleanup drops stale telemetry and active tools", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  controller.updateTools(
    { type: "start", toolCallId: "stale", toolName: "read" },
    ctx as never,
  );
  calls.length = 0;

  controller.setMode("off", ctx as never);
  assert.deepEqual(calls, [
    ["status", NOX_GENTLE_SHELL_STATUS_KEY, undefined],
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY, undefined],
  ]);

  calls.length = 0;
  controller.cleanup(ctx as never);
  assert.deepEqual(calls, [
    ["status", NOX_GENTLE_SHELL_STATUS_KEY, undefined],
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY, undefined],
  ]);
  assert.deepEqual(controller.state, {
    mode: "compact",
    activeTools: {},
    telemetry: undefined,
    model: undefined,
  });
});

test("start, refresh, off, and shutdown never call singleton UI APIs", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();

  controller.start(ctx as never);
  controller.refresh(ctx as never);
  controller.setMode("off", ctx as never);
  controller.cleanup(ctx as never);

  assert.ok(calls.every(([surface]) => !SINGLETON_UI_SURFACES.has(surface)));
});
