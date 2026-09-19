import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  NOX_GENTLE_SHELL_COMMAND_NAME,
  NOX_GENTLE_SHELL_SHORTCUTS,
} from "./constants.js";
import { createVisualController } from "./runtime.js";

export default function (pi: ExtensionAPI) {
  const controller = createVisualController(pi.events);

  pi.on("session_start", (_event, ctx) => controller.start(ctx));
  pi.on("session_shutdown", (_event, ctx) => controller.cleanup(ctx));

  pi.on("message_start", (_event, ctx) => controller.refresh(ctx));
  pi.on("message_update", (_event, ctx) => controller.refresh(ctx));
  pi.on("message_end", (_event, ctx) => controller.refresh(ctx));
  pi.on("turn_start", (_event, ctx) => controller.refresh(ctx));
  pi.on("turn_end", (_event, ctx) => controller.refresh(ctx));
  pi.on("model_select", (_event, ctx) => controller.refresh(ctx));
  pi.on("session_compact", (_event, ctx) => controller.refresh(ctx));

  pi.on("tool_execution_start", (event, ctx) =>
    controller.updateTools(
      { type: "start", toolCallId: event.toolCallId, toolName: event.toolName },
      ctx,
    ),
  );
  pi.on("tool_execution_update", (event, ctx) =>
    controller.updateTools(
      {
        type: "update",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      },
      ctx,
    ),
  );
  pi.on("tool_execution_end", (event, ctx) =>
    controller.updateTools(
      { type: "end", toolCallId: event.toolCallId, toolName: event.toolName },
      ctx,
    ),
  );

  pi.registerCommand(NOX_GENTLE_SHELL_COMMAND_NAME, {
    description: "Control Nox visual telemetry.",
    handler: async (args, ctx) => controller.runCommand(args, ctx),
  });

  pi.registerShortcut(NOX_GENTLE_SHELL_SHORTCUTS.cycleMode.key, {
    description: "Cycle Nox visual mode",
    handler: (ctx) => controller.cycleMode(ctx),
  });
}
