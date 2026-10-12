/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";
import {
  ForumThreadsError,
  loginWithEnvCredentials,
} from "../server/forumThreadsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireToolAccessFromRequest(req, "tau-support");
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(401).json({ error: "Unauthorized" });
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
    });
  }
}
