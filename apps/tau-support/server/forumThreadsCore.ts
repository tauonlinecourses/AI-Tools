/**
 * Shared LMS login + Discussion API helpers (Stage 1: one page of threads).
 * Used by the Vercel API route and local Vite dev middleware.
 */

export interface ForumThread {
  id: string;
  title?: string;
  author?: string;
  author_label?: string | null;
  created_at?: string;
  updated_at?: string;
  modified_at?: string;
  last_activity_at?: string;
  comment_count?: number;
  raw_body?: string;
  rendered_body?: string;
  comment_list_url?: string | null;
  endorsed_comment_list_url?: string | null;
  non_endorsed_comment_list_url?: string | null;
  comments?: ForumComment[];
  comments_error?: string;
  [key: string]: unknown;
}

export interface ForumComment {
  id: string;
  author?: string;
  author_label?: string | null;
  created_at?: string;
  updated_at?: string;
  raw_body?: string;
  rendered_body?: string;
  parent_id?: string | null;
  endorsed?: boolean;
  child_count?: number;
  children?: ForumComment[];
}

export interface FetchRequestStats {
  /** HTTP calls made for password/cookie login (0 when browser cookies were used). */
  loginRequests: number;
  /** GET calls to course topics, threads, and comments after auth. */
  forumApiRequests: number;
  totalRequests: number;
  usedCookies: boolean;
  durationMs: number;
}

export interface KnownThreadSnapshot {
  id: string;
  last_activity_at?: string;
  comment_count?: number;
}

export interface FetchForumThreadsResult {
  courseId: string;
  totalCount: number | null;
  pageSize: number;
  threads: ForumThread[];
  categoryName?: string;
  topicIds?: string[];
  /** Discussions MFE origin for opening threads in the browser (e.g. app.campus.gov.il). */
  forumUiOrigin: string;
  requestStats: FetchRequestStats;
  /** ISO watermark used for this poll (echo of request `since`). */
  since?: string;
  /** True when paging stopped because activity fell at/below `since`. */
  reachedSinceWatermark?: boolean;
  /** Pages of thread listings walked (1 when not using since). */
  pagesFetched?: number;
}

export interface LmsSessionCredentials {
  csrfToken: string;
  /**
   * Classic Django session cookie. Often missing on Campus IL browser logins;
   * prefer JWT cookies below when sessionid is not present.
   */
  sessionId?: string;
  /** Campus IL / Open edX MFE auth — cookie `edx-jwt-cookie-header-payload` */
  jwtHeaderPayload?: string;
  /** Campus IL / Open edX MFE auth — cookie `edx-jwt-cookie-signature` */
  jwtSignature?: string;
}

export interface FetchForumThreadsOptions {
  pageSize?: number;
  /** Forum category/topic display name, e.g. "בעיות טכניות" */
  categoryName?: string;
  /** Skip name lookup when the topic id is already known */
  topicId?: string;
  /** Browser session cookies — skips password login when set */
  session?: LmsSessionCredentials;
  /**
   * ISO timestamp watermark. When set, walks thread pages (newest first) and
   * keeps only threads with activity newer than this value.
   */
  since?: string;
  /**
   * Previously stored thread snapshots. Threads with unchanged activity are
   * omitted from the response; only new/updated ids get comment hydration.
   */
  knownThreads?: KnownThreadSnapshot[];
  /** Safety cap when paging with `since` (default 5). */
  maxPages?: number;
}

function hasBrowserSession(session?: Partial<LmsSessionCredentials> | null): boolean {
  if (!session?.csrfToken?.trim()) return false;
  if (session.sessionId?.trim()) return true;
  return Boolean(
    session.jwtHeaderPayload?.trim() && session.jwtSignature?.trim()
  );
}

/** Join Campus IL split JWT cookies into a full JWT (Open edX JWT_DELIMITER is "."). */
function reconstituteJwt(
  headerPayload: string,
  signature: string
): string | undefined {
  const stripQuotes = (value: string) => value.trim().replace(/^"+|"+$/g, "");
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const hp = decode(stripQuotes(headerPayload));
  const sig = decode(stripQuotes(signature));
  if (!hp || !sig) return undefined;
  if (hp.endsWith(".")) return `${hp}${sig}`;
  return `${hp}.${sig}`;
}

function buildManualCookieJar(session: LmsSessionCredentials): {
  cookieJar: string;
  jwtAuthorization?: string;
} {
  const parts: string[] = [`csrftoken=${session.csrfToken.trim()}`];
  if (session.sessionId?.trim()) {
    parts.push(`sessionid=${session.sessionId.trim()}`);
  }

  let jwtAuthorization: string | undefined;
  if (session.jwtHeaderPayload?.trim() && session.jwtSignature?.trim()) {
    const jwt = reconstituteJwt(
      session.jwtHeaderPayload,
      session.jwtSignature
    );
    if (jwt) {
      jwtAuthorization = `JWT ${jwt}`;
      parts.push(
        `edx-jwt-cookie-header-payload=${session.jwtHeaderPayload.trim()}`
      );
      parts.push(`edx-jwt-cookie-signature=${session.jwtSignature.trim()}`);
      // Also send the reconstituted cookie LMS middleware would build.
      parts.push(`edx-jwt-cookie=${jwt}`);
      parts.push("edxloggedin=true");
    }
  }

  return { cookieJar: parts.join("; "), jwtAuthorization };
}

export interface ParsedForumThreadsRequest {
  courseId: string;
  categoryName?: string;
  pageSize?: number;
  session?: LmsSessionCredentials;
  since?: string;
  knownThreads?: KnownThreadSnapshot[];
  maxPages?: number;
}

