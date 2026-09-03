import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  ForumThreadsError,
  fetchForumThreads,
  parseForumThreadsRequestBody,
} from "./server/forumThreadsCore";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use("/api/forum-threads", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            // Bridge local .env vars into process.env for the shared handler.
            if (env.LMS_BASE_URL) process.env.LMS_BASE_URL ||= env.LMS_BASE_URL;
            if (env.LMS_USERNAME) process.env.LMS_USERNAME ||= env.LMS_USERNAME;
            if (env.LMS_PASSWORD) process.env.LMS_PASSWORD ||= env.LMS_PASSWORD;
            if (env.LMS_SESSION_ID) process.env.LMS_SESSION_ID ||= env.LMS_SESSION_ID;
            if (env.LMS_CSRF_TOKEN) process.env.LMS_CSRF_TOKEN ||= env.LMS_CSRF_TOKEN;

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
