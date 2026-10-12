/**
 * Server-side Tau data actions for Vite middleware / local BFF.
 * Does not import @workspace/auth (caller must auth first).
 */

import { createTauServiceClient } from "./tauSupabase.js";
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

export async function runTauDataAction(
  action: string,
  payload: unknown
): Promise<unknown> {
  const client = createTauServiceClient();
  bindTauSupabase(client);
  try {
    const p = payload as Record<string, unknown> | null;
    switch (action) {
      case "hydrate":
        return hydrateThreadStoreFromSupabase();
      case "syncCourseThreads":
        return syncCourseThreadsToSupabase(
          p?.courseId as string,
          p?.entries as never,
          p?.lastCheckedAt as string | null | undefined,
          p?.options as never
        );
      case "syncThreadUiState":
        return syncThreadUiStateToSupabase(
          p?.threadId as string,
          p?.ui as never,
          p?.fallback as never
        );
      case "listInfoDocs":
        return listInfoDocs();
      case "createInfoDoc":
        return createInfoDoc(p as never);
      case "updateInfoDoc":
        return updateInfoDoc(p?.id as string, p?.input as never);
      case "deleteInfoDoc":
        return deleteInfoDoc(p?.id as string);
      case "reorderInfoDocs":
        return reorderInfoDocs(p?.orderedIds as string[]);
      case "uploadPastedImage": {
        const raw = p?.base64 as string;
        const mime = (p?.mime as string) || "image/png";
        if (!raw) throw new Error("base64 required");
        const buf = Buffer.from(raw, "base64");
        const blob = new Blob([buf], { type: mime });
        return uploadPastedImage(blob);
      }
      case "findSimilarQa":
        return findSimilarQa(
          p?.questionText as string,
          p?.opts as never
        );
      case "embedQaPairsForCourse":
        return embedQaPairsForCourse(p?.courseId as string);
      case "embedAllPendingQaPairs":
        return embedAllPendingQaPairs();
      case "countPendingEmbeddings":
        return countPendingEmbeddings();
      case "embedInfoDocs":
        return embedInfoDocs();
      case "countPendingInfoDocEmbeddings":
        return countPendingInfoDocEmbeddings();
      case "syncLastCheckAll":
        return syncLastCheckAllToSupabase(p as never);
      case "hydrateLastCheckAll":
        return hydrateLastCheckAllFromSupabase();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } finally {
    bindTauSupabase(null);
  }
}
