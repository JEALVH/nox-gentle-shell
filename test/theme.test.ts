import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";

test("Theme loads and validates against expected schema", async () => {
  const themePath = path.resolve(__dirname, "../themes/nox.json");
  const themeJson = JSON.parse(fs.readFileSync(themePath, "utf-8"));

  const schemaPath = path.resolve(
    __dirname,
    "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-schema.json",
  );
  const schemaJson = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

  assert.strictEqual(themeJson.name, "nox", "Theme name should be nox");

  assert.deepStrictEqual(
    themeJson.vars,
    {
      base: "#080A12",
      element: "#111420",
      selection: "#152A46",
      border: "#35465F",
      borderMuted: "#202B3C",
      text: "#E7E9F2",
      muted: "#A4ADBF",
      dim: "#707C92",
      accent: "#3D8BFF",
      active: "#59CFFF",
      deepBlue: "#245CB3",
      icy: "#B6E9FF",
      violet: "#B392F5",
      mint: "#A8DCC0",
      amber: "#E8B65F",
      error: "#FF334D",
      toolSuccessBg: "#14201C",
      toolErrorBg: "#28101A",
      paleBlue: "#A9C7EE",
      toolOutput: "#9B91B3",
    },
    "Theme should copy the accepted local Nox palette",
  );

  const requiredColors = schemaJson.properties.colors.required;

  for (const color of requiredColors) {
    assert.ok(
      color in themeJson.colors,
      `Theme should define required color ${color}`,
    );
  }

  // Validate token value shapes (all defined colors)
  for (const [key, value] of Object.entries(themeJson.colors)) {
    if (typeof value === "string") {
      assert.ok(
        value === "" || value.startsWith("#") || value in themeJson.vars,
        `Color ${key} should be empty, hex, or reference a var, got: ${value}`,
      );
    } else if (typeof value === "number") {
      assert.ok(
        Number.isInteger(value) && value >= 0 && value <= 255,
        `Color ${key} should be an integer between 0 and 255, got: ${value}`,
      );
    } else {
      assert.fail(`Color ${key} has invalid type: ${typeof value}`);
    }
  }
});
