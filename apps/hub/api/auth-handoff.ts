/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  createHandoffCode,
  verifyPlatformRequest,
} from "@workspace/auth/server";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const verified = await verifyPlatformRequest(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const toolId =
      body && typeof body.toolId === "string" ? body.toolId.trim() : "";
    const redirectUrl =
      body && typeof body.redirectUrl === "string"
        ? body.redirectUrl.trim()
        : "";
    const refreshToken =
      body && typeof body.refreshToken === "string"
        ? body.refreshToken.trim()
        : "";

    if (!toolId || !redirectUrl || !refreshToken) {
      return res.status(400).json({
        error: "toolId, redirectUrl, and refreshToken are required",
      });
    }

    const code = await createHandoffCode({
      userId: verified.user.id,
      toolId,
      redirectUrl,
      accessToken: verified.accessToken,
      refreshToken,
    });
    return res.status(200).json({ code });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Handoff failed",
    });
  }
}
