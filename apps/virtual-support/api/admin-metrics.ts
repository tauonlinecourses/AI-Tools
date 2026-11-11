/// <reference types="node" />
/**
 * Thin Vercel entry for the admin dashboard metrics.
 * Requires tool access AND membership in the platform Admin group.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  assertUserIsAdmin,
  requireToolAccessFromRequest,
} from "@workspace/auth/server";

const TOOL_ID = "virtual-support";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    try {
      const verified = await requireToolAccessFromRequest(req, TOOL_ID);
      await assertUserIsAdmin(verified.user.id);
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "Unauthorized";
      return res.status(401).json({ error: message });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { getDashboardMetrics } = await import("../server/metricsHandler.js");
    const metrics = await getDashboardMetrics(body?.days);
    return res.status(200).json(metrics);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "metrics failed",
    });
  }
}
