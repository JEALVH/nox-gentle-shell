import test, { describe } from "node:test";
import assert from "node:assert";
import {
  renderHeader,
  renderStatus,
  renderAlert,
  renderNoxBanner,
} from "../extensions/presentation.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

// Valid ANSI escape codes to ensure visibleWidth correctly ignores them
const createMockTheme = (): Theme => {
  return {
    fg: (_color: string, text: string) => `\x1b[34m${text}\x1b[0m`, // Blue foreground
    bg: (_color: string, text: string) => `\x1b[44m${text}\x1b[0m`, // Blue background
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    italic: (text: string) => `\x1b[3m${text}\x1b[0m`,
    underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
    inverse: (text: string) => `\x1b[7m${text}\x1b[0m`,
    strikethrough: (text: string) => `\x1b[9m${text}\x1b[0m`,
    getFgAnsi: (_color: string) => `\x1b[34m`,
    getBgAnsi: (_color: string) => `\x1b[44m`,
    getColorMode: () => "truecolor",
    getThinkingBorderColor: () => (text: string) => `\x1b[34m${text}\x1b[0m`,
    getBashModeBorderColor: () => (text: string) => `\x1b[34m${text}\x1b[0m`,
  } as unknown as Theme;
};

const assertWidth = (output: string, maxWidth: number) => {
  const width = visibleWidth(output);
  const maxAllowed = Math.max(0, maxWidth);
  assert.ok(
    width <= maxAllowed,
    `Width ${width} should be <= ${maxAllowed}. Output: ${JSON.stringify(output)}`,
  );
};

test("Responsive Presentation - Header", () => {
  const theme = createMockTheme();

  const options = {
    title: "Gentle Shell",
    subtitle: "Mode: Auto",
    maxWidth: 100,
    theme,
  };

  // Normal render
  const full = renderHeader(options);
  assert.ok(full.includes("Gentle Shell"), "Should include title");
  assert.ok(full.includes("Mode: Auto"), "Should include subtitle");

  // Narrow width
  const narrowOptions = { ...options, maxWidth: 16 };
  // "Gentle Shell" is 12 chars. " - " is 3 chars. 12+3=15. Leaves 1 char for subtitle, so it will truncate
  const narrow = renderHeader(narrowOptions);
  assert.ok(visibleWidth(narrow) <= 16, "Must not exceed max width");
  assert.ok(narrow.includes("Gentle Shell"), "Should still include title");

  // Extremely narrow width
  const tinyOptions = { ...options, maxWidth: 5 };
  const tiny = renderHeader(tinyOptions);
  assert.ok(visibleWidth(tiny) <= 5, "Must not exceed max width");
  assert.ok(!tiny.includes("Gentle Shell"), "Title should be truncated");
});

test("Nox banner selects full, compact, and minimal variants within width", () => {
  const theme = createMockTheme();
  const semanticText = "Visual layer";

  const full = renderNoxBanner({ maxWidth: 20, semanticText, theme });
  assert.ok(
    full.includes("NOX Visual layer"),
    "Full banner should include semantic text",
  );
  assertWidth(full, 20);

  const compact = renderNoxBanner({ maxWidth: 3, semanticText, theme });
  assert.ok(
    compact.includes("NOX"),
    "Compact banner should retain the wordmark",
  );
  assert.ok(
    !compact.includes("Visual layer"),
    "Compact banner should omit semantic text",
  );
  assertWidth(compact, 3);

  const minimal = renderNoxBanner({ maxWidth: 2, semanticText, theme });
  assert.ok(
    minimal.includes("NO"),
    "Minimal banner should truncate the wordmark",
  );
  assertWidth(minimal, 2);
});

test("Nox banner selects variants from semantic-text width", () => {
  const theme = createMockTheme();
  const semanticText = "Nox interface";

  const full = renderNoxBanner({ maxWidth: 17, semanticText, theme });
  assert.ok(
    full.includes(semanticText),
    "Full banner should fit the exact text width",
  );
  assertWidth(full, 17);

  const compact = renderNoxBanner({ maxWidth: 16, semanticText, theme });
  assert.ok(
    !compact.includes(semanticText),
    "Compact banner should omit text that does not fit",
  );
  assert.ok(
    compact.includes("NOX"),
    "Compact banner should retain the wordmark",
  );
  assertWidth(compact, 16);
});

