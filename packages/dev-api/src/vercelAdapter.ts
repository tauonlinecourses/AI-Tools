import type { IncomingMessage, ServerResponse } from "node:http";

/** The subset of `@vercel/node`'s request helpers our handlers rely on. */
export type DevApiRequest = IncomingMessage & {
  body?: unknown;
  query: Record<string, string | string[]>;
};

/** The subset of `@vercel/node`'s response helpers our handlers rely on. */
export type DevApiResponse = ServerResponse & {
  status: (code: number) => DevApiResponse;
  json: (body: unknown) => DevApiResponse;
  send: (body: unknown) => DevApiResponse;
};

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Mirrors Vercel: JSON and urlencoded bodies are parsed, others stay strings. */
export function parseBody(raw: string, contentType: string | undefined): unknown {
  if (!raw) return undefined;
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "application/json" || type.endsWith("+json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (type === "application/x-www-form-urlencoded") {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}

export function parseQuery(url: string | undefined): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  const params = new URL(url ?? "/", "http://localhost").searchParams;
  for (const [key, value] of params) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else query[key] = [existing, value];
  }
  return query;
}

export function toVercelRequest(req: IncomingMessage, rawBody: string): DevApiRequest {
  return Object.assign(req, {
    body: parseBody(rawBody, req.headers["content-type"]),
    query: parseQuery(req.url),
  });
}

export function toVercelResponse(res: ServerResponse): DevApiResponse {
  const vres = res as DevApiResponse;
  vres.status = (code) => {
    res.statusCode = code;
    return vres;
  };
  vres.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return vres;
  };
  vres.send = (body) => {
    if (body === undefined || body === null) res.end();
    else if (typeof body === "string" || Buffer.isBuffer(body)) res.end(body);
    else vres.json(body);
    return vres;
  };
  return vres;
}