interface LmsAuth {
  cookieJar: string;
  csrftoken: string;
  /** e.g. "JWT eyJhbGciOi..." — preferred for Discussion API with browser JWT cookies */
  jwtAuthorization?: string;
}

function authHeaders(auth: LmsAuth): Record<string, string> {
  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    Cookie: auth.cookieJar,
    "X-CSRFToken": auth.csrftoken,
    Referer: `${CAMPUS_APP_ORIGIN}/`,
    Origin: CAMPUS_APP_ORIGIN,
  };
  if (auth.jwtAuthorization) {
    headers.Authorization = auth.jwtAuthorization;
  }
  return headers;
}

interface DiscussionTopic {
  id?: string;
  name?: string;
  children?: DiscussionTopic[];
  thread_list_url?: string;
}

export class ForumThreadsError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "ForumThreadsError";
  }
}

/** Campus IL bot/CAPTCHA gate — stop immediately; do not retry or hammer the API. */
export class CaptchaBlockedError extends ForumThreadsError {
  constructor(message?: string) {
    super(
      message ??
        "Campus IL is asking for human verification (CAPTCHA). " +
          "Stop automated runs now. Log in manually at courses.campus.gov.il, " +
          "complete the security check, then paste fresh browser cookies " +
          "(csrftoken + edx-jwt-cookie-header-payload + edx-jwt-cookie-signature) " +
          "with “Use browser cookies”. Wait at least 30–60 minutes before " +
          "trying password login again.",
      429
    );
    this.name = "CaptchaBlockedError";
  }
}

export function isCaptchaBlockedError(err: unknown): err is CaptchaBlockedError {
  return err instanceof CaptchaBlockedError;
}

const LMS_REQUEST_TIMEOUT_MS = 30_000;

type LmsRequestKind = "login" | "forum";

class RequestStatsTracker {
  loginRequests = 0;
  forumApiRequests = 0;

  record(kind: LmsRequestKind): void {
    if (kind === "login") {
      this.loginRequests++;
    } else {
      this.forumApiRequests++;
    }
  }

  toStats(usedCookies: boolean, durationMs: number): FetchRequestStats {
    return {
      loginRequests: this.loginRequests,
      forumApiRequests: this.forumApiRequests,
      totalRequests: this.loginRequests + this.forumApiRequests,
      usedCookies,
      durationMs,
    };
  }
}

let activeRequestTracker: RequestStatsTracker | null = null;
const CAPTCHA_MARKERS = [
  "confirm you are human",
  "let's confirm you are human",
  "security check before continuing",
  "verify that you are not a bot",
  "not a bot",
  "hcaptcha",
  "recaptcha",
  "g-recaptcha",
  "cf-turnstile",
  "challenge-platform",
  "captcha",
];

function isCaptchaChallenge(body: string): boolean {
  const sample = body.slice(0, 12_000).toLowerCase();
  return CAPTCHA_MARKERS.some((marker) => sample.includes(marker));
}

function looksLikeHtmlDocument(body: string): boolean {
  const trimmed = body.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

function rethrowIfCaptcha(err: unknown): void {
  if (isCaptchaBlockedError(err)) {
    throw err;
  }
}

async function lmsFetch(
  url: string,
  init: RequestInit = {},
  kind: LmsRequestKind = "forum"
): Promise<Response> {
  activeRequestTracker?.record(kind);

  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(LMS_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new ForumThreadsError(
        `Campus IL did not respond within ${LMS_REQUEST_TIMEOUT_MS / 1000}s. ` +
          "The site may be slow or blocking automated access. Use browser cookies " +
          "and wait before retrying.",
        504
      );
    }
    throw err;
  }
}

