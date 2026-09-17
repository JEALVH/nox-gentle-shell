import type {
  ExtensionContext,
  WorkingIndicatorOptions,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  NOX_GENTLE_SHELL_STATUS_KEY,
  NOX_GENTLE_SHELL_WIDGET_KEY,
} from "./constants.js";
import {
  renderNoxBanner,
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
  headerVisible: boolean;
  activeTools: ActiveTools;
  telemetry: TelemetrySnapshot | undefined;
  model: string | undefined;
}

export const LUNAR_WORKING_FRAMES = ["🌑", "☾", "◯", "☽", "🌑"] as const;

/** Pad replaceable frames to a shared terminal-visible width. */
export function normalizeWorkingFrames(frames: readonly string[]): string[] {
  const width = Math.max(0, ...frames.map((frame) => visibleWidth(frame)));
  return frames.map(
    (frame) => `${frame}${" ".repeat(width - visibleWidth(frame))}`,
  );
}

export const NOX_WORKING_INDICATOR: WorkingIndicatorOptions = {
  frames: normalizeWorkingFrames(LUNAR_WORKING_FRAMES),
};

const NOX_WORKING_MESSAGE = "Nox working";
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
    headerVisible: true,
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
  setHeaderVisible(visible: boolean, ctx: ExtensionContext): void;
  toggleHeader(ctx: ExtensionContext): void;
  runCommand(args: string, ctx: ExtensionContext): void;
  cleanup(ctx: ExtensionContext): void;
}

/**
 * Stateful orchestration seam for public Pi lifecycle hooks. It never stores a
 * host context, so shutdown can release the session without retaining it.
 */
export function createVisualController(): VisualController {
  let state = emptyState();

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
    if (ctx.mode === "tui") {
      ctx.ui.setHeader(undefined);
      ctx.ui.setWorkingMessage();
      ctx.ui.setWorkingIndicator();
    }
  };

  const apply = (ctx: ExtensionContext) => {
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
        ctx.ui.setWidget(NOX_GENTLE_SHELL_WIDGET_KEY, (_tui, _theme) => ({
          render: renderDetail,
          invalidate() {},
        }));
      } else {
        ctx.ui.setWidget(
          NOX_GENTLE_SHELL_WIDGET_KEY,
          renderDetail(RPC_WIDGET_WIDTH),
        );
      }
    } else {
      ctx.ui.setWidget(NOX_GENTLE_SHELL_WIDGET_KEY, undefined);
    }

    if (ctx.mode !== "tui") return;

    ctx.ui.setHeader(
      state.headerVisible
        ? (_tui, theme) => ({
            render: (width) => [
              renderNoxBanner({
                maxWidth: width,
                semanticText: "Gentle Shell",
                theme,
              }),
            ],
            invalidate() {},
          })
        : undefined,
    );
    ctx.ui.setWorkingMessage(NOX_WORKING_MESSAGE);
    ctx.ui.setWorkingIndicator(NOX_WORKING_INDICATOR);
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
    setHeaderVisible(visible, ctx) {
      state = { ...state, headerVisible: visible };
      this.refresh(ctx);
      notify(ctx, `ℹ Nox header: ${visible ? "shown" : "hidden"}`);
    },
    toggleHeader(ctx) {
      this.setHeaderVisible(!state.headerVisible, ctx);
    },
    runCommand(args, ctx) {
      const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const [command, option] = parts;

      if (parts.length === 0) {
        const telemetry = state.telemetry ? "available" : "unavailable";
        notify(
          ctx,
          `ℹ Nox mode: ${state.mode}; header: ${state.headerVisible ? "shown" : "hidden"}; telemetry: ${telemetry}; active tools: ${Object.keys(state.activeTools).length}. Usage: /nox-gentle-shell [compact|detailed|off|header show|header hide|status]`,
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

      if (
        command === "header" &&
        parts.length === 2 &&
        (option === "show" || option === "hide")
      ) {
        this.setHeaderVisible(option === "show", ctx);
        return;
      }

      if (command === "status" && parts.length === 1) {
        const telemetry = state.telemetry ? "available" : "unavailable";
        notify(
          ctx,
          `ℹ Nox mode: ${state.mode}; header: ${state.headerVisible ? "shown" : "hidden"}; telemetry: ${telemetry}; active tools: ${Object.keys(state.activeTools).length}`,
        );
        return;
      }

      notify(
        ctx,
        "⚠ Usage: /nox-gentle-shell [compact|detailed|off|header show|header hide|status]",
        "warning",
      );
    },
    cleanup(ctx) {
      clearVisuals(ctx);
      state = emptyState();
    },
  };
}
