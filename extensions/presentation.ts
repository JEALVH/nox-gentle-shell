import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ActiveTools, TelemetrySnapshot } from "./telemetry.js";

export interface HeaderOptions {
  title: string;
  subtitle?: string;
  maxWidth: number;
  theme: Theme;
}

export function renderHeader({
  title,
  subtitle,
  maxWidth,
  theme,
}: HeaderOptions): string {
  if (maxWidth <= 0) return "";

  const formattedTitle = theme.bold(theme.fg("accent", title));
  const rawTitleWidth = visibleWidth(title);

  if (maxWidth < rawTitleWidth) {
    return truncateToWidth(formattedTitle, maxWidth, "…");
  }

  if (!subtitle) {
    return formattedTitle;
  }

  const formattedSubtitle = theme.fg("muted", subtitle);
  const rawSubtitleWidth = visibleWidth(subtitle);
  const separator = " - ";
  const totalRawWidth = rawTitleWidth + separator.length + rawSubtitleWidth;

  if (totalRawWidth <= maxWidth) {
    return `${formattedTitle}${theme.fg("muted", separator)}${formattedSubtitle}`;
  } else {
    // Need to truncate subtitle
    const availableForSubtitle = maxWidth - rawTitleWidth - separator.length;
    if (availableForSubtitle < 3) {
      // Just show title if not enough room for a meaningful subtitle
      return formattedTitle;
    }
    const truncatedSubtitle = truncateToWidth(
      formattedSubtitle,
      availableForSubtitle,
      "…",
    );
    return `${formattedTitle}${theme.fg("muted", separator)}${truncatedSubtitle}`;
  }
}

export const NOX_BANNER_ARTWORK = {
  wordmark: "NOX",
} as const;

export interface NoxBannerOptions {
  maxWidth: number;
  semanticText?: string;
  theme: Theme;
}

export function renderNoxBanner({
  maxWidth,
  semanticText,
  theme,
}: NoxBannerOptions): string {
  if (maxWidth <= 0) return "";

  const { wordmark } = NOX_BANNER_ARTWORK;
  const formatBanner = (text: string) => theme.bold(theme.fg("accent", text));
  const fullBanner = semanticText ? `${wordmark} ${semanticText}` : wordmark;

  if (semanticText && visibleWidth(fullBanner) <= maxWidth) {
    return formatBanner(fullBanner);
  }

  if (visibleWidth(wordmark) <= maxWidth) {
    return formatBanner(wordmark);
  }

  return truncateToWidth(formatBanner(wordmark), maxWidth, "");
}