function parseLmsJsonBody<T>(body: string, url: string): T {
  if (isCaptchaChallenge(body)) {
    throw new CaptchaBlockedError();
  }

  if (looksLikeHtmlDocument(body)) {
    throw new ForumThreadsError(
      `Campus IL returned an HTML page instead of JSON. Your session may have ` +
        `expired or a CAPTCHA is required — log in in the browser and refresh ` +
        `your cookies. (${url})`,
      403
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ForumThreadsError(
      `Campus IL returned invalid JSON. ${body.slice(0, 200)}`,
      502
    );
  }
}

async function readLmsResponseBody(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

function assertNotCaptcha(body: string): void {
  if (isCaptchaChallenge(body)) {
    throw new CaptchaBlockedError();
  }
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

const CAMPUS_APP_ORIGIN = "https://app.campus.gov.il";
const CAMPUS_COURSES_ORIGIN = "https://courses.campus.gov.il";

interface LoginAttempt {
  label: string;
  origin: string;
  apiVersion: "v1" | "v2";
  referer: string;
  buildBody: (emailOrUsername: string, password: string) => URLSearchParams;
}

function getCookie(setCookieHeaders: string[], name: string): string | null {
  for (const line of setCookieHeaders) {
    const match = line.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function extractSetCookieHeaders(headers: Headers): string[] {
  // Node/undici exposes multiple Set-Cookie headers via getSetCookie().
  // Iterating headers.entries() often misses them (forbidden header name).
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  return [...headers]
    .filter(([key]) => key.toLowerCase() === "set-cookie")
    .map(([, value]) => value);
}

function getCookieFromJar(cookieJar: string, name: string): string | null {
  const match = cookieJar.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? match[1] : null;
}

interface LoginJsonResponse {
  success?: boolean;
  redirect_url?: string;
  value?: string;
  error_code?: string;
}

function parseLoginJson(body: string): LoginJsonResponse | null {
  try {
    return JSON.parse(body) as LoginJsonResponse;
  } catch {
    return null;
  }
}

async function followRedirectCookies(
  url: string,
  cookieJar: string
): Promise<string> {
  let currentUrl = url;
  let jar = cookieJar;

  for (let i = 0; i < 5; i++) {
    const res = await lmsFetch(
      currentUrl,
      {
        redirect: "manual",
        headers: { ...BROWSER_HEADERS, Cookie: jar },
      },
      "login"
    );
    jar = mergeCookieJar(jar, extractSetCookieHeaders(res.headers));

    const location = res.headers.get("location");
    if (location && isCaptchaChallenge(location)) {
      throw new CaptchaBlockedError();
    }
    if (!location || res.status < 300 || res.status >= 400) {
      break;
    }
    currentUrl = new URL(location, currentUrl).href;
  }

  return jar;
}

async function finalizeLoginSession(
  initialJar: string,
  setCookies: string[],
  csrftoken: string,
  body: string
): Promise<{ cookieJar: string; csrftoken: string } | null> {
  let cookieJar = mergeCookieJar(initialJar, setCookies);
  let newCsrf = getCookie(setCookies, "csrftoken") || csrftoken;
  const loginJson = parseLoginJson(body);

  if (loginJson?.success) {
    // Login succeeded. On many Open edX installs the sessionid was already issued
    // during the CSRF handshake (GET login_session) and is reused after POST —
    // Set-Cookie may not repeat sessionid even though the session is authenticated.
    if (loginJson.redirect_url) {
      cookieJar = await followRedirectCookies(loginJson.redirect_url, cookieJar);
      newCsrf = getCookieFromJar(cookieJar, "csrftoken") || newCsrf;
    }
    return { cookieJar, csrftoken: newCsrf };
  }

  let sessionid =
    getCookie(setCookies, "sessionid") || getCookieFromJar(cookieJar, "sessionid");

  if (!sessionid && loginJson?.redirect_url) {
    cookieJar = await followRedirectCookies(loginJson.redirect_url, cookieJar);
    newCsrf = getCookieFromJar(cookieJar, "csrftoken") || newCsrf;
    sessionid = getCookieFromJar(cookieJar, "sessionid");
  }

  if (sessionid) {
    return { cookieJar, csrftoken: newCsrf };
  }

  return null;
}

function mergeCookieJar(existing: string, setCookieHeaders: string[]): string {
  const jar = new Map<string, string>();

  for (const part of existing.split("; ").filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    if (name) jar.set(name, rest.join("="));
  }

  for (const line of setCookieHeaders) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair.split("=");
    if (name) jar.set(name, rest.join("="));
  }

  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function normalizeEnv(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Strip accidental trailing newline from .env values without trimming passwords. */
function normalizeSecret(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.replace(/\r?\n$/, "");
  return normalized.length > 0 ? normalized : undefined;
}

function parseLoginFailure(body: string, status: number): string {
  if (isCaptchaChallenge(body)) {
    return new CaptchaBlockedError().message;
  }

  try {
    const outer = JSON.parse(body) as {
      success?: boolean;
      value?: unknown;
      error_code?: string;
    };

    if (outer.success) {
      return "Login succeeded but session cookies could not be established.";
    }
    let message: string | undefined;

    if (typeof outer.value === "string") {
      try {
        const inner = JSON.parse(outer.value) as { value?: string };
        message = inner.value ?? outer.value;
      } catch {
        message = outer.value;
      }
    }

    if (message) {
      if (
        message.includes("error receiving your login information") ||
        message.includes("קבלת מידע התחברות")
      ) {
        return (
          "Login fields were rejected by the LMS (missing or malformed email/password). " +
          "Ensure LMS_USERNAME is your login email and LMS_PASSWORD has no extra quotes or newlines in .env."
        );
      }
      if (
        message.toLowerCase().includes("email or password is incorrect") ||
        message.includes("סיסמה") ||
        message.includes("שגוי")
      ) {
        return `Login rejected: ${message}`;
      }
      return `Login failed (${status}): ${message}`;
    }

    if (outer.error_code) {
      return `Login failed (${status}): ${outer.error_code}`;
    }
  } catch {
    // fall through
  }

  return `Login failed (${status})${body ? `: ${body.slice(0, 200)}` : ""}`;
}

/** Campus IL splits UI (app.*) from the LMS API backend (courses.*). */
function resolveApiOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.hostname === "app.campus.gov.il") {
    return CAMPUS_COURSES_ORIGIN;
  }
  return baseUrl.replace(/\/$/, "");
}

/** Where learners open forum threads in the browser (discussions MFE). */
export function resolveForumUiOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (
    url.hostname === "courses.campus.gov.il" ||
    url.hostname === "app.campus.gov.il"
  ) {
    return CAMPUS_APP_ORIGIN;
  }
  return baseUrl.replace(/\/$/, "");
}

export function buildForumThreadUrl(
  forumUiOrigin: string,
  courseId: string,
  threadId: string,
  categoryName?: string
): string {
  const base = forumUiOrigin.replace(/\/$/, "");
  const trimmedCategory = categoryName?.trim();

  if (trimmedCategory) {
    return `${base}/discussions/${courseId}/category/${encodeURIComponent(trimmedCategory)}/posts/${threadId}`;
  }

  return `${base}/discussions/${courseId}/posts/${threadId}`;
}

function getLmsConfig(sessionOverride?: Partial<LmsSessionCredentials>) {
  const baseUrl = process.env.LMS_BASE_URL?.replace(/\/$/, "") || "";
  const username = normalizeEnv(process.env.LMS_USERNAME);
  const password = normalizeSecret(process.env.LMS_PASSWORD);
  const sessionId =
    normalizeEnv(sessionOverride?.sessionId) ||
    normalizeEnv(process.env.LMS_SESSION_ID);
  const csrfToken =
    normalizeEnv(sessionOverride?.csrfToken) ||
    normalizeEnv(process.env.LMS_CSRF_TOKEN);
  const jwtHeaderPayload =
    normalizeEnv(sessionOverride?.jwtHeaderPayload) ||
    normalizeEnv(process.env.LMS_JWT_HEADER_PAYLOAD);
  const jwtSignature =
    normalizeEnv(sessionOverride?.jwtSignature) ||
    normalizeEnv(process.env.LMS_JWT_SIGNATURE);

  if (!baseUrl || baseUrl.includes("your-campus-domain")) {
    throw new ForumThreadsError(
      "LMS_BASE_URL is not configured on the server.",
      500
    );
  }

  const browserSession: LmsSessionCredentials | undefined = csrfToken
    ? {
        csrfToken,
        sessionId,
        jwtHeaderPayload,
        jwtSignature,
      }
    : undefined;
  const hasManualSession = hasBrowserSession(browserSession);

  if (!hasManualSession && (!username || !password)) {
    throw new ForumThreadsError(
      "Enter browser cookies in the form (csrftoken + JWT cookies, or sessionid), " +
        "or set LMS_USERNAME and LMS_PASSWORD on the server.",
      400
    );
  }

  return {
    baseUrl,
    apiOrigin: resolveApiOrigin(baseUrl),
    username,
    password,
    browserSession,
    hasManualSession,
  };
}

export function parseForumThreadsRequestBody(
  body: unknown
): ParsedForumThreadsRequest | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body." };
  }

  const record = body as Record<string, unknown>;
  const courseId = record.courseId;

  if (!courseId || typeof courseId !== "string") {
    return { error: "Missing courseId" };
  }

  const categoryName =
    typeof record.categoryName === "string" && record.categoryName.trim()
      ? record.categoryName.trim()
      : undefined;

  const pageSizeRaw = record.pageSize;
  const pageSize =
    typeof pageSizeRaw === "number" && Number.isFinite(pageSizeRaw)
      ? pageSizeRaw
      : typeof pageSizeRaw === "string" && pageSizeRaw.trim()
        ? Number(pageSizeRaw)
        : undefined;

  const sessionId =
    typeof record.sessionId === "string" ? record.sessionId.trim() : "";
  const csrfToken =
    typeof record.csrfToken === "string" ? record.csrfToken.trim() : "";
  const jwtHeaderPayload =
    typeof record.jwtHeaderPayload === "string"
      ? record.jwtHeaderPayload.trim()
      : "";
  const jwtSignature =
    typeof record.jwtSignature === "string" ? record.jwtSignature.trim() : "";

  const sessionCandidate: LmsSessionCredentials | undefined = csrfToken
    ? {
        csrfToken,
        sessionId: sessionId || undefined,
        jwtHeaderPayload: jwtHeaderPayload || undefined,
        jwtSignature: jwtSignature || undefined,
      }
    : undefined;
  const session = hasBrowserSession(sessionCandidate)
    ? sessionCandidate
    : undefined;

  const sinceRaw =
    typeof record.since === "string" && record.since.trim()
      ? record.since.trim()
      : undefined;
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
  const since =
    sinceRaw && !Number.isNaN(sinceMs) ? new Date(sinceMs).toISOString() : undefined;

  const knownThreadsRaw = record.knownThreads;
  const knownThreads: KnownThreadSnapshot[] | undefined = Array.isArray(
    knownThreadsRaw
  )
    ? knownThreadsRaw
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object"
        )
        .map((item) => ({
          id: typeof item.id === "string" ? item.id : "",
          last_activity_at:
            typeof item.last_activity_at === "string"
              ? item.last_activity_at
              : undefined,
          comment_count:
            typeof item.comment_count === "number" &&
            Number.isFinite(item.comment_count)
              ? item.comment_count
              : undefined,
        }))
        .filter((item) => item.id)
    : undefined;

  const maxPagesRaw = record.maxPages;
  const maxPages =
    typeof maxPagesRaw === "number" && Number.isFinite(maxPagesRaw)
      ? maxPagesRaw
      : typeof maxPagesRaw === "string" && maxPagesRaw.trim()
        ? Number(maxPagesRaw)
        : undefined;

  return {
    courseId,
    categoryName,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    session,
    since,
    knownThreads:
      knownThreads && knownThreads.length > 0 ? knownThreads : undefined,
    maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
  };
}

