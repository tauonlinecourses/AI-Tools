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
      // `return await` is required: bare `return promise` runs `finally`
      // before the action settles, clearing the bound Supabase client mid-flight.
      case "hydrate":
        return await hydrateThreadStoreFromSupabase();
      case "syncCourseThreads":
        return await syncCourseThreadsToSupabase(
          p?.courseId as string,
          p?.entries as never,
          p?.lastCheckedAt as string | null | undefined,
          p?.options as never
        );
      case "syncThreadUiState":
        return await syncThreadUiStateToSupabase(
          p?.threadId as string,
          p?.ui as never,
          p?.fallback as never
        );
      case "listInfoDocs":
        return await listInfoDocs();
      case "createInfoDoc":
        return await createInfoDoc(p as never);
      case "updateInfoDoc":
        return await updateInfoDoc(p?.id as string, p?.input as never);
      case "deleteInfoDoc":
        return await deleteInfoDoc(p?.id as string);
      case "reorderInfoDocs":
        return await reorderInfoDocs(p?.orderedIds as string[]);
      case "uploadPastedImage": {
        const raw = p?.base64 as string;
        const mime = (p?.mime as string) || "image/png";
        if (!raw) throw new Error("base64 required");
        const buf = Buffer.from(raw, "base64");
        const blob = new Blob([buf], { type: mime });
        return await uploadPastedImage(blob);
      }
      case "findSimilarQa":
        return await findSimilarQa(
          p?.questionText as string,
          p?.opts as never
        );
      case "embedQaPairsForCourse":
        return await embedQaPairsForCourse(p?.courseId as string);
      case "embedAllPendingQaPairs":
        return await embedAllPendingQaPairs();
      case "countPendingEmbeddings":
        return await countPendingEmbeddings();
      case "embedInfoDocs":
        return await embedInfoDocs();
      case "countPendingInfoDocEmbeddings":
        return await countPendingInfoDocEmbeddings();
      case "syncLastCheckAll":
        return await syncLastCheckAllToSupabase(p as never);
      case "hydrateLastCheckAll":
        return await hydrateLastCheckAllFromSupabase();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } finally {
    bindTauSupabase(null);
  }
}
