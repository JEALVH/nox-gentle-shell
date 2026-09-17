import { test, describe } from "node:test";
import assert from "node:assert";
import visualLayerExtension from "../extensions/visual-layer";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("Visual Layer Extension", () => {
  test("should load without throwing", () => {
    let sessionStartRegistered = false;

    const mockPi = {
      on: (event: string, _handler: any) => {
        if (event === "session_start") {
          sessionStartRegistered = true;
        }
      },
    } as ExtensionAPI;

    visualLayerExtension(mockPi);

    assert.strictEqual(
      sessionStartRegistered,
      true,
      "Should register session_start event",
    );
  });
});
