import type {
  ForumThreadsResponse,
  KnownThreadSnapshot,
} from "./types";

export interface FetchForumThreadsOptions {
  categoryName?: string;
  pageSize?: number;
  csrfToken?: string;
  sessionId?: string;
  jwtHeaderPayload?: string;
  jwtSignature?: string;
  /** ISO watermark — only return activity newer than this. */
  since?: string;
  /** Skip hydration for unchanged known threads. */
  knownThreads?: KnownThreadSnapshot[];
  maxPages?: number;
}

const CLIENT_REQUEST_TIMEOUT_MS = 180_000;

export async function fetchForumThreads(
  courseId: string,
  options?: FetchForumThreadsOptions
): Promise<ForumThreadsResponse> {
  const csrfToken = options?.csrfToken?.trim();
  const sessionId = options?.sessionId?.trim();
  const jwtHeaderPayload = options?.jwtHeaderPayload?.trim();
  const jwtSignature = options?.jwtSignature?.trim();

  const res = await fetch("/api/forum-threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(CLIENT_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      courseId,
      categoryName: options?.categoryName?.trim() || undefined,
      pageSize: options?.pageSize,
      since: options?.since?.trim() || undefined,
      knownThreads: options?.knownThreads,
      maxPages: options?.maxPages,
      ...(csrfToken
        ? {
            csrfToken,
            ...(sessionId ? { sessionId } : {}),
            ...(jwtHeaderPayload ? { jwtHeaderPayload } : {}),
            ...(jwtSignature ? { jwtSignature } : {}),
          }
        : {}),
    }),
  });

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as ForumThreadsResponse;
}
