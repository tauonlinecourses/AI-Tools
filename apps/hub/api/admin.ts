/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  assertUserIsAdmin,
  verifyPlatformRequest,
} from "@workspace/auth/server";
import {
  approveUser,
  createAdminGroup,
  inviteUser,
  listAdminGroups,
  listAdminUsers,
  rejectUser,
  removeUser,
  sendInviteEmail,
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
    const verified = await requireAdmin(req);

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

      if (action === "inviteUser") {
        const result = await inviteUser({
          email: String(body.email ?? ""),
          groupIds: Array.isArray(body.groupIds)
            ? body.groupIds.map(String)
            : [],
          redirectTo:
            body.redirectTo != null ? String(body.redirectTo) : undefined,
        });
        return res.status(200).json(result);
      }

      if (action === "sendInviteEmail") {
        const result = await sendInviteEmail({
          email: String(body.email ?? ""),
          redirectTo:
            body.redirectTo != null ? String(body.redirectTo) : undefined,
        });
        return res.status(200).json(result);
      }

      if (action === "approveUser") {
        const user = await approveUser({
          userId: String(body.userId ?? ""),
          groupIds: Array.isArray(body.groupIds)
            ? body.groupIds.map(String)
            : undefined,
          reviewerId: verified.user.id,
        });
        return res.status(200).json({ user });
      }

      if (action === "rejectUser") {
        const user = await rejectUser({
          userId: String(body.userId ?? ""),
          reviewerId: verified.user.id,
        });
        return res.status(200).json({ user });
      }

      if (action === "removeUser") {
        const result = await removeUser({
          userId: String(body.userId ?? ""),
          actorId: verified.user.id,
        });
        return res.status(200).json(result);
      }

      return res.status(400).json({
        error:
          "action must be 'createGroup', 'updateGroup', 'setUserGroups', 'setGroupMembers', 'inviteUser', 'sendInviteEmail', 'approveUser', 'rejectUser', or 'removeUser'",
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