function campusLoginAttempts(): LoginAttempt[] {
  return [
    {
      label: "campus IL authn v2",
      origin: CAMPUS_COURSES_ORIGIN,
      apiVersion: "v2",
      referer: `${CAMPUS_APP_ORIGIN}/authn/login`,
      buildBody: (emailOrUsername, password) =>
        new URLSearchParams({
          email_or_username: emailOrUsername,
          password,
          next: "/",
        }),
    },
    {
      label: "Open edX v2",
      origin: CAMPUS_COURSES_ORIGIN,
      apiVersion: "v2",
      referer: `${CAMPUS_COURSES_ORIGIN}/login`,
      buildBody: (emailOrUsername, password) =>
        new URLSearchParams({
          email_or_username: emailOrUsername,
          password,
          next: "/",
        }),
    },
    {
      label: "Open edX v1",
      origin: CAMPUS_COURSES_ORIGIN,
      apiVersion: "v1",
      referer: `${CAMPUS_COURSES_ORIGIN}/login`,
      // v1 requires POST keys named "email" and "password" — NOT email_or_username.
      buildBody: (emailOrUsername, password) =>
        new URLSearchParams({
          email: emailOrUsername,
          password,
        }),
    },
  ];
}

function genericLoginAttempts(origin: string): LoginAttempt[] {
  return [
    {
      label: "Open edX v2",
      origin,
      apiVersion: "v2",
      referer: `${origin}/login`,
      buildBody: (emailOrUsername, password) =>
        new URLSearchParams({
          email_or_username: emailOrUsername,
          password,
          next: "/",
        }),
    },
    {
      label: "Open edX v1",
      origin,
      apiVersion: "v1",
      referer: `${origin}/login`,
      buildBody: (emailOrUsername, password) =>
        new URLSearchParams({
          email: emailOrUsername,
          password,
        }),
    },
  ];
}

