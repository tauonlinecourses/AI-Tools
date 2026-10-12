/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AuthError, requireToolAccessFromRequest } from "@workspace/auth/server";
import {
  ForumThreadsError,
  fetchForumThreads,
  parseForumThreadsRequestBody,
} from "../server/forumThreadsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireToolAccessFromRequest(req, "tau-support");
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  const parsed = parseForumThreadsRequestBody(body);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
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
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof ForumThreadsError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "Server error",
    });
  }
}
