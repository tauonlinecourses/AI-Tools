/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AuthError } from "@workspace/auth/server";
import { listPublicGroups, registerPendingUser } from "../server/registerOps";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const resource =
        typeof req.query.resource === "string" ? req.query.resource : "";
      if (resource === "groups") {
        return res.status(200).json({ groups: await listPublicGroups() });
      }
      return res.status(400).json({ error: "resource must be 'groups'" });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await registerPendingUser({
        email: String(body?.email ?? ""),
        password: String(body?.password ?? ""),
        requestedGroupId: String(body?.requestedGroupId ?? ""),
      });
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Registration failed",
    });
  }
}
