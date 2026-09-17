import { test, describe } from "node:test";
import assert from "node:assert";
import os from "node:os";

describe("Package Manifest", () => {
  test("should load the visual layer extension", async () => {
    const { DefaultResourceLoader, SettingsManager } = await import(
      "@earendil-works/pi-coding-agent"
    );

    const settingsManager = SettingsManager.inMemory(
      {
        packages: [process.cwd()],
      },
      { projectTrusted: true },
    );

    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: os.tmpdir(), // Use tmpdir so it doesn't auto-scan the local extensions folder as the global agent dir
      settingsManager,
    });

    await loader.reload();

    const result = loader.getExtensions();
    const extensions = result.extensions;
    assert.deepStrictEqual(
      result.errors,
      [],
      "Extension errors should be empty",
    );

    const themeResult = loader.getThemes();
    const themes = themeResult.themes;
    assert.deepStrictEqual(
      themeResult.diagnostics,
      [],
      "Theme diagnostics should be empty",
    );

    // Filter to ensure our package's extension is found
    const ourExtension = extensions.find(
      (e) => e.sourceInfo?.source === process.cwd(),
    );
    assert.ok(ourExtension, "Should load extension from our package");
    assert.strictEqual(themes.length, 1, "Should load theme from our package");
    assert.strictEqual(themes[0].name, "nox", "Loaded theme should be nox");
  });
});
