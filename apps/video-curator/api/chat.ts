/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import vercelHandler from "@workspace/ai-client/vercel";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireToolAccessFromRequest(req, "video-curator");
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
  return vercelHandler(req, res);
}
