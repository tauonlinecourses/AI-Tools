/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AuthError, redeemHandoffCode } from "@workspace/auth/server";
import { allowedCorsOrigin } from "../server/corsOrigins";

/** Only known tool origins may read the tokens this returns. */
function setCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Vary", "Origin");
  const origin = allowedCorsOrigin(req.headers.origin, process.env.VERCEL_ENV);
  if (!origin) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const code =
      body && typeof body.code === "string" ? body.code.trim() : "";
    if (!code) return res.status(400).json({ error: "code is required" });

    const tokens = await redeemHandoffCode(code);
    return res.status(200).json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      toolId: tokens.toolId,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Exchange failed",
    });
  }
}
