/// <reference types="node" />
/**
 * Thin Vercel entry for Tau data BFF.
 * Keep top-level imports minimal — pulling all of src/lib (and React via
 * @workspace/ai-client/client) at module load caused FUNCTION_INVOCATION_FAILED
 * before the handler could run.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    try {
      await requireToolAccessFromRequest(req, "tau-support");
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

    const { runTauDataAction } = await import("../server/tauDataHandler.js");
    const result = await runTauDataAction(action, payload);
    return res.status(200).json(result);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "tau-data failed",
    });
  }
}
