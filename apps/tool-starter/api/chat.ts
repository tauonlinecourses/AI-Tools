/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import vercelHandler from "@workspace/ai-client/vercel";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";

/**
 * Replace `your-tool-id` with the same id used in:
 * - apps/hub/src/tools.config.ts
 * - ToolAuthGate in src/main.tsx
 * - group_tools rows for this tool
 */
const TOOL_ID = "your-tool-id";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireToolAccessFromRequest(req, TOOL_ID);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
  return vercelHandler(req, res);
}