async function obtainLoginCookies(authOrigin: string): Promise<{
  authOrigin: string;
  cookieJar: string;
  csrftoken: string;
}> {
  const loginTargets = [authOrigin];

  if (
    authOrigin !== CAMPUS_COURSES_ORIGIN &&
    authOrigin.includes("campus.gov.il")
  ) {
    loginTargets.push(CAMPUS_COURSES_ORIGIN);
  }

  for (const origin of loginTargets) {
    const loginPageRes = await lmsFetch(
      `${origin}/login`,
      {
        redirect: "manual",
        headers: BROWSER_HEADERS,
      },
      "login"
    );
    const loginPageHtml = await readLmsResponseBody(loginPageRes);
    assertNotCaptcha(loginPageHtml);

    let setCookies = extractSetCookieHeaders(loginPageRes.headers);
    let csrftoken = getCookie(setCookies, "csrftoken");
    let cookieJar = setCookies.map((c) => c.split(";")[0]).join("; ");

    for (const apiVersion of ["v2", "v1"] as const) {
      const sessionFormRes = await lmsFetch(
        `${origin}/api/user/${apiVersion}/account/login_session/`,
        {
          headers: { ...BROWSER_HEADERS, Cookie: cookieJar },
        },
        "login"
      );
      const sessionBody = await readLmsResponseBody(sessionFormRes);
      assertNotCaptcha(sessionBody);

      const sessionCookies = extractSetCookieHeaders(sessionFormRes.headers);
      cookieJar = mergeCookieJar(cookieJar, sessionCookies);
      csrftoken = getCookie(sessionCookies, "csrftoken") || csrftoken;
    }

    if (csrftoken) {
      return { authOrigin: origin, cookieJar, csrftoken };
    }
  }

  throw new ForumThreadsError(
    "Could not get csrftoken from /login — campus IL may be showing a CAPTCHA " +
      "or blocking automated access. Use “Use browser cookies” after logging in " +
      "manually, or set LMS_SESSION_ID and LMS_CSRF_TOKEN in .env.",
    502
  );
}

async function loginWithPassword(
  apiOrigin: string,
  username: string,
  password: string
) {
  const { authOrigin, cookieJar: initialJar, csrftoken } =
    await obtainLoginCookies(apiOrigin);

  const attempts = apiOrigin.includes("campus.gov.il")
    ? campusLoginAttempts()
    : genericLoginAttempts(authOrigin);

  const failures: string[] = [];

  for (const attempt of attempts) {
    const loginRes = await lmsFetch(
      `${attempt.origin}/api/user/${attempt.apiVersion}/account/login_session/`,
      {
        method: "POST",
        headers: {
          ...BROWSER_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": csrftoken,
          Cookie: initialJar,
          Referer: attempt.referer,
          Origin: new URL(attempt.referer).origin,
        },
        body: attempt.buildBody(username, password),
        redirect: "manual",
      },
      "login"
    );

    const body = await readLmsResponseBody(loginRes);
    if (isCaptchaChallenge(body)) {
      throw new CaptchaBlockedError();
    }

    const setCookies2 = extractSetCookieHeaders(loginRes.headers);

    const finalized = await finalizeLoginSession(
      initialJar,
      setCookies2,
      csrftoken,
      body
    );
    if (finalized) {
      return finalized;
    }

    failures.push(`${attempt.label}: ${parseLoginFailure(body, loginRes.status)}`);
  }

  throw new ForumThreadsError(
    `All login attempts failed. ${failures.join(" | ")}`,
    401
  );
}

async function loginFromConfig(config: ReturnType<typeof getLmsConfig>): Promise<LmsAuth> {
  if (config.hasManualSession && config.browserSession) {
    const manual = buildManualCookieJar(config.browserSession);
    return {
      cookieJar: manual.cookieJar,
      csrftoken: config.browserSession.csrfToken,
      jwtAuthorization: manual.jwtAuthorization,
    };
  }

  const passwordAuth = await loginWithPassword(
    config.apiOrigin,
    config.username!,
    config.password!
  );
  return {
    cookieJar: passwordAuth.cookieJar,
    csrftoken: passwordAuth.csrftoken,
  };
}

function normalizeTopicName(name: string): string {
  return name.trim().normalize("NFC");
}

function topicIdsFromThreadListUrl(url: string): string[] {
  try {
    return new URL(url).searchParams.getAll("topic_id");
  } catch {
    return [];
  }
}