test("Nox banner is safe at zero, negative, and extremely narrow widths", () => {
  const theme = createMockTheme();

  assert.strictEqual(renderNoxBanner({ maxWidth: 0, theme }), "");
  assert.strictEqual(renderNoxBanner({ maxWidth: -1, theme }), "");

  const oneColumn = renderNoxBanner({ maxWidth: 1, theme });
  assert.ok(
    oneColumn.includes("N"),
    "One-column banner should preserve a wordmark prefix",
  );
  assertWidth(oneColumn, 1);
});

test("Responsive Presentation - Status", () => {
  const theme = createMockTheme();

  // Working status
  const workingFull = renderStatus({
    statusText: "Processing data...",
    isWorking: true,
    frameIndex: 0,
    maxWidth: 50,
    theme,
  });
  assert.ok(workingFull.includes("Processing data..."), "Should include text");
  assert.ok(visibleWidth(workingFull) <= 50, "Must not exceed max width");

  // Narrow status
  const workingNarrow = renderStatus({
    statusText: "Processing data...",
    isWorking: true,
    frameIndex: 0,
    maxWidth: 10,
    theme,
  });
  assert.ok(visibleWidth(workingNarrow) <= 10, "Must not exceed max width");
  assert.ok(workingNarrow.includes("…"), "Should include truncation marker");

  // Success status
  const successFull = renderStatus({
    statusText: "Done.",
    isWorking: false,
    maxWidth: 50,
    theme,
  });
  assert.ok(successFull.includes("✓"), "Should include success tick");
  assert.ok(successFull.includes("Done."), "Should include text");
});

test("Responsive Presentation - Alert", () => {
  const theme = createMockTheme();

  const alertOptions = {
    text: "Connection lost",
    type: "error" as const,
    maxWidth: 50,
    theme,
  };
  const fullAlert = renderAlert(alertOptions);

  assert.ok(fullAlert.includes("✖"), "Should include error icon");
  assert.ok(fullAlert.includes("Connection lost"), "Should include text");
  assert.ok(visibleWidth(fullAlert) <= 50, "Must not exceed max width");

  const narrowAlert = renderAlert({ ...alertOptions, maxWidth: 10 });
  assert.ok(visibleWidth(narrowAlert) <= 10, "Must not exceed max width");
  assert.ok(narrowAlert.includes("…"), "Should truncate");
});

describe("Edge cases and Matrix testing", () => {
  const theme = createMockTheme();
  const testInputs = [
    { text: "Hello World" },
    { text: "你好世界" }, // 8 visual columns
    { text: "👨‍👩‍👧‍👦🌈" }, // family + rainbow (width varies by terminal, let's just assert visibleWidth output <= max)
    { text: "Áb́ć" }, // 'A' + combining mark, etc.
    { text: "\x1b[31mDecorated\x1b[0m" },
  ];
  const testWidths = [-5, 0, 1, 3, 5, 10, 20];

  test("Header Edge Cases", () => {
    for (const { text } of testInputs) {
      for (const w of testWidths) {
        const out = renderHeader({
          title: text,
          subtitle: text,
          maxWidth: w,
          theme,
        });
        assertWidth(out, w);
      }
    }
  });

  test("Status Edge Cases", () => {
    for (const { text } of testInputs) {
      for (const w of testWidths) {
        const out = renderStatus({
          statusText: text,
          isWorking: true,
          frameIndex: 1,
          maxWidth: w,
          theme,
        });
        assertWidth(out, w);
        const out2 = renderStatus({
          statusText: text,
          isWorking: false,
          maxWidth: w,
          theme,
        });
        assertWidth(out2, w);
      }
    }
  });

  test("Alert Edge Cases", () => {
    for (const { text } of testInputs) {
      for (const w of testWidths) {
        const out = renderAlert({
          text: text,
          type: "error",
          maxWidth: w,
          theme,
        });
        assertWidth(out, w);
      }
    }
  });
});
