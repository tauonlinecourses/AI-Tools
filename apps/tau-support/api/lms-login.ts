/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  ForumThreadsError,
  loginWithEnvCredentials,
} from "../server/forumThreadsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await loginWithEnvCredentials();
    return res.status(200).json(session);
  } catch (err: unknown) {
    if (err instanceof ForumThreadsError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "Server error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
