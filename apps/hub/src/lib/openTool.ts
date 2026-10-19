import { startToolHandoff } from "@workspace/auth/client";
import { toolHref, type Tool } from "../tools.config";

/** Mints a hub → tool handoff and resolves to the URL to navigate to (external tools only). */
export async function handoffToTool(tool: Tool): Promise<string> {
  const href = toolHref(tool);
  const origin = new URL(href).origin;
  const handoffUrl =
    import.meta.env.DEV
      ? "/api/auth-handoff"
      : `${window.location.origin}/api/auth-handoff`;
  return startToolHandoff({
    toolId: tool.id,
    toolOrigin: origin,
    hubHandoffUrl: handoffUrl,
  });
}
