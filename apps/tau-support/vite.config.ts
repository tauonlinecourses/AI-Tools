import "../../packages/auth/src/devTls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  ForumThreadsError,
  fetchForumThreads,
  loginWithEnvCredentials,
  parseForumThreadsRequestBody,
} from "./server/forumThreadsCore";
import {
  EmbedError,
  embedTexts,
  parseEmbedRequestBody,
} from "./server/embedCore";
import {
  DevAuthError,
  requireTauPlatformAuth,
} from "./server/devPlatformAuth";

async function requireTauAuth(
  req: import("http").IncomingMessage
): Promise<void> {
  const auth = req.headers.authorization;
  await requireTauPlatformAuth(
    typeof auth === "string" ? auth : undefined
  );
}

function bridgeLmsEnv(env: Record<string, string>) {
  // Local Windows + corporate TLS MITM: Node fetch cannot use the Windows store.
  if (
    process.platform === "win32" &&
    process.env.PLATFORM_STRICT_TLS !== "1"
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  if (env.LMS_BASE_URL) process.env.LMS_BASE_URL ||= env.LMS_BASE_URL;
  if (env.LMS_USERNAME) process.env.LMS_USERNAME ||= env.LMS_USERNAME;
  if (env.LMS_PASSWORD) process.env.LMS_PASSWORD ||= env.LMS_PASSWORD;
  if (env.LMS_SESSION_ID) process.env.LMS_SESSION_ID ||= env.LMS_SESSION_ID;
  if (env.LMS_CSRF_TOKEN) process.env.LMS_CSRF_TOKEN ||= env.LMS_CSRF_TOKEN;
  if (env.LMS_JWT_HEADER_PAYLOAD) {
    process.env.LMS_JWT_HEADER_PAYLOAD ||= env.LMS_JWT_HEADER_PAYLOAD;
  }
  if (env.LMS_JWT_SIGNATURE) {
    process.env.LMS_JWT_SIGNATURE ||= env.LMS_JWT_SIGNATURE;
  }
  if (env.APP_PASSWORD) process.env.APP_PASSWORD ||= env.APP_PASSWORD;
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY;
  if (env.PLATFORM_SUPABASE_URL) process.env.PLATFORM_SUPABASE_URL ||= env.PLATFORM_SUPABASE_URL;
  if (env.PLATFORM_SUPABASE_ANON_KEY) {
    process.env.PLATFORM_SUPABASE_ANON_KEY ||= env.PLATFORM_SUPABASE_ANON_KEY;
  }
  if (env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY) {
    process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY ||=
      env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  }
  if (env.VITE_PLATFORM_SUPABASE_URL) {
    process.env.PLATFORM_SUPABASE_URL ||= env.VITE_PLATFORM_SUPABASE_URL;
  }
  if (env.VITE_PLATFORM_SUPABASE_ANON_KEY) {
    process.env.PLATFORM_SUPABASE_ANON_KEY ||= env.VITE_PLATFORM_SUPABASE_ANON_KEY;
  }
  if (env.TAU_SUPABASE_SERVICE_ROLE_KEY) {
    process.env.TAU_SUPABASE_SERVICE_ROLE_KEY ||= env.TAU_SUPABASE_SERVICE_ROLE_KEY;
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY;
  }
  if (env.VITE_SUPABASE_URL) process.env.TAU_SUPABASE_URL ||= env.VITE_SUPABASE_URL;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use("/api/tau-data", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            bridgeLmsEnv(env);
            let raw = "";
            req.on("data", (chunk) => (raw += chunk));
            req.on("end", async () => {
              try {
                await requireTauAuth(req);
                const body = JSON.parse(raw || "{}") as {
                  action?: string;
                  payload?: unknown;
                };
                if (!body.action || typeof body.action !== "string") {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: "Missing action" }));
                  return;
                }
                // ssrLoadModule transpiles TS and resolves `.js` → `.ts` imports;
                // a static import would pull @workspace/auth into the config bundle.
                const { runTauDataAction } = (await server.ssrLoadModule(
                  "/server/tauDataHandler.ts"
                )) as typeof import("./server/tauDataHandler");
                const result = await runTauDataAction(
                  body.action,
                  body.payload
                );
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
              } catch (err: unknown) {
                const status =
                  err instanceof DevAuthError ? err.statusCode : 500;
                res.statusCode = status;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: err instanceof Error ? err.message : "tau-data failed",
                  })
                );
              }
            });
          });

          server.middlewares.use("/api/lms-login", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            bridgeLmsEnv(env);

            try {
              await requireTauAuth(req);
              const session = await loginWithEnvCredentials();
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(session));
            } catch (err: unknown) {
              if (err instanceof DevAuthError) {
                res.statusCode = err.statusCode;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
              if (err instanceof ForumThreadsError) {
                res.statusCode = err.statusCode;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Server error" }));
            }
          });

          server.middlewares.use("/api/embed", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            bridgeLmsEnv(env);

            let raw = "";
            req.on("data", (chunk) => (raw += chunk));
            req.on("end", async () => {
              try {
                await requireTauAuth(req);
              } catch (err: unknown) {
                const status =
                  err instanceof DevAuthError ? err.statusCode : 401;
                res.statusCode = status;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: err instanceof Error ? err.message : "Unauthorized",
                  })
                );
                return;
              }

              let body: unknown = null;
              try {
                body = JSON.parse(raw || "{}");
              } catch {
                body = null;
              }

              const parsed = parseEmbedRequestBody(body);
              if ("error" in parsed) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: parsed.error }));
                return;
              }

              try {
                const result = await embedTexts(parsed.texts);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
              } catch (err: unknown) {
                if (err instanceof EmbedError) {
                  res.statusCode = err.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: err.message }));
                  return;
                }
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                const message =
                  err instanceof Error ? err.message : String(err);
                res.end(
                  JSON.stringify({ error: "Server error", details: message })
                );
              }
            });
          });

          server.middlewares.use("/api/chat", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            bridgeLmsEnv(env);

            let raw = "";
            req.on("data", (chunk) => (raw += chunk));
            req.on("end", async () => {
              try {
                await requireTauAuth(req);
                // Dynamic import avoids Node ESM loading @workspace/auth via ai-client.
                const { handler: chatHandler } = await import(
                  "@workspace/ai-client/server"
                );
                const webReq = new Request("http://localhost/api/chat", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(typeof req.headers.authorization === "string"
                      ? { Authorization: req.headers.authorization }
                      : {}),
                  },
                  body: raw || "{}",
                });
                const webRes = await chatHandler(webReq);
                res.statusCode = webRes.status;
                webRes.headers.forEach((value, key) => {
                  res.setHeader(key, value);
                });
                res.end(await webRes.text());
              } catch (err: unknown) {
                const status =
                  err instanceof DevAuthError ? err.statusCode : 500;
                res.statusCode = status;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: err instanceof Error ? err.message : "Server error",
                  })
                );
              }
            });
          });

          server.middlewares.use("/api/forum-threads", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            bridgeLmsEnv(env);

            let raw = "";
            req.on("data", (chunk) => (raw += chunk));
            req.on("end", async () => {
              try {
                await requireTauAuth(req);
              } catch (err: unknown) {
                const status =
                  err instanceof DevAuthError ? err.statusCode : 401;
                res.statusCode = status;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: err instanceof Error ? err.message : "Unauthorized",
                  })
                );
                return;
              }

              let body: unknown = null;
              try {
                body = JSON.parse(raw || "{}");
              } catch {
                body = null;
              }

              const parsed = parseForumThreadsRequestBody(body);
              if ("error" in parsed) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: parsed.error }));
                return;
              }

              try {
                const result = await fetchForumThreads(parsed.courseId, {
                  categoryName: parsed.categoryName,
                  topicId: parsed.topicId,
                  pageSize: parsed.pageSize,
                  session: parsed.session,
                  since: parsed.since,
                  knownThreads: parsed.knownThreads,
                  maxPages: parsed.maxPages,
                  collectNewUntil: parsed.collectNewUntil,
                });
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
              } catch (err: unknown) {
                if (err instanceof ForumThreadsError) {
                  res.statusCode = err.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: err.message }));
                  return;
                }
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                const message = err instanceof Error ? err.message : String(err);
                res.end(JSON.stringify({ error: "Server error", details: message }));
              }
            });
          });
        },
      },
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5178,
      strictPort: true,
    },
  };
});
