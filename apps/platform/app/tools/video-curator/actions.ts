"use server";

import { YoutubeTranscriptTooManyRequestError } from "youtube-transcript";
import {
  YoutubeTranscriptError,
  loadYoutubeTranscriptFromUrl,
  type YoutubeTranscriptSegmentDTO,
} from "./lib/youtubeTranscriptCore";

export type YoutubeTranscriptActionResult =
  | {
      ok: true;
      items: YoutubeTranscriptSegmentDTO[];
      title?: string;
      videoId: string;
    }
  | { ok: false; error: string; status: number };

/**
 * Server action replacing the old `/api/youtube-transcript` endpoint.
 * Returns a result object instead of throwing — Next.js redacts thrown
 * server-action error messages in production.
 */
export async function fetchYoutubeTranscriptAction(
  url: string,
  lang?: string,
): Promise<YoutubeTranscriptActionResult> {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Missing url", status: 400 };
  }

  try {
    const langOpt = typeof lang === "string" && lang.trim() ? lang.trim() : undefined;
    const { items, title, videoId } = await loadYoutubeTranscriptFromUrl(
      url,
      langOpt ? { lang: langOpt } : undefined,
    );
    return { ok: true, items, title, videoId };
  } catch (err: unknown) {
    if (err instanceof YoutubeTranscriptError) {
      const tooMany = err instanceof YoutubeTranscriptTooManyRequestError;
      return { ok: false, error: err.message, status: tooMany ? 429 : 400 };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Server error",
      status: 500,
    };
  }
}
