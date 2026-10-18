import "../../packages/auth/src/devTls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  DevAuthError,
  requireVsPlatformAuth,
} from "./server/devPlatformAuth";

async function requireVsAuth(
  req: import("http").IncomingMessage
): Promise<void> {
  const auth = req.headers.authorization;
  await requireVsPlatformAuth(
    typeof auth === "string" ? auth : undefined
  );
}

function bridgeEnv(env: Record<string, string>) {
  if (
    process.platform === "win32" &&
    process.env.PLATFORM_STRICT_TLS !== "1"
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY;
  if (env.PLATFORM_SUPABASE_URL) {
    process.env.PLATFORM_SUPABASE_URL ||= env.PLATFORM_SUPABASE_URL;
  }
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
    process.env.PLATFORM_SUPABASE_ANON_KEY ||=
      env.VITE_PLATFORM_SUPABASE_ANON_KEY;
  }
  if (env.VS_SUPABASE_URL) process.env.VS_SUPABASE_URL ||= env.VS_SUPABASE_URL;
  if (env.VS_SUPABASE_SERVICE_ROLE_KEY) {
    process.env.VS_SUPABASE_SERVICE_ROLE_KEY ||=
      env.VS_SUPABASE_SERVICE_ROLE_KEY;
  }
  if (env.VITE_SUPABASE_URL) {
    process.env.VS_SUPABASE_URL ||= env.VITE_SUPABASE_URL;
  }
}

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use("/api/data", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            bridgeEnv(env);
            const raw = await readBody(req);
            try {
              await requireVsAuth(req);
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
              const { runDataAction } = (await server.ssrLoadModule(
                "/server/dataHandler.ts"
              )) as typeof import("./server/dataHandler");
              const result = await runDataAction(body.action, body.payload);
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
                  error: err instanceof Error ? err.message : "data failed",
                })
              );
            }
          });

          server.middlewares.use("/api/ask", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            bridgeEnv(env);
            const raw = await readBody(req);
            try {
              await requireVsAuth(req);
              const body = JSON.parse(raw || "{}") as {
                question?: string;
                history?: unknown;
              };
              const { runAsk } = (await server.ssrLoadModule(
                "/server/askHandler.ts"
              )) as typeof import("./server/askHandler");
              const result = await runAsk({
                question: body.question ?? "",
                history: Array.isArray(body.history)
                  ? (body.history as import("./server/askHandler").AskMessage[])
                  : [],
              });
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
                  error: err instanceof Error ? err.message : "ask failed",
                })
              );
            }
          });

          server.middlewares.use("/api/chat", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            bridgeEnv(env);
            const raw = await readBody(req);
            try {
              await requireVsAuth(req);
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
        },
      },
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5179,
      strictPort: true,
    },
  };
});
