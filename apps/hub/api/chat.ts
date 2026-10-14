/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import vercelHandler from "@workspace/ai-client/vercel";
import { loadAuthServer } from "./loadAuthServer";

/** Hub chat requires a signed-in platform user (any tool entitlement). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let auth: Awaited<ReturnType<typeof loadAuthServer>>;
  try {
    auth = await loadAuthServer();
  } catch (err: unknown) {
    return res.status(500).json({
      error: `Auth module failed to load: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  const { AuthError, verifyPlatformRequest } = auth;

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