function collectTopicIds(topic: DiscussionTopic): string[] {
  const ids: string[] = [];
  if (topic.id) ids.push(topic.id);
  for (const child of topic.children ?? []) {
    ids.push(...collectTopicIds(child));
  }
  const fromUrl = topic.thread_list_url
    ? topicIdsFromThreadListUrl(topic.thread_list_url)
    : [];
  return [...new Set([...ids, ...fromUrl])];
}

function findTopicIdsByCategoryName(
  topicGroups: DiscussionTopic[][],
  categoryName: string
): string[] {
  const target = normalizeTopicName(categoryName);

  function walk(topics: DiscussionTopic[]): string[] | null {
    for (const topic of topics) {
      const name = topic.name ? normalizeTopicName(topic.name) : "";
      if (name === target) {
        return collectTopicIds(topic);
      }
      const nested = walk(topic.children ?? []);
      if (nested) return nested;
    }
    return null;
  }

  for (const group of topicGroups) {
    const found = walk(group);
    if (found && found.length > 0) return found;
  }

  return [];
}

async function fetchCourseTopicGroups(
  apiOrigin: string,
  courseId: string,
  auth: LmsAuth
): Promise<DiscussionTopic[][]> {
  const url = `${apiOrigin}/api/discussion/v1/course_topics/${encodeURIComponent(courseId)}/`;
  const res = await lmsFetch(url, {
    headers: authHeaders(auth),
  });

  const body = await readLmsResponseBody(res);

  if (!res.ok) {
    if (isCaptchaChallenge(body)) {
      throw new CaptchaBlockedError();
    }
    if (res.status === 401) {
      throw new ForumThreadsError(
        "Authentication failed (401). Campus IL did not accept the browser cookies. " +
          "Open https://app.campus.gov.il/discussions (while logged in) to refresh JWT cookies, " +
          "then copy fresh csrftoken + edx-jwt-cookie-header-payload + edx-jwt-cookie-signature " +
          "from https://courses.campus.gov.il cookies and try again. " +
          `Details: ${body.slice(0, 160)}`,
        401
      );
    }
    throw new ForumThreadsError(
      `Could not load forum categories (${res.status}). ${body.slice(0, 200)}`,
      res.status === 403 ? 403 : 502
    );
  }

  const data = parseLmsJsonBody<{
    courseware_topics?: DiscussionTopic[];
    non_courseware_topics?: DiscussionTopic[];
  }>(body, url);

  return [data.courseware_topics ?? [], data.non_courseware_topics ?? []];
}

async function resolveTopicIds(
  apiOrigin: string,
  courseId: string,
  auth: LmsAuth,
  options: FetchForumThreadsOptions
): Promise<{ categoryName?: string; topicIds: string[] }> {
  if (options.topicId?.trim()) {
    return { topicIds: [options.topicId.trim()] };
  }

  const categoryName = options.categoryName?.trim();
  if (!categoryName) {
    return { topicIds: [] };
  }

  const groups = await fetchCourseTopicGroups(apiOrigin, courseId, auth);
  const topicIds = findTopicIdsByCategoryName(groups, categoryName);

  if (topicIds.length === 0) {
    throw new ForumThreadsError(
      `No forum category named "${categoryName}" was found in this course. Check spelling or leave the category empty to search all forums.`,
      404
    );
  }

  return { categoryName, topicIds };
}

function buildThreadsUrl(
  apiOrigin: string,
  courseId: string,
  pageSize: number,
  topicIds: string[],
  page = 1
): string {
  const params = new URLSearchParams({
    course_id: courseId,
    order_by: "last_activity_at",
    page_size: String(pageSize),
    page: String(page),
  });

  for (const topicId of topicIds) {
    params.append("topic_id", topicId);
  }

  return `${apiOrigin}/api/discussion/v1/threads/?${params.toString()}`;
}

function threadActivityAt(thread: ForumThread): string | undefined {
  return (
    thread.last_activity_at ??
    thread.updated_at ??
    thread.modified_at ??
    thread.created_at
  );
}

function activityTimestampMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function buildKnownThreadMap(
  knownThreads?: KnownThreadSnapshot[]
): Map<string, KnownThreadSnapshot> {
  const map = new Map<string, KnownThreadSnapshot>();
  for (const item of knownThreads ?? []) {
    if (item.id) map.set(item.id, item);
  }
  return map;
}

function threadNeedsUpsert(
  thread: ForumThread,
  known: Map<string, KnownThreadSnapshot>
): boolean {
  const prev = known.get(thread.id);
  if (!prev) return true;

  const incomingMs = activityTimestampMs(threadActivityAt(thread));
  const knownMs = activityTimestampMs(prev.last_activity_at);
  if (incomingMs > knownMs) return true;

  const incomingCount = thread.comment_count ?? 0;
  const knownCount = prev.comment_count ?? 0;
  return incomingCount > knownCount;
}

async function lmsGetJson<T>(
  url: string,
  auth: LmsAuth
): Promise<T> {
  const res = await lmsFetch(url, {
    headers: authHeaders(auth),
  });

  const body = await readLmsResponseBody(res);

  if (isCaptchaChallenge(body)) {
    throw new CaptchaBlockedError();
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new ForumThreadsError(
        "Authentication failed (401). Refresh JWT cookies on app.campus.gov.il/discussions, " +
          "then paste fresh csrftoken + edx-jwt-cookie-* values. " +
          `Details: ${body.slice(0, 160)}`,
        401
      );
    }
    throw new ForumThreadsError(
      `LMS request failed (${res.status}). ${body.slice(0, 200)}`,
      res.status === 403 ? 403 : 502
    );
  }

  return parseLmsJsonBody<T>(body, url);
}

