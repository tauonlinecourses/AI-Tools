import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  ForumThreadsError,
  fetchForumThreads,
  loginWithEnvCredentials,
  parseForumThreadsRequestBody,
} from "./server/forumThreadsCore";

function bridgeLmsEnv(env: Record<string, string>) {
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
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use("/api/lms-login", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            bridgeLmsEnv(env);

            try {
              const session = await loginWithEnvCredentials();
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(session));
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
                  pageSize: parsed.pageSize,
                  session: parsed.session,
                  since: parsed.since,
                  knownThreads: parsed.knownThreads,
                  maxPages: parsed.maxPages,
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
