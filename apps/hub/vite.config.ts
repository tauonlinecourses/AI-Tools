import path from "node:path";
import { fileURLToPath } from "node:url";
import "../../packages/auth/src/devTls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  AuthError,
  createHandoffCode,
  redeemHandoffCode,
  verifyPlatformAccessToken,
} from "../../packages/auth/src/server";
import {
  assertUserIsAdmin,
  AuthError as HubAuthError,
} from "./api/platformAuth";
import {
  approveUser,
  createAdminGroup,
  inviteUser,
  listAdminGroups,
  listAdminUsers,
  listPublicGroups,
  registerPendingUser,
  rejectUser,
  removeUser,
  sendInviteEmail,
  setGroupMembers,
  setUserGroups,
  updateAdminGroup,
} from "./api/adminOps";

const hubDir = path.dirname(fileURLToPath(import.meta.url));
const mbzSrc = path.resolve(hubDir, "../mbz-explorer/src");
const dictionarySrc = path.resolve(hubDir, "../dictionary-tool/src");

function bridgeEnv(env: Record<string, string>) {
  // Local Windows + corporate TLS MITM: Node fetch cannot use the Windows store.
  if (
    process.platform === "win32" &&
    process.env.PLATFORM_STRICT_TLS !== "1"
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  const keys = [
    "PLATFORM_SUPABASE_URL",
    "PLATFORM_SUPABASE_ANON_KEY",
    "PLATFORM_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_PLATFORM_SUPABASE_URL",
    "VITE_PLATFORM_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  for (const key of keys) {
    if (env[key]) process.env[key] ||= env[key];
  }
  // Prefer explicit platform vars; fall back to course-builder-style VITE_*.
  if (!process.env.PLATFORM_SUPABASE_URL) {
    process.env.PLATFORM_SUPABASE_URL =
      env.VITE_PLATFORM_SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  }
  if (!process.env.PLATFORM_SUPABASE_ANON_KEY) {
    process.env.PLATFORM_SUPABASE_ANON_KEY =
      env.VITE_PLATFORM_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  }
}

async function readJsonBody(req: import("http").IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "hub-auth-api",
        configureServer(server) {
          server.middlewares.use("/api/auth-handoff", async (req, res) => {
            bridgeEnv(env);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            res.setHeader(
              "Access-Control-Allow-Headers",
              "Authorization, Content-Type"
            );
            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            try {
              const auth = req.headers.authorization;
              const token =
                typeof auth === "string" && auth.startsWith("Bearer ")
                  ? auth.slice(7)
                  : "";
              if (!token) throw new AuthError("Missing Authorization bearer token", 401);
              const verified = await verifyPlatformAccessToken(token);
              const body = (await readJsonBody(req)) as {
                toolId?: string;
                redirectUrl?: string;
                refreshToken?: string;
              } | null;
              if (!body?.toolId || !body.redirectUrl || !body.refreshToken) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: "toolId, redirectUrl, and refreshToken are required",
                  })
                );
                return;
              }
              const code = await createHandoffCode({
                userId: verified.user.id,
                toolId: body.toolId,
                redirectUrl: body.redirectUrl,
                accessToken: verified.accessToken,
                refreshToken: body.refreshToken,
              });
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ code }));
            } catch (err: unknown) {
              const status = err instanceof AuthError ? err.statusCode : 500;
              res.statusCode = status;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : "Handoff failed",
                })
              );
            }
          });

          server.middlewares.use("/api/auth-exchange", async (req, res) => {
            bridgeEnv(env);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            try {
              const body = (await readJsonBody(req)) as { code?: string } | null;
              if (!body?.code) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "code is required" }));
                return;
              }
              const tokens = await redeemHandoffCode(body.code);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  access_token: tokens.access_token,
                  refresh_token: tokens.refresh_token,
                  toolId: tokens.toolId,
                })
              );
            } catch (err: unknown) {
              const status = err instanceof AuthError ? err.statusCode : 500;
              res.statusCode = status;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : "Exchange failed",
                })
              );
            }
          });

          server.middlewares.use("/api/admin", async (req, res) => {
            bridgeEnv(env);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader(
              "Access-Control-Allow-Headers",
              "Authorization, Content-Type"
            );
            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }

            const send = (status: number, payload: unknown) => {
              res.statusCode = status;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(payload));
            };

            try {
              const auth = req.headers.authorization;
              const token =
                typeof auth === "string" && auth.startsWith("Bearer ")
                  ? auth.slice(7)
                  : "";
              if (!token) {
                throw new AuthError("Missing Authorization bearer token", 401);
              }
              const verified = await verifyPlatformAccessToken(token);
              await assertUserIsAdmin(verified.user.id);

              if (req.method === "GET") {
                const url = new URL(
                  req.url ?? "/",
                  "http://localhost"
                );
                const resource = url.searchParams.get("resource") ?? "";
                if (resource === "users") {
                  send(200, { users: await listAdminUsers() });
                  return;
                }
                if (resource === "groups") {
                  send(200, { groups: await listAdminGroups() });
                  return;
                }
                send(400, { error: "resource must be 'users' or 'groups'" });
                return;
              }

              if (req.method === "POST") {
                const body = (await readJsonBody(req)) as {
                  action?: string;
                  id?: string;
                  name?: string;
                  slug?: string;
                  description?: string | null;
                  toolIds?: string[];
                  userId?: string;
                  groupIds?: string[];
                  groupId?: string;
                  userIds?: string[];
                  email?: string;
                  redirectTo?: string;
                } | null;
                const action = body?.action?.trim() ?? "";

                if (action === "createGroup") {
                  const group = await createAdminGroup({
                    name: String(body?.name ?? ""),
                    slug: body?.slug != null ? String(body.slug) : undefined,
                    description:
                      body?.description != null
                        ? String(body.description)
                        : null,
                    toolIds: Array.isArray(body?.toolIds)
                      ? body.toolIds.map(String)
                      : [],
                  });
                  send(200, { group });
                  return;
                }

                if (action === "updateGroup") {
                  const group = await updateAdminGroup({
                    id: String(body?.id ?? ""),
                    name: String(body?.name ?? ""),
                    slug: String(body?.slug ?? ""),
                    description:
                      body?.description != null
                        ? String(body.description)
                        : null,
                    toolIds: Array.isArray(body?.toolIds)
                      ? body.toolIds.map(String)
                      : [],
                  });
                  send(200, { group });
                  return;
                }

                if (action === "setUserGroups") {
                  const groups = await setUserGroups(
                    String(body?.userId ?? ""),
                    Array.isArray(body?.groupIds)
                      ? body.groupIds.map(String)
                      : []
                  );
                  send(200, { groups });
                  return;
                }

                if (action === "setGroupMembers") {
                  const result = await setGroupMembers(
                    String(body?.groupId ?? ""),
                    Array.isArray(body?.userIds)
                      ? body.userIds.map(String)
                      : []
                  );
                  send(200, result);
                  return;
                }

                if (action === "inviteUser") {
                  const result = await inviteUser({
                    email: String(body?.email ?? ""),
                    groupIds: Array.isArray(body?.groupIds)
                      ? body.groupIds.map(String)
                      : [],
                    redirectTo:
                      body?.redirectTo != null
                        ? String(body.redirectTo)
                        : undefined,
                  });
                  send(200, result);
                  return;
                }

                if (action === "sendInviteEmail") {
                  const result = await sendInviteEmail({
                    email: String(body?.email ?? ""),
                    redirectTo:
                      body?.redirectTo != null
                        ? String(body.redirectTo)
                        : undefined,
                  });
                  send(200, result);
                  return;
                }

                if (action === "approveUser") {
                  const user = await approveUser({
                    userId: String(body?.userId ?? ""),
                    groupIds: Array.isArray(body?.groupIds)
                      ? body.groupIds.map(String)
                      : undefined,
                    reviewerId: verified.user.id,
                  });
                  send(200, { user });
                  return;
                }

                if (action === "rejectUser") {
                  const user = await rejectUser({
                    userId: String(body?.userId ?? ""),
                    reviewerId: verified.user.id,
                  });
                  send(200, { user });
                  return;
                }

                if (action === "removeUser") {
                  const result = await removeUser({
                    userId: String(body?.userId ?? ""),
                    actorId: verified.user.id,
                  });
                  send(200, result);
                  return;
                }

                send(400, {
                  error:
                    "action must be 'createGroup', 'updateGroup', 'setUserGroups', 'setGroupMembers', 'inviteUser', 'sendInviteEmail', 'approveUser', 'rejectUser', or 'removeUser'",
                });
                return;
              }

              send(405, { error: "Method not allowed" });
            } catch (err: unknown) {
              const status =
                err instanceof AuthError || err instanceof HubAuthError
                  ? err.statusCode
                  : 500;
              send(status, {
                error:
                  err instanceof Error ? err.message : "Admin request failed",
              });
            }
          });

          server.middlewares.use("/api/register", async (req, res) => {
            bridgeEnv(env);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader(
              "Access-Control-Allow-Headers",
              "Authorization, Content-Type"
            );
            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }

            const send = (status: number, payload: unknown) => {
              res.statusCode = status;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(payload));
            };

            try {
              if (req.method === "GET") {
                const url = new URL(req.url ?? "/", "http://localhost");
                const resource = url.searchParams.get("resource") ?? "";
                if (resource === "groups") {
                  send(200, { groups: await listPublicGroups() });
                  return;
                }
                send(400, { error: "resource must be 'groups'" });
                return;
              }

              if (req.method === "POST") {
                const body = (await readJsonBody(req)) as {
                  email?: string;
                  password?: string;
                  requestedGroupId?: string;
                } | null;
                const result = await registerPendingUser({
                  email: String(body?.email ?? ""),
                  password: String(body?.password ?? ""),
                  requestedGroupId: String(body?.requestedGroupId ?? ""),
                });
                send(200, result);
                return;
              }

              send(405, { error: "Method not allowed" });
            } catch (err: unknown) {
              const status =
                err instanceof AuthError || err instanceof HubAuthError
                  ? err.statusCode
                  : 500;
              send(status, {
                error:
                  err instanceof Error ? err.message : "Registration failed",
              });
            }
          });
        },
      },
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        // Allow hub to compile hub-hosted sibling tools.
        "mbz-explorer": mbzSrc,
        "dictionary-tool": dictionarySrc,
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: {
        allow: [path.resolve(hubDir, "../..")],
      },
    },
  };
});
