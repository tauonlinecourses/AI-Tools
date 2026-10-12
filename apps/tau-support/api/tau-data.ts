/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  requireToolAccessFromRequest,
} from "@workspace/auth/server";
import { createTauServiceClient } from "../server/tauSupabase.js";
import { bindTauSupabase } from "../src/lib/supabase.js";
import { hydrateThreadStoreFromSupabase } from "../src/lib/supabaseHydrate.js";
import {
  syncCourseThreadsToSupabase,
  syncThreadUiStateToSupabase,
} from "../src/lib/supabaseSync.js";
import {
  createInfoDoc,
  deleteInfoDoc,
  listInfoDocs,
  reorderInfoDocs,
  updateInfoDoc,
} from "../src/lib/infoDocs.js";
import { uploadPastedImage } from "../src/lib/infoDocImages.js";
import { findSimilarQa } from "../src/lib/kbSearch.js";
import {
  countPendingEmbeddings,
  embedAllPendingQaPairs,
  embedQaPairsForCourse,
} from "../src/lib/kbEmbed.js";
import {
  countPendingInfoDocEmbeddings,
  embedInfoDocs,
} from "../src/lib/infoDocEmbed.js";
import {
  hydrateLastCheckAllFromSupabase,
  syncLastCheckAllToSupabase,
} from "../src/lib/lastCheckAllSync.js";

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

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const action = body && typeof body.action === "string" ? body.action : "";
  const payload = body?.payload;

  const client = createTauServiceClient();
  bindTauSupabase(client);

  try {
    switch (action) {
      case "hydrate":
        return res.status(200).json(await hydrateThreadStoreFromSupabase());
      case "syncCourseThreads":
        return res
          .status(200)
          .json(
            await syncCourseThreadsToSupabase(
              payload.courseId,
              payload.entries,
              payload.lastCheckedAt,
              payload.options
            )
          );
      case "syncThreadUiState":
        return res
          .status(200)
          .json(
            await syncThreadUiStateToSupabase(
              payload.threadId,
              payload.ui,
              payload.fallback
            )
          );
      case "listInfoDocs":
        return res.status(200).json(await listInfoDocs());
      case "createInfoDoc":
        return res.status(200).json(await createInfoDoc(payload));
      case "updateInfoDoc":
        return res
          .status(200)
          .json(await updateInfoDoc(payload.id, payload.input));
      case "deleteInfoDoc":
        return res.status(200).json(await deleteInfoDoc(payload.id));
      case "reorderInfoDocs":
        return res.status(200).json(await reorderInfoDocs(payload.orderedIds));
      case "uploadPastedImage": {
        const raw = payload?.base64 as string;
        const mime = (payload?.mime as string) || "image/png";
        if (!raw) return res.status(400).json({ error: "base64 required" });
        const buf = Buffer.from(raw, "base64");
        const blob = new Blob([buf], { type: mime });
        return res.status(200).json(await uploadPastedImage(blob));
      }
      case "findSimilarQa":
        return res
          .status(200)
          .json(await findSimilarQa(payload.questionText, payload.opts));
      case "embedQaPairsForCourse":
        return res
          .status(200)
          .json(await embedQaPairsForCourse(payload.courseId));
      case "embedAllPendingQaPairs":
        return res.status(200).json(await embedAllPendingQaPairs());
      case "countPendingEmbeddings":
        return res.status(200).json(await countPendingEmbeddings());
      case "embedInfoDocs":
        return res.status(200).json(await embedInfoDocs());
      case "countPendingInfoDocEmbeddings":
        return res.status(200).json(await countPendingInfoDocEmbeddings());
      case "syncLastCheckAll":
        return res.status(200).json(await syncLastCheckAllToSupabase(payload));
      case "hydrateLastCheckAll":
        return res.status(200).json(await hydrateLastCheckAllFromSupabase());
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "tau-data failed",
    });
  } finally {
    bindTauSupabase(null);
  }
}
