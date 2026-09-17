import test from "node:test";
import assert from "node:assert/strict";
import type {
  ContextUsage,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  aggregateTelemetry,
  reduceActiveTools,
  type ActiveTools,
} from "../extensions/telemetry.js";

const usage = (
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  totalTokens: number,
  total: number,
) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total },
});

let entrySequence = 0;

const entry = (type: string, fields: Record<string, unknown>): SessionEntry =>
  ({
    type,
    id: `${type}-${entrySequence++}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...fields,
  }) as SessionEntry;

const assistant = (value: ReturnType<typeof usage>) =>
  entry("message", {
    message: {
      role: "assistant",
      content: [],
      api: "test",
      provider: "test",
      model: "test",
      usage: value,
      stopReason: "stop",
      timestamp: 0,
    },
  });

const toolResult = (value?: ReturnType<typeof usage>) =>
  entry("message", {
    message: {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [],
      isError: false,
      timestamp: 0,
      ...(value ? { usage: value } : {}),
    },
  });

test("aggregates finalized public usage without mutating session entries", () => {
  const entries = [
    entry("message", {
      message: { role: "user", content: "request", timestamp: 0 },
    }),
    assistant(usage(100, 20, 10, 5, 135, 0.01)),
    toolResult(usage(30, 4, 2, 1, 37, 0.02)),
    entry("compaction", {
      summary: "summary",
      firstKeptEntryId: "x",
      tokensBefore: 100,
      usage: usage(40, 6, 3, 2, 51, 0.03),
    }),
    entry("branch_summary", {
      fromId: "x",
      summary: "branch",
      usage: usage(50, 8, 4, 3, 65, 0.04),
    }),
    toolResult(),
  ];
  const before = structuredClone(entries);
  const context: ContextUsage = {
    tokens: 5_000,
    contextWindow: 10_000,
    percent: 50,
  };

  const telemetry = aggregateTelemetry(entries, context);

  assert.deepEqual(telemetry.usage, {
    input: 220,
    output: 38,
    cacheRead: 19,
    cacheWrite: 11,
    totalTokens: 288,
    cost: 0.1,
  });
  assert.deepEqual(telemetry.counts, {
    messageEntries: 4,
    assistantTurns: 1,
  });
  assert.deepEqual(telemetry.context, context);
  assert.deepEqual(entries, before);
});

test("empty telemetry snapshots own independent usage totals", () => {
  const first = aggregateTelemetry([], undefined);
  const second = aggregateTelemetry([], undefined);

  assert.notStrictEqual(first.usage, second.usage);
  first.usage.input = 999;

  assert.strictEqual(second.usage.input, 0);
  assert.strictEqual(aggregateTelemetry([], undefined).usage.input, 0);
});

test("defaults finalized cost to zero when a public usage shape omits cost", () => {
  const telemetry = aggregateTelemetry(
    [
      assistant({
        input: 10,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        totalTokens: 19,
      } as ReturnType<typeof usage>),
    ],
    undefined,
  );

  assert.deepEqual(telemetry.usage, {
    input: 10,
    output: 2,
    cacheRead: 3,
    cacheWrite: 4,
    totalTokens: 19,
    cost: 0,
  });
});

test("preserves unavailable and post-compaction context semantics", () => {
  const afterCompaction = aggregateTelemetry(
    [
      entry("compaction", {
        summary: "summary",
        firstKeptEntryId: "x",
        tokensBefore: 10,
      }),
    ],
    { tokens: null, contextWindow: 128_000, percent: null },
  );
  const unavailable = aggregateTelemetry([], undefined);

  assert.deepEqual(afterCompaction.context, {
    tokens: null,
    contextWindow: 128_000,
    percent: null,
  });
  assert.deepEqual(unavailable.context, {
    tokens: null,
    contextWindow: null,
    percent: null,
  });
});

test("includes resumed historical and usage-bearing non-assistant entries", () => {
  const telemetry = aggregateTelemetry(
    [
      assistant(usage(1, 2, 3, 4, 10, 0.1)),
      toolResult(usage(10, 20, 30, 40, 100, 1)),
      entry("compaction", {
        summary: "old session",
        firstKeptEntryId: "x",
        tokensBefore: 10,
        usage: usage(100, 200, 300, 400, 1_000, 10),
      }),
      entry("branch_summary", {
        fromId: "x",
        summary: "old branch",
        usage: usage(1_000, 2_000, 3_000, 4_000, 10_000, 100),
      }),
    ],
    undefined,
  );

  assert.deepEqual(telemetry.usage, {
    input: 1_111,
    output: 2_222,
    cacheRead: 3_333,
    cacheWrite: 4_444,
    totalTokens: 11_110,
    cost: 111.1,
  });
});

test("tracks concurrent tools by toolCallId through safe interleaved transitions", () => {
  let active: ActiveTools = {};
  active = reduceActiveTools(active, {
    type: "start",
    toolCallId: "a",
    toolName: "read",
  });
  active = reduceActiveTools(active, {
    type: "start",
    toolCallId: "b",
    toolName: "bash",
  });
  active = reduceActiveTools(active, {
    type: "update",
    toolCallId: "a",
    toolName: "read",
  });
  active = reduceActiveTools(active, {
    type: "end",
    toolCallId: "b",
    toolName: "bash",
  });
  active = reduceActiveTools(active, {
    type: "end",
    toolCallId: "b",
    toolName: "bash",
  });
  active = reduceActiveTools(active, {
    type: "end",
    toolCallId: "unknown",
    toolName: "find",
  });
  active = reduceActiveTools(active, {
    type: "start",
    toolCallId: "a",
    toolName: "grep",
  });

  assert.deepEqual(active, { a: { toolCallId: "a", toolName: "grep" } });
});
