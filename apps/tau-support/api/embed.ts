/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  EmbedError,
  embedTexts,
  parseEmbedRequestBody,
} from "../server/embedCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  const parsed = parseEmbedRequestBody(body);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const result = await embedTexts(parsed.texts);
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof EmbedError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "Server error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
