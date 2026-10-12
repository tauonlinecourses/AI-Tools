import "../../packages/auth/src/devTls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  AuthError,
  createHandoffCode,
  redeemHandoffCode,
  verifyPlatformAccessToken,
} from "../../packages/auth/src/server";

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
        },
      },
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
