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
  model?: string;
  context: string;
  input: string;
  output: string;
  cache: string;
  cost: string;
  tools: string;
}

/** Provisional presentation data; telemetry aggregation is intentionally symbol-free. */
export const DEFAULT_TELEMETRY_SYMBOLS: TelemetrySymbols = {
  model: "◆",
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
  model?: string;
  symbols?: TelemetrySymbols;
  /** Optional so pure callers retain the existing unstyled string contract. */
  theme?: Theme;
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

function truncatePlainToWidth(value: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(value) <= width) return value;
  if (visibleWidth("…") > width) return "";

  let truncated = "";
  for (const character of value) {
    if (visibleWidth(`${truncated}${character}…`) > width) break;
    truncated += character;
  }
  return `${truncated}…`;
}

function fillToWidth(value: string, width: number, styled: boolean): string {
  const truncated = styled
    ? truncateToWidth(value, width, "…")
    : truncatePlainToWidth(value, width);
  return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}

type TelemetryRole = "accent" | "border" | "dim" | "muted" | "text";

function telemetryRole(
  theme: Theme | undefined,
  role: TelemetryRole,
  value: string,
): string {
  return theme ? theme.fg(role, value) : value;
}

function telemetryMetric(
  theme: Theme | undefined,
  glyph: string,
  value: string,
): string {
  return `${telemetryRole(theme, "muted", glyph)} ${telemetryRole(theme, "text", value)}`;
}

function telemetrySeparator(theme: Theme | undefined): string {
  return telemetryRole(theme, "dim", " · ");
}

function renderTelemetryCard(
  lines: string[],
  maxWidth: number,
  theme: Theme | undefined,
): string[] {
  if (maxWidth <= 0) return [];
  if (maxWidth === 1) return [telemetryRole(theme, "border", "│")];

  const border = (value: string) => telemetryRole(theme, "border", value);
  const innerWidth = maxWidth - 2;
  const title = "Nox 🌑";
  const titledRuleWidth = visibleWidth(`┌─ ${title} ┐`);
  const top =
    maxWidth >= titledRuleWidth
      ? `${border("┌─ ")}${telemetryRole(theme, "accent", title)}${border(` ${"─".repeat(maxWidth - titledRuleWidth)}┐`)}`
      : `${border("┌")}${border("─".repeat(innerWidth))}${border("┐")}`;
  const contentWidth = Math.max(0, innerWidth - 2);
  const body = lines.map((line) => {
    if (innerWidth < 2) {
      return `${border("│")}${fillToWidth(line, innerWidth, Boolean(theme))}${border("│")}`;
    }
    return `${border("│")} ${fillToWidth(line, contentWidth, Boolean(theme))} ${border("│")}`;
  });

  return [
    top,
    ...body,
    `${border("└")}${border("─".repeat(innerWidth))}${border("┘")}`,
  ];
}

/** Render finalized telemetry as a width-safe, icon-led Nox card. */
export function renderDetailedTelemetry({
  telemetry,
  activeTools,
  maxWidth,
  model,
  symbols = DEFAULT_TELEMETRY_SYMBOLS,
  theme,
}: TelemetryRenderOptions): string[] {
  const { context, usage, counts } = telemetry;
  const contextValue =
    context.tokens === null
      ? `unavailable${context.contextWindow === null ? "" : ` / ${formatCompactNumber(context.contextWindow)}`}`
      : `${formatCompactNumber(context.tokens)} / ${context.contextWindow === null ? "—" : formatCompactNumber(context.contextWindow)} (${context.percent === null ? "—" : `${formatDecimal(context.percent)}%`})`;
  const tools = activeToolNames(activeTools);
  const modelSymbol = symbols.model ?? DEFAULT_TELEMETRY_SYMBOLS.model ?? "◆";

  return renderTelemetryCard(
    [
      ...(model ? [telemetryMetric(theme, modelSymbol, model ?? "")] : []),
      telemetryMetric(theme, symbols.context, contextValue),
      [
        telemetryMetric(theme, symbols.input, formatCompactNumber(usage.input)),
        telemetryMetric(
          theme,
          symbols.output,
          formatCompactNumber(usage.output),
        ),
        telemetryMetric(
          theme,
          symbols.cache,
          formatCompactNumber(usage.cacheRead + usage.cacheWrite),
        ),
      ].join(telemetrySeparator(theme)),
      telemetryMetric(theme, symbols.cost, formatMoney(usage.cost)),
      [
        telemetryMetric(theme, "✉", String(counts.messageEntries)),
        telemetryMetric(theme, "◌", String(counts.assistantTurns)),
        telemetryMetric(
          theme,
          symbols.tools,
          tools.length === 0 ? "—" : tools.join(", "),
        ),
      ].join(telemetrySeparator(theme)),
    ],
    maxWidth,
    theme,
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
