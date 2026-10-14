/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  assertUserIsAdmin,
  verifyPlatformRequest,
} from "./platformAuth";
import {
  createAdminGroup,
  listAdminGroups,
  listAdminUsers,
  setGroupMembers,
  setUserGroups,
  updateAdminGroup,
} from "./adminOps";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
}

async function requireAdmin(req: VercelRequest) {
  const verified = await verifyPlatformRequest(req);
  await assertUserIsAdmin(verified.user.id);
  return verified;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    await requireAdmin(req);

    if (req.method === "GET") {
      const resource =
        typeof req.query.resource === "string" ? req.query.resource : "";
      if (resource === "users") {
        return res.status(200).json({ users: await listAdminUsers() });
      }
      if (resource === "groups") {
        return res.status(200).json({ groups: await listAdminGroups() });
      }
      return res.status(400).json({
        error: "resource must be 'users' or 'groups'",
      });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const action =
        body && typeof body.action === "string" ? body.action.trim() : "";

      if (action === "createGroup") {
        const group = await createAdminGroup({
          name: String(body.name ?? ""),
          slug: body.slug != null ? String(body.slug) : undefined,
          description:
            body.description != null ? String(body.description) : null,
          toolIds: Array.isArray(body.toolIds)
            ? body.toolIds.map(String)
            : [],
        });
        return res.status(200).json({ group });
      }

      if (action === "updateGroup") {
        const group = await updateAdminGroup({
          id: String(body.id ?? ""),
          name: String(body.name ?? ""),
          slug: String(body.slug ?? ""),
          description:
            body.description != null ? String(body.description) : null,
          toolIds: Array.isArray(body.toolIds)
            ? body.toolIds.map(String)
            : [],
        });
        return res.status(200).json({ group });
      }

      if (action === "setUserGroups") {
        const groups = await setUserGroups(
          String(body.userId ?? ""),
          Array.isArray(body.groupIds) ? body.groupIds.map(String) : []
        );
        return res.status(200).json({ groups });
      }

      if (action === "setGroupMembers") {
        const result = await setGroupMembers(
          String(body.groupId ?? ""),
          Array.isArray(body.userIds) ? body.userIds.map(String) : []
        );
        return res.status(200).json(result);
      }

      return res.status(400).json({
        error:
          "action must be 'createGroup', 'updateGroup', 'setUserGroups', or 'setGroupMembers'",
      });
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
      error: err instanceof Error ? err.message : "Admin request failed",
    });
  }
}
