import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

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
