/// <reference types="node" />
/**
 * Thin Vercel entry for Virtual Support RAG Ask.
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
    const question =
      body && typeof body.question === "string" ? body.question : "";
    const history = Array.isArray(body?.history) ? body.history : [];
    const sessionId =
      body && typeof body.sessionId === "string" ? body.sessionId : undefined;

    const { runAsk } = await import("../server/askHandler.js");
    const result = await runAsk({ question, history, sessionId });
    return res.status(200).json(result);
  } catch (err: unknown) {
    // Details stay in the server log; users get a plain message.
    console.error(
      JSON.stringify({
        event: "vs_ask_failed",
        message: err instanceof Error ? err.message : String(err),
      })
    );
    return res.status(500).json({
      error: "לא הצלחנו לענות על השאלה כרגע. נסו שוב בעוד כמה דקות.",
    });
  }
}
