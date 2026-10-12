import {
  AuthError,
  requireToolAccessFromRequest,
  type VerifiedPlatformUser,
} from "./server.js";

type VercelLikeReq = {
  method?: string;
  headers?: { authorization?: string | string[] };
  body?: unknown;
};

type VercelLikeRes = {
  status: (code: number) => VercelLikeRes;
  json: (body: unknown) => unknown;
  setHeader?: (name: string, value: string) => void;
  end?: (body?: string) => void;
};

/**
 * Wrap a Vercel Node handler so it requires a Platform JWT with access to toolId.
 */
export function withToolAuth(
  toolId: string,
  handler: (
    req: VercelLikeReq,
    res: VercelLikeRes,
    user: VerifiedPlatformUser
  ) => Promise<unknown> | unknown
) {
  return async (req: VercelLikeReq, res: VercelLikeRes) => {
    try {
      const user = await requireToolAccessFromRequest(req, toolId);
      return await handler(req, res, user);
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Server error",
      });
    }
  };
}

export async function requireToolAuthFromWebRequest(
  request: Request,
  toolId: string
): Promise<VerifiedPlatformUser> {
  return requireToolAccessFromRequest(request, toolId);
}
