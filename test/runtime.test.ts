import test from "node:test";
import assert from "node:assert/strict";
import {
  createVisualController,
  LUNAR_WORKING_FRAMES,
  NOX_WORKING_INDICATOR,
} from "../extensions/runtime.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  NOX_GENTLE_SHELL_STATUS_KEY,
  NOX_GENTLE_SHELL_WIDGET_KEY,
} from "../extensions/constants.js";

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

test("controller starts compact TUI UI with header, telemetry, and lunar working state", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();

  controller.start(ctx as never);

  const header = calls.find((call) => call[0] === "header");
  assert.equal(typeof header?.[1], "function");
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
  assert.deepEqual(
    calls.find((call) => call[0] === "workingMessage"),
    ["workingMessage", "Nox working"],
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "workingIndicator"),
    ["workingIndicator", { frames: ["🌑", "☾ ", "◯ ", "☽ ", "🌑"] }],
  );
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

test("commands and shortcuts cycle modes, toggle headers, and reject invalid input without changing state", () => {
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

  controller.toggleHeader(ctx as never);
  assert.equal(controller.state.headerVisible, false);
  controller.runCommand("header show", ctx as never);
  assert.equal(controller.state.headerVisible, true);
  controller.runCommand("status", ctx as never);
  assert.match(String(calls.at(-1)?.[1]), /Nox mode: compact/);

  const previous = { ...controller.state };
  controller.runCommand("unknown", ctx as never);
  assert.deepEqual(controller.state, previous);
  assert.deepEqual(calls.at(-1), [
    "notify",
    "⚠ Usage: /nox-gentle-shell [compact|detailed|off|header show|header hide|status]",
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

test("cleanup is idempotent and lunar frames preserve one terminal-visible width", () => {
  assert.deepEqual(LUNAR_WORKING_FRAMES, ["🌑", "☾", "◯", "☽", "🌑"]);
  const widths = (NOX_WORKING_INDICATOR.frames ?? []).map((frame: string) =>
    visibleWidth(frame),
  );
  assert.ok(widths.every((width: number) => width === widths[0]));

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
  assert.ok(
    calls.filter((call) => call[0] === "workingIndicator" && call.length === 1)
      .length >= 2,
  );
});

test("missing and extra command arguments notify without changing visual state", () => {
  const { ctx, calls } = createContext();
  const controller = createVisualController();
  controller.start(ctx as never);
  controller.runCommand("header hide", ctx as never);
  const initialState = { ...controller.state };
  const invalidArguments = [
    "",
    "header",
    "header show extra",
    "compact extra",
    "status extra",
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
        "⚠ Usage: /nox-gentle-shell [compact|detailed|off|header show|header hide|status]",
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
    ["header", undefined],
    ["workingMessage"],
    ["workingIndicator"],
  ]);

  calls.length = 0;
  controller.cleanup(ctx as never);
  assert.deepEqual(calls, [
    ["status", NOX_GENTLE_SHELL_STATUS_KEY, undefined],
    ["widget", NOX_GENTLE_SHELL_WIDGET_KEY, undefined],
    ["header", undefined],
    ["workingMessage"],
    ["workingIndicator"],
  ]);
  assert.deepEqual(controller.state, {
    mode: "compact",
    headerVisible: true,
    activeTools: {},
    telemetry: undefined,
    model: undefined,
  });
});
