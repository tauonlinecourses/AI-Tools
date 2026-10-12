/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import vercelHandler from "@workspace/ai-client/vercel";
import { AuthError, verifyPlatformRequest } from "@workspace/auth/server";

/** Hub chat requires a signed-in platform user (any tool entitlement). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await verifyPlatformRequest(req);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
  return vercelHandler(req, res);
}
