/// <reference types="node" />
/**
 * Thin Vercel entry for Virtual Support data BFF.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";

const TOOL_ID = "virtual-support";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    try {
      await requireToolAccessFromRequest(req, TOOL_ID);
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "Unauthorized";
      return res.status(401).json({ error: message });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const action = body && typeof body.action === "string" ? body.action : "";
    const payload = body?.payload;

    const { runDataAction } = await import("../server/dataHandler.js");
    const result = await runDataAction(action, payload);
    return res.status(200).json(result);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "data failed",
    });
  }
}
