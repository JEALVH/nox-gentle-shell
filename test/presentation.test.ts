import test, { describe } from "node:test";
import assert from "node:assert";
import {
  renderHeader,
  renderStatus,
  renderAlert,
  renderNoxBanner,
  renderCompactTelemetry,
  renderDetailedTelemetry,
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

test("telemetry renderers use replaceable symbols and degrade within terminal width", () => {
  const telemetry = {
    context: { tokens: 53_800, contextWindow: 128_000, percent: 42 },
    usage: {
      input: 18_200,
      output: 3_100,
      cacheRead: 9_400,
      cacheWrite: 0,
      totalTokens: 30_700,
      cost: 0.08,
    },
    counts: { messageEntries: 9, assistantTurns: 7 },
  };
  const tools = {
    first: { toolCallId: "first", toolName: "bash" },
    second: { toolCallId: "second", toolName: "read" },
  };

  const wide = renderCompactTelemetry({
    telemetry,
    activeTools: tools,
    maxWidth: 80,
  });
  assert.ok(wide.includes("◉ 42%"));
  assert.ok(wide.includes("↑ 18.2k"));
  assert.ok(wide.includes("↓ 3.1k"));
  assert.ok(wide.includes("◇ 9.4k"));
  assert.ok(wide.includes("$ 0.08"));
  assert.ok(wide.includes("⚙ 2"));

  const custom = renderCompactTelemetry({
    telemetry,
    activeTools: tools,
    maxWidth: 80,
    symbols: {
      context: "C",
      input: "I",
      output: "O",
      cache: "K",
      cost: "M",
      tools: "T",
    },
  });
  assert.ok(custom.includes("C 42%"));
  assert.ok(custom.includes("T 2"));

  for (const maxWidth of [-1, 0, 1, 5, 10, 20]) {
    const compact = renderCompactTelemetry({
      telemetry,
      activeTools: tools,
      maxWidth,
    });
    assertWidth(compact, maxWidth);
    const detailed = renderDetailedTelemetry({
      telemetry,
      activeTools: tools,
      maxWidth,
    });
    assert.ok(
      detailed.every((line) => visibleWidth(line) <= Math.max(0, maxWidth)),
    );
  }
  assert.strictEqual(
    renderCompactTelemetry({ telemetry, activeTools: tools, maxWidth: 0 }),
    "",
  );
  assert.deepEqual(
    renderDetailedTelemetry({ telemetry, activeTools: tools, maxWidth: -1 }),
    [],
  );
});

test("compact telemetry removes lower-priority segments in order as width narrows", () => {
  const telemetry = {
    context: { tokens: 53_800, contextWindow: 128_000, percent: 42 },
    usage: {
      input: 18_200,
      output: 3_100,
      cacheRead: 9_400,
      cacheWrite: 0,
      totalTokens: 30_700,
      cost: 0.08,
    },
    counts: { messageEntries: 9, assistantTurns: 7 },
  };
  const tools = { first: { toolCallId: "first", toolName: "bash" } };
  const full = renderCompactTelemetry({
    telemetry,
    activeTools: tools,
    maxWidth: 80,
  });
  const withoutTools = renderCompactTelemetry({
    telemetry,
    activeTools: tools,
    maxWidth: visibleWidth(full) - 1,
  });
  const withoutCost = renderCompactTelemetry({
    telemetry,
    activeTools: tools,
    maxWidth: visibleWidth(withoutTools) - 1,
  });

  assert.ok(full.includes("⚙ 1"));
  assert.ok(withoutTools.includes("$ 0.08"));
  assert.ok(!withoutTools.includes("⚙"));
  assert.ok(withoutCost.includes("◇ 9.4k"));
  assert.ok(!withoutCost.includes("$"));
});

test("compact telemetry is safe when its Unicode context segment alone must truncate", () => {
  const output = renderCompactTelemetry({
    telemetry: {
      context: { tokens: 5_000, contextWindow: 10_000, percent: 50 },
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: 0,
      },
      counts: { messageEntries: 0, assistantTurns: 0 },
    },
    activeTools: {},
    maxWidth: 2,
  });

  assertWidth(output, 2);
});

test("detailed telemetry labels finalized totals and unavailable context", () => {
  const lines = renderDetailedTelemetry({
    telemetry: {
      context: { tokens: null, contextWindow: 128_000, percent: null },
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: 0,
      },
      counts: { messageEntries: 3, assistantTurns: 1 },
    },
    activeTools: {},
    maxWidth: 100,
  });

  assert.ok(
    lines.some(
      (line) => line.includes("context") && line.includes("unavailable"),
    ),
  );
  assert.ok(lines.some((line) => line.includes("usage (finalized)")));
  assert.ok(lines.some((line) => line.includes("cost (finalized)")));
  assert.ok(lines.some((line) => line.includes("assistant turns 1")));
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
