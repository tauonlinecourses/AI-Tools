/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  isAppPasswordConfigured,
  verifyAppPassword,
} from "../server/appAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAppPasswordConfigured()) {
    return res.status(503).json({
      error:
        "App password is not configured. Set APP_PASSWORD on the server and redeploy.",
    });
  }

  const body = req.body;
  const password =
    body &&
    typeof body === "object" &&
    typeof (body as { password?: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  if (!verifyAppPassword(password)) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  return res.status(200).json({ ok: true });
}