function resolveLmsUrl(url: string, apiOrigin: string): string {
  return new URL(url, apiOrigin).href;
}

function ensurePageSize(url: string, pageSize = 100): string {
  const resolved = new URL(url, "https://courses.campus.gov.il");
  if (!resolved.searchParams.has("page_size")) {
    resolved.searchParams.set("page_size", String(pageSize));
  }
  return resolved.href;
}

async function fetchPaginatedResults<T>(
  startUrl: string,
  auth: LmsAuth,
  apiOrigin: string
): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = ensurePageSize(
    resolveLmsUrl(startUrl, apiOrigin)
  );

  while (nextUrl) {
    try {
      const data: { results?: T[]; next?: string | null } = await lmsGetJson(
        nextUrl,
        auth
      );

      items.push(...(data.results ?? []));
      nextUrl = data.next ? resolveLmsUrl(data.next, apiOrigin) : null;
    } catch (err) {
      rethrowIfCaptcha(err);
      // Keep partial results when a later page fails (common with relative next URLs).
      if (items.length > 0) {
        break;
      }
      throw err;
    }
  }

  return items;
}

function commentListUrls(thread: ForumThread, apiOrigin: string): string[] {
  if (thread.comment_list_url) {
    return [thread.comment_list_url];
  }

  const urls: string[] = [];
  if (thread.endorsed_comment_list_url) {
    urls.push(thread.endorsed_comment_list_url);
  }
  if (thread.non_endorsed_comment_list_url) {
    urls.push(thread.non_endorsed_comment_list_url);
  }

  // Fallback when campus IL omits the split response URLs on the thread object.
  if (urls.length === 0 && (thread.comment_count ?? 0) > 0) {
    const params = new URLSearchParams({
      thread_id: thread.id,
      page_size: "100",
    });
    urls.push(`${apiOrigin}/api/discussion/v1/comments/?${params.toString()}`);
  }

  return urls;
}

function needsThreadDetail(thread: ForumThread): boolean {
  if ((thread.comment_count ?? 0) === 0) {
    return false;
  }
  return (
    !thread.endorsed_comment_list_url &&
    !thread.non_endorsed_comment_list_url &&
    !thread.comment_list_url
  );
}

function normalizeComment(raw: ForumComment): ForumComment {
  return {
    ...raw,
    children: (raw.children ?? []).map(normalizeComment),
  };
}

function sortComments(comments: ForumComment[]): ForumComment[] {
  return [...comments]
    .map(normalizeComment)
    .sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return aTime - bTime;
    });
}

function buildCommentForest(flat: ForumComment[]): ForumComment[] {
  const byId = new Map<string, ForumComment>();

  for (const item of flat) {
    byId.set(item.id, {
      ...item,
      // Ignore any embedded children from the API — rebuild from parent_id only
      // so we never render the same reply twice.
      children: [],
    });
  }

  const roots: ForumComment[] = [];

  for (const item of byId.values()) {
    const parentId = item.parent_id;
    if (parentId && byId.has(parentId)) {
      const parent = byId.get(parentId)!;
      parent.children = parent.children ?? [];
      if (!parent.children.some((child) => child.id === item.id)) {
        parent.children.push(item);
      }
    } else if (!parentId) {
      roots.push(item);
    }
  }

  return sortComments(
    roots.map((root) => ({
      ...root,
      children: sortComments(root.children ?? []),
    }))
  );
}

async function fetchChildComments(
  apiOrigin: string,
  auth: LmsAuth,
  threadId: string,
  parentCommentId: string
): Promise<ForumComment[]> {
  const params = new URLSearchParams({
    thread_id: threadId,
    comment_id: parentCommentId,
    page_size: "100",
  });
  const url = `${apiOrigin}/api/discussion/v1/comments/?${params.toString()}`;
  return fetchPaginatedResults<ForumComment>(url, auth, apiOrigin);
}

async function hydrateCommentTree(
  apiOrigin: string,
  auth: LmsAuth,
  threadId: string,
  comment: ForumComment
): Promise<ForumComment> {
  let children = comment.children ?? [];

  // Campus IL requires thread_id for nested replies. Only fetch when the API
  // indicates nested comments exist and they were not already returned flat.
  if (children.length === 0 && (comment.child_count ?? 0) > 0) {
    try {
      children = await fetchChildComments(
        apiOrigin,
        auth,
        threadId,
        comment.id
      );
    } catch (err) {
      rethrowIfCaptcha(err);
      children = [];
    }
  }

  const normalized = sortComments(
    children.map((child) => normalizeComment({ ...child, children: [] }))
  );
  const hydratedChildren = await Promise.all(
    normalized.map((child) =>
      hydrateCommentTree(apiOrigin, auth, threadId, child)
    )
  );

  return {
    ...comment,
    children: hydratedChildren,
  };
}

async function enrichThreadDetail(
  apiOrigin: string,
  auth: LmsAuth,
  thread: ForumThread
): Promise<ForumThread> {
  try {
    const detail = await lmsGetJson<ForumThread>(
      `${apiOrigin}/api/discussion/v1/threads/${encodeURIComponent(thread.id)}/`,
      auth
    );
    return { ...thread, ...detail, id: thread.id };
  } catch {
    return thread;
  }
}

