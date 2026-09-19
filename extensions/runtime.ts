import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  NOX_GENTLE_SHELL_FULLSCREEN_CONTRIBUTION_KEY,
  NOX_GENTLE_SHELL_STATUS_KEY,
  NOX_GENTLE_SHELL_WIDGET_KEY,
} from "./constants.js";
import {
  createFullscreenContributionClient,
  type FullscreenContributionEvents,
} from "./fullscreen-contribution.js";
import {
  renderCompactTelemetry,
  renderDetailedTelemetry,
} from "./presentation.js";
import {
  aggregateTelemetry,
  reduceActiveTools,
  type ActiveToolEvent,
  type ActiveTools,
  type TelemetrySnapshot,
} from "./telemetry.js";

export type VisualMode = "compact" | "detailed" | "off";

export interface VisualRuntimeState {
  mode: VisualMode;
  activeTools: ActiveTools;
  telemetry: TelemetrySnapshot | undefined;
  model: string | undefined;
}
/** RPC widgets have no terminal width, so use one stable public string-array width. */
const RPC_WIDGET_WIDTH = 120;
const RENDER_WIDTH = 120;
const NEXT_MODE: Readonly<Record<VisualMode, VisualMode>> = {
  compact: "detailed",
  detailed: "off",
  off: "compact",
};

function modelIdentity(ctx: ExtensionContext): string | undefined {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
}

function emptyState(): VisualRuntimeState {
  return {
    mode: "compact",
    activeTools: {},
    telemetry: undefined,
    model: undefined,
  };
}

export interface VisualController {
  readonly state: Readonly<VisualRuntimeState>;
  start(ctx: ExtensionContext): void;
  refresh(ctx: ExtensionContext): void;
  updateTools(event: ActiveToolEvent, ctx: ExtensionContext): void;
  setMode(mode: VisualMode, ctx: ExtensionContext): void;
  cycleMode(ctx: ExtensionContext): void;
  runCommand(args: string, ctx: ExtensionContext): void;
  cleanup(ctx: ExtensionContext): void;
}

/**
 * Stateful orchestration seam for public Pi lifecycle hooks. It never stores a
 * host context, so shutdown can release the session without retaining it.
 */
export function createVisualController(
  events?: FullscreenContributionEvents,
): VisualController {
  let state = emptyState();
  const fullscreenContribution = createFullscreenContributionClient(events);

  const refreshSnapshot = (ctx: ExtensionContext) => {
    state = {
      ...state,
      telemetry: aggregateTelemetry(
        ctx.sessionManager.getEntries(),
        ctx.getContextUsage(),
      ),
      model: modelIdentity(ctx),
    };
  };

  const clearVisuals = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(NOX_GENTLE_SHELL_STATUS_KEY, undefined);
    ctx.ui.setWidget(NOX_GENTLE_SHELL_WIDGET_KEY, undefined);
  };

  const apply = (ctx: ExtensionContext) => {
    if (state.mode !== "detailed" || ctx.mode !== "tui") {
      fullscreenContribution.dispose();
    }
    if (!ctx.hasUI) return;

    if (state.mode === "off") {
      clearVisuals(ctx);
      return;
    }

    const telemetry = state.telemetry;
    if (!telemetry) return;

    ctx.ui.setStatus(
      NOX_GENTLE_SHELL_STATUS_KEY,
      renderCompactTelemetry({
        telemetry,
        activeTools: state.activeTools,
        maxWidth: RENDER_WIDTH,
      }),
    );

    if (state.mode === "detailed") {
      const renderDetail = (width: number) =>
        renderDetailedTelemetry({
          telemetry,
          activeTools: state.activeTools,
          model: state.model,
          maxWidth: width,
        });
      if (ctx.mode === "tui") {
        const accepted = fullscreenContribution.update({
          version: 1,
          key: NOX_GENTLE_SHELL_FULLSCREEN_CONTRIBUTION_KEY,
          surface: "rail",
          render: () => renderDetail(RENDER_WIDTH),
          fallback: "widget",
        });
        ctx.ui.setWidget(
          NOX_GENTLE_SHELL_WIDGET_KEY,
          accepted
            ? undefined
            : (_tui, _theme) => ({ render: renderDetail, invalidate() {} }),
        );
      } else {
        ctx.ui.setWidget(
          NOX_GENTLE_SHELL_WIDGET_KEY,
          renderDetail(RPC_WIDGET_WIDTH),
        );
      }
    } else {
      ctx.ui.setWidget(NOX_GENTLE_SHELL_WIDGET_KEY, undefined);
    }
  };

  const notify = (
    ctx: ExtensionContext,
    text: string,
    type: "info" | "warning" = "info",
  ) => {
    if (ctx.hasUI) ctx.ui.notify(text, type);
  };

  return {
    get state() {
      return state;
    },
    start(ctx) {
      refreshSnapshot(ctx);
      apply(ctx);
    },
    refresh(ctx) {
      refreshSnapshot(ctx);
      apply(ctx);
    },
    updateTools(event, ctx) {
      state = {
        ...state,
        activeTools: reduceActiveTools(state.activeTools, event),
      };
      this.refresh(ctx);
    },
    setMode(mode, ctx) {
      state = { ...state, mode };
      this.refresh(ctx);
    },
    cycleMode(ctx) {
      const mode = NEXT_MODE[state.mode];
      this.setMode(mode, ctx);
      notify(ctx, `ℹ Nox visual mode: ${mode}`);
    },
    runCommand(args, ctx) {
      const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const [command] = parts;

      if (parts.length === 0) {
        const telemetry = state.telemetry ? "available" : "unavailable";
        notify(
          ctx,
          `ℹ Nox mode: ${state.mode}; telemetry: ${telemetry}; active tools: ${Object.keys(state.activeTools).length}. Usage: /nox-gentle-shell [compact|detailed|off|status]`,
        );
        return;
      }

      if (
        parts.length === 1 &&
        (command === "compact" || command === "detailed" || command === "off")
      ) {
        this.setMode(command, ctx);
        notify(ctx, `ℹ Nox visual mode: ${command}`);
        return;
      }

      if (command === "status" && parts.length === 1) {
        const telemetry = state.telemetry ? "available" : "unavailable";
        notify(
          ctx,
          `ℹ Nox mode: ${state.mode}; telemetry: ${telemetry}; active tools: ${Object.keys(state.activeTools).length}`,
        );
        return;
      }

      notify(
        ctx,
        "⚠ Usage: /nox-gentle-shell [compact|detailed|off|status]",
        "warning",
      );
    },
    cleanup(ctx) {
      fullscreenContribution.dispose();
      clearVisuals(ctx);
      state = emptyState();
    },
  };
}
