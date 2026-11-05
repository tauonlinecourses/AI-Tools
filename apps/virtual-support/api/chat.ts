/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import vercelMod from "@workspace/ai-client/vercel";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";

type VercelAiHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | Promise<void>;

function resolveVercelAiHandler(mod: unknown): VercelAiHandler {
  if (typeof mod === "function") return mod as VercelAiHandler;
  if (
    mod &&
    typeof mod === "object" &&
    "default" in mod &&
    typeof (mod as { default: unknown }).default === "function"
  ) {
    return (mod as { default: VercelAiHandler }).default;
  }
  throw new Error(
    "@workspace/ai-client/vercel did not export a function (build dist / vercel.cjs?)"
  );
}

const vercelHandler = resolveVercelAiHandler(vercelMod);
const TOOL_ID = "virtual-support";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireToolAccessFromRequest(req, TOOL_ID);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    return await vercelHandler(req, res);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Chat handler failed",
    });
  }
}
