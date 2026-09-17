import type {
  ContextUsage,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

/**
 * Finalized usage persisted in public Pi session entries. These values describe
 * completed assistant, tool, compaction, and branch-summary work only.
 */
export interface FinalizedUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

/**
 * Current context is intentionally distinct from finalized session totals.
 * A null token/percent value comes from Pi after compaction; null window means
 * the host did not provide ContextUsage at all.
 */
export interface TelemetryContext {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
}

/**
 * messageEntries counts stored `type: "message"` session entries of every role.
 * assistantTurns counts finalized assistant messages, a deterministic turn-like
 * measure that remains reconstructable when a resumed session has no events.
 */
export interface TelemetryCounts {
  messageEntries: number;
  assistantTurns: number;
}

export interface TelemetrySnapshot {
  context: TelemetryContext;
  usage: FinalizedUsageTotals;
  counts: TelemetryCounts;
}

function createEmptyUsage(): FinalizedUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
  };
}

function addUsage(
  totals: FinalizedUsageTotals,
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost?: { total?: number };
  },
): FinalizedUsageTotals {
  return {
    input: totals.input + usage.input,
    output: totals.output + usage.output,
    cacheRead: totals.cacheRead + usage.cacheRead,
    cacheWrite: totals.cacheWrite + usage.cacheWrite,
    totalTokens: totals.totalTokens + usage.totalTokens,
    cost: totals.cost + (usage.cost?.total ?? 0),
  };
}

function getEntryUsage(entry: SessionEntry) {
  if (entry.type === "compaction" || entry.type === "branch_summary") {
    return entry.usage;
  }

  if (
    entry.type === "message" &&
    (entry.message.role === "assistant" || entry.message.role === "toolResult")
  ) {
    return entry.message.usage;
  }

  return undefined;
}

function toTelemetryContext(
  contextUsage: ContextUsage | undefined,
): TelemetryContext {
  if (!contextUsage) {
    return { tokens: null, contextWindow: null, percent: null };
  }

  return {
    tokens: contextUsage.tokens,
    contextWindow: contextUsage.contextWindow,
    percent: contextUsage.percent,
  };
}

/**
 * Aggregate only persisted, finalized usage from public session entry shapes.
 * Neither `entries` nor `contextUsage` is mutated.
 */
export function aggregateTelemetry(
  entries: readonly SessionEntry[],
  contextUsage: ContextUsage | undefined,
): TelemetrySnapshot {
  let usage = createEmptyUsage();
  let messageEntries = 0;
  let assistantTurns = 0;

  for (const entry of entries) {
    if (entry.type === "message") {
      messageEntries += 1;
      if (entry.message.role === "assistant") assistantTurns += 1;
    }

    const entryUsage = getEntryUsage(entry);
    if (entryUsage) usage = addUsage(usage, entryUsage);
  }

  return {
    context: toTelemetryContext(contextUsage),
    usage,
    counts: { messageEntries, assistantTurns },
  };
}

export interface ActiveTool {
  toolCallId: string;
  toolName: string;
}

/** Active tools are keyed by public toolCallId, so concurrent calls remain independent. */
export type ActiveTools = Readonly<Record<string, ActiveTool>>;

export type ActiveToolEvent =
  | { type: "start"; toolCallId: string; toolName: string }
  | { type: "update"; toolCallId: string; toolName: string }
  | { type: "end"; toolCallId: string; toolName: string };

/**
 * Apply a public tool lifecycle transition without mutating the prior state.
 * Updates never create activity, and unknown ends are deliberately no-ops.
 */
export function reduceActiveTools(
  activeTools: ActiveTools,
  event: ActiveToolEvent,
): ActiveTools {
  if (event.type === "start") {
    return {
      ...activeTools,
      [event.toolCallId]: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      },
    };
  }

  if (event.type === "update") {
    return activeTools[event.toolCallId] ? { ...activeTools } : activeTools;
  }

  if (!activeTools[event.toolCallId]) return activeTools;

  const { [event.toolCallId]: _endedTool, ...remaining } = activeTools;
  return remaining;
}