export interface StatusOptions {
  statusText: string;
  isWorking?: boolean;
  frameIndex?: number;
  maxWidth: number;
  theme: Theme;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function renderStatus({
  statusText,
  isWorking,
  frameIndex = 0,
  maxWidth,
  theme,
}: StatusOptions): string {
  if (maxWidth <= 0) return "";

  let prefix = "";
  if (isWorking) {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    prefix = theme.fg("accent", frame) + " ";
  } else {
    prefix = theme.fg("success", "✓") + " ";
  }

  const prefixWidth = visibleWidth(prefix);
  if (maxWidth <= prefixWidth) {
    return truncateToWidth(prefix, maxWidth, "");
  }

  const textWidth = visibleWidth(statusText);
  const formattedText = theme.fg("dim", statusText);

  if (prefixWidth + textWidth <= maxWidth) {
    return `${prefix}${formattedText}`;
  }

  const availableForText = maxWidth - prefixWidth;
  const truncatedText = truncateToWidth(formattedText, availableForText, "…");

  return `${prefix}${truncatedText}`;
}

export interface TelemetrySymbols {
  context: string;
  input: string;
  output: string;
  cache: string;
  cost: string;
  tools: string;
}

/** Provisional presentation data; telemetry aggregation is intentionally symbol-free. */
export const DEFAULT_TELEMETRY_SYMBOLS: TelemetrySymbols = {
  context: "◉",
  input: "↑",
  output: "↓",
  cache: "◇",
  cost: "$",
  tools: "⚙",
};

export interface TelemetryRenderOptions {
  telemetry: TelemetrySnapshot;
  activeTools: ActiveTools;
  maxWidth: number;
  symbols?: TelemetrySymbols;
}

function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${formatDecimal(value / 1_000_000)}m`;
  if (absolute >= 1_000) return `${formatDecimal(value / 1_000)}k`;
  return String(value);
}

function formatDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function activeToolNames(activeTools: ActiveTools): string[] {
  return Object.values(activeTools)
    .map((tool) => tool.toolName)
    .sort();
}

/**
 * Render finalized totals as a compact status line. Segments are omitted from
 * right to left as space narrows; they never represent live streaming usage.
 */
export function renderCompactTelemetry({
  telemetry,
  activeTools,
  maxWidth,
  symbols = DEFAULT_TELEMETRY_SYMBOLS,
}: TelemetryRenderOptions): string {
  if (maxWidth <= 0) return "";

  const { context, usage } = telemetry;
  const segments = [
    `${symbols.context} ${context.percent === null ? "—" : `${formatDecimal(context.percent)}%`}`,
    `${symbols.input} ${formatCompactNumber(usage.input)}`,
    `${symbols.output} ${formatCompactNumber(usage.output)}`,
    `${symbols.cache} ${formatCompactNumber(usage.cacheRead + usage.cacheWrite)}`,
    `${symbols.cost} ${formatMoney(usage.cost).slice(1)}`,
    `${symbols.tools} ${Object.keys(activeTools).length}`,
  ];

  while (segments.length > 1 && visibleWidth(segments.join(" · ")) > maxWidth) {
    segments.pop();
  }

  const output = segments.join(" · ");
  return visibleWidth(output) <= maxWidth
    ? output
    : truncateToWidth(output, maxWidth, "…");
}

/** Render semantic, width-safe detail lines for finalized session telemetry. */
export function renderDetailedTelemetry({
  telemetry,
  activeTools,
  maxWidth,
}: TelemetryRenderOptions): string[] {
  if (maxWidth <= 0) return [];

  const { context, usage, counts } = telemetry;
  const contextLine =
    context.tokens === null
      ? `context unavailable${context.contextWindow === null ? "" : ` / ${formatCompactNumber(context.contextWindow)}`}`
      : `context ${formatCompactNumber(context.tokens)} / ${context.contextWindow === null ? "—" : formatCompactNumber(context.contextWindow)} (${context.percent === null ? "—" : `${formatDecimal(context.percent)}%`})`;
  const tools = activeToolNames(activeTools);
  const lines = [
    contextLine,
    `usage (finalized) in ${formatCompactNumber(usage.input)} · out ${formatCompactNumber(usage.output)} · cache ${formatCompactNumber(usage.cacheRead + usage.cacheWrite)}`,
    `cost (finalized) ${formatMoney(usage.cost)}`,
    `activity messages ${counts.messageEntries} · assistant turns ${counts.assistantTurns} · tools ${tools.length === 0 ? "none" : tools.join(", ")}`,
  ];

  return lines.map((line) =>
    visibleWidth(line) <= maxWidth
      ? line
      : truncateToWidth(line, maxWidth, "…"),
  );
}

export interface AlertOptions {
  text: string;
  type: "info" | "warning" | "error" | "success";
  maxWidth: number;
  theme: Theme;
}

export function renderAlert({
  text,
  type,
  maxWidth,
  theme,
}: AlertOptions): string {
  if (maxWidth <= 0) return "";

  const colorMapping: Record<
    AlertOptions["type"],
    "accent" | "warning" | "error" | "success"
  > = {
    info: "accent",
    warning: "warning",
    error: "error",
    success: "success",
  };

  const iconMapping: Record<AlertOptions["type"], string> = {
    info: "ℹ",
    warning: "⚠",
    error: "✖",
    success: "✔",
  };

  const themeColor = colorMapping[type];
  const icon = iconMapping[type];

  const prefix = theme.bold(theme.fg(themeColor, `${icon} `));
  const prefixWidth = visibleWidth(prefix);

  if (maxWidth <= prefixWidth) {
    return truncateToWidth(prefix, maxWidth, "");
  }

  const availableForText = maxWidth - prefixWidth;
  const formattedText = theme.fg(themeColor, text);

  const textWidth = visibleWidth(formattedText);
  if (textWidth <= availableForText) {
    return `${prefix}${formattedText}`;
  }

  return `${prefix}${truncateToWidth(formattedText, availableForText, "…")}`;
}
