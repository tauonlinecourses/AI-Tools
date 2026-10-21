import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { bridgeEnv, type EnvBridge } from "./env";
import { readBody, toVercelRequest, toVercelResponse } from "./vercelAdapter";

/*
 * Structural Vite types only: apps run Vite 5 and Vite 8 side by side, and a
 * runtime `vite` import from this package would resolve the wrong copy.
 */
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

type DevServerLike = {
  config: { root: string };
  middlewares: { use: (fn: Middleware) => unknown };
  ssrLoadModule: (url: string) => Promise<Record<string, unknown>>;
};

type SourceAlias = { find: RegExp; replacement: string };

export type VercelApiPlugin = {
  name: string;
  apply: "serve";
  config: (config: { root?: string }) => { resolve: { alias: SourceAlias[] } };
  configureServer: (server: DevServerLike) => void;
};

export type VercelApiPluginOptions = {
  /** Result of Vite `loadEnv(mode, cwd, "")`. */
  env: Record<string, string>;
  /** Which `env` keys handlers read from `process.env`. */
  bridge: EnvBridge;
};

/**
 * Package entries whose production `exports` point at compiled CJS. In dev the
 * handlers load through Vite SSR, so point them at the TypeScript source.
 */
const SOURCE_ENTRIES: ReadonlyArray<{ find: RegExp; pkg: string; file: string }> = [
  { find: /^@workspace\/auth\/server$/, pkg: "@workspace/auth", file: "src/server.ts" },
  { find: /^@workspace\/ai-client\/vercel$/, pkg: "@workspace/ai-client", file: "src/vercel.ts" },
];

const API_PATH = /^\/api((?:\/[\w-]+)+)\/?$/;

/**
 * Maps a request path to the `api/` file Vercel would route it to, as a
 * root-relative module id (`/api/admin.ts`), or null when there is none.
 * `_`-prefixed segments are private to Vercel and never routed.
 */
export function resolveApiFile(root: string, pathname: string): string | null {
  const match = API_PATH.exec(pathname);
  if (!match) return null;
  const segments = match[1].slice(1).split("/");
  if (segments.some((segment) => segment.startsWith("_"))) return null;
  const rel = segments.join("/");
  for (const candidate of [`api/${rel}.ts`, `api/${rel}/index.ts`]) {
    if (fs.existsSync(path.join(root, candidate))) return `/${candidate}`;
  }
  return null;
}

function sourceAliases(root: string): SourceAlias[] {
  return SOURCE_ENTRIES.flatMap(({ find, pkg, file }) => {
    const linked = path.join(root, "node_modules", pkg);
    if (!fs.existsSync(linked)) return [];
    return [{ find, replacement: path.join(fs.realpathSync(linked), file) }];
  });
}

function sendServerError(res: ServerResponse, err: unknown) {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      error: "Server error",
      details: err instanceof Error ? err.message : String(err),
    }),
  );
}

async function runApiFile(
  server: DevServerLike,
  file: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const rawBody = await readBody(req);
    const mod = await server.ssrLoadModule(file);
    const handler = mod.default;
    if (typeof handler !== "function") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `${file} has no default export handler` }));
      return;
    }
    await handler(toVercelRequest(req, rawBody), toVercelResponse(res));
  } catch (err: unknown) {
    console.error(`[dev-api] ${file} failed:`, err);
    sendServerError(res, err);
  }
}

/**
 * Serves the app's own `api/*.ts` Vercel handlers from the Vite dev server,
 * so local requests run the exact production handler code.
 */
export function vercelApiPlugin(options: VercelApiPluginOptions): VercelApiPlugin {
  return {
    name: "workspace-vercel-api",
    apply: "serve",
    config(config) {
      return { resolve: { alias: sourceAliases(path.resolve(config.root ?? process.cwd())) } };
    },
    configureServer(server) {
      bridgeEnv(options.env, options.bridge);
      const root = server.config.root;
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0] ?? "";
        const file = resolveApiFile(root, pathname);
        if (!file) return next();
        void runApiFile(server, file, req, res);
      });
    },
  };
}
