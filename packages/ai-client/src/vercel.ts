/// <reference types="node" />
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handler } from './server';

function toWebRequest(req: VercelRequest): Request {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host ?? 'localhost';
  const url = `${proto}://${host}${req.url ?? '/api/chat'}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (typeof req.body === 'string') {
      body = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      body = req.body.toString('utf8');
    } else if (req.body !== undefined && req.body !== null) {
      body = JSON.stringify(req.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }
  }

  return new Request(url, {
    method: req.method ?? 'POST',
    headers,
    body,
  });
}

async function sendWebResponse(webRes: Response, res: VercelResponse): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(await webRes.text());
}

/** Vercel Node.js serverless entry — bridges req/res to the Web `handler`. */
export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const webRes = await handler(toWebRequest(req));
    await sendWebResponse(webRes, res);
  } catch (err) {
    res.status(500).json({
      error: 'Server error',
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