function indexCommentsById(flat: ForumComment[]): Map<string, ForumComment> {
  const byId = new Map<string, ForumComment>();

  for (const item of flat) {
    const queue: ForumComment[] = [item];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (byId.has(current.id)) {
        continue;
      }

      byId.set(current.id, current);
      for (const child of current.children ?? []) {
        queue.push(child);
      }
    }
  }

  return byId;
}

async function fetchThreadComments(
  apiOrigin: string,
  auth: LmsAuth,
  thread: ForumThread
): Promise<ForumComment[]> {
  if ((thread.comment_count ?? 0) === 0) {
    return [];
  }

  const urls = commentListUrls(thread, apiOrigin).map((url) =>
    ensurePageSize(url)
  );
  const flat: ForumComment[] = [];
  const errors: string[] = [];

  const batches = await Promise.all(
    urls.map(async (url) => {
      try {
        return await fetchPaginatedResults<ForumComment>(url, auth, apiOrigin);
      } catch (err) {
        rethrowIfCaptcha(err);
        errors.push(err instanceof Error ? err.message : String(err));
        return [];
      }
    })
  );

  for (const batch of batches) {
    flat.push(...batch);
  }

  if (flat.length === 0 && errors.length > 0) {
    throw new ForumThreadsError(errors.join(" | "), 502);
  }

  const forest = buildCommentForest([...indexCommentsById(flat).values()]);

  return Promise.all(
    forest.map((response) =>
      hydrateCommentTree(apiOrigin, auth, thread.id, response)
    )
  );
}

async function attachCommentsToThreads(
  apiOrigin: string,
  auth: LmsAuth,
  threads: ForumThread[]
): Promise<ForumThread[]> {
  const results: ForumThread[] = [];

  for (const thread of threads) {
    const enriched = needsThreadDetail(thread)
      ? await enrichThreadDetail(apiOrigin, auth, thread)
      : thread;

    if ((enriched.comment_count ?? 0) === 0) {
      results.push({ ...enriched, comments: [] });
      continue;
    }

    try {
      const comments = await fetchThreadComments(apiOrigin, auth, enriched);
      results.push({ ...enriched, comments });
    } catch (err) {
      rethrowIfCaptcha(err);
      const message =
        err instanceof Error ? err.message : "Failed to load thread replies";
      results.push({ ...enriched, comments: [], comments_error: message });
    }
  }

  return results;
}

export async function fetchForumThreads(
  courseId: string,
  options?: FetchForumThreadsOptions
): Promise<FetchForumThreadsResult> {
  const trimmedCourseId = courseId.trim();
  if (!trimmedCourseId) {
    throw new ForumThreadsError("Missing courseId.");
  }

  const startedAt = Date.now();
  const tracker = new RequestStatsTracker();
  activeRequestTracker = tracker;

  try {
    const pageSize = Math.min(20, Math.max(1, options?.pageSize ?? 3));
    const since = options?.since?.trim() || undefined;
    const sinceMs = since ? activityTimestampMs(since) : 0;
    const useSince = Boolean(since && sinceMs > 0);
    const maxPages = Math.min(
      20,
      Math.max(1, options?.maxPages ?? (useSince ? 5 : 1))
    );
    const known = buildKnownThreadMap(options?.knownThreads);

    const config = getLmsConfig(options?.session);
    const usedCookies = config.hasManualSession;
    const auth = await loginFromConfig(config);

    const { categoryName, topicIds } = await resolveTopicIds(
      config.apiOrigin,
      trimmedCourseId,
      auth,
      options ?? {}
    );

    const collected: ForumThread[] = [];
    let totalCount: number | null = null;
    let pagesFetched = 0;
    let reachedSinceWatermark = false;
    let nextUrl: string | null = buildThreadsUrl(
      config.apiOrigin,
      trimmedCourseId,
      pageSize,
      topicIds,
      1
    );

    while (nextUrl && pagesFetched < maxPages) {
      type ThreadsPage = {
        count?: number;
        next?: string | null;
        results?: ForumThread[];
      };
      const page: ThreadsPage = await lmsGetJson<ThreadsPage>(nextUrl, auth);

      pagesFetched += 1;
      if (totalCount === null && typeof page.count === "number") {
        totalCount = page.count;
      }

      const pageThreads = page.results ?? [];
      if (pageThreads.length === 0) {
        break;
      }

      for (const thread of pageThreads) {
        const activityMs = activityTimestampMs(threadActivityAt(thread));
        if (useSince && activityMs > 0 && activityMs <= sinceMs) {
          reachedSinceWatermark = true;
          break;
        }
        if (threadNeedsUpsert(thread, known)) {
          collected.push(thread);
        }
      }

      if (reachedSinceWatermark) {
        break;
      }

      // Without a since watermark, only fetch the first page (legacy top-N).
      if (!useSince) {
        break;
      }

      nextUrl = page.next
        ? resolveLmsUrl(page.next, config.apiOrigin)
        : null;
    }

    const threads = await attachCommentsToThreads(
      config.apiOrigin,
      auth,
      collected
    );

    return {
      courseId: trimmedCourseId,
      totalCount,
      pageSize,
      threads,
      categoryName,
      topicIds: topicIds.length > 0 ? topicIds : undefined,
      forumUiOrigin: resolveForumUiOrigin(config.baseUrl),
      requestStats: tracker.toStats(usedCookies, Date.now() - startedAt),
      since,
      reachedSinceWatermark: useSince ? reachedSinceWatermark : undefined,
      pagesFetched,
    };
  } finally {
    activeRequestTracker = null;
  }
}
