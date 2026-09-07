import type {
  ForumThreadsResponse,
  KnownThreadSnapshot,
} from "./types";

export interface LmsSessionCredentials {
  csrfToken: string;
  sessionId?: string;
  jwtHeaderPayload?: string;
  jwtSignature?: string;
}

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
const LMS_LOGIN_TIMEOUT_MS = 60_000;

function readApiError(data: unknown, status: number): string {
  if (
    data &&
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return `Request failed (${status})`;
}

export function hasReusableSession(
  session?: Partial<LmsSessionCredentials> | null
): boolean {
  if (!session?.csrfToken?.trim()) return false;
  if (session.sessionId?.trim()) return true;
  return Boolean(
    session.jwtHeaderPayload?.trim() && session.jwtSignature?.trim()
  );
}

/** One-shot password login via server env; returns reusable session cookies. */
export async function fetchLmsLogin(): Promise<LmsSessionCredentials> {
  const res = await fetch("/api/lms-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(LMS_LOGIN_TIMEOUT_MS),
    body: "{}",
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readApiError(data, res.status));
  }

  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as LmsSessionCredentials).csrfToken !== "string"
  ) {
    throw new Error("Login response was missing session credentials.");
  }

  const session = data as LmsSessionCredentials;
  if (!hasReusableSession(session)) {
    throw new Error(
      "Login succeeded but no reusable session cookies were returned."
    );
  }

  return {
    csrfToken: session.csrfToken.trim(),
    ...(session.sessionId?.trim()
      ? { sessionId: session.sessionId.trim() }
      : {}),
    ...(session.jwtHeaderPayload?.trim()
      ? { jwtHeaderPayload: session.jwtHeaderPayload.trim() }
      : {}),
    ...(session.jwtSignature?.trim()
      ? { jwtSignature: session.jwtSignature.trim() }
      : {}),
  };
}

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
    throw new Error(readApiError(data, res.status));
  }

  return data as ForumThreadsResponse;
}
