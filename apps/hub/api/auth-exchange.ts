/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";

type AuthServer = typeof import("@workspace/auth/server");

function loadAuthServer(): AuthServer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@workspace/auth/server") as AuthServer;
}

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let auth: AuthServer;
  try {
    auth = loadAuthServer();
  } catch (err: unknown) {
    return res.status(500).json({
      error: `Auth module failed to load: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  const { AuthError, redeemHandoffCode } = auth;

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
    const status =
      err &&
      typeof err === "object" &&
      "statusCode" in err &&
      typeof (err as { statusCode: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    return res.status(status).json({
      error: err instanceof Error ? err.message : "Exchange failed",
    });
  }
}
