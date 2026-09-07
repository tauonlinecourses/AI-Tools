import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageLayout, Button, Spinner } from "@workspace/ui";
import { AuthSettings, type AuthSettingsValues } from "./components/AuthSettings";
import {
  CourseSidebar,
  INBOX_SELECTION,
  type CourseCacheEntry,
} from "./components/CourseSidebar";
import { EmptySelection } from "./components/EmptySelection";
import { LoadThreadsButton } from "./components/LoadThreadsButton";
import { ThreadCard } from "./components/ThreadCard";
import { fetchForumThreads, fetchLmsLogin, hasReusableSession, type LmsSessionCredentials } from "./lib/api";
import { syncCourseThreadsToSupabase } from "./lib/supabaseSync";
import {
  CHECK_ALL_GAP_MS,
  checkAllCourseList,
  checkAllStopMessage,
  classifyCheckAllStop,
  clearCheckAllCursor,
  formatElapsedHe,
  hasIncompleteCheckAll,
  isBrowserOffline,
  isCaptchaError,
  loadCheckAllCursor,
  refreshCheckAllLock,
  releaseCheckAllLock,
  saveCheckAllCursor,
  tryAcquireCheckAllLock,
  waitCheckAllGap,
  type CheckAllCursor,
  type CheckAllProgress,
  type CheckAllStopKind,
  type CheckAllSummary,
} from "./lib/checkAllRun";
import { COURSES, findCourseById } from "./lib/courses";
import {
  countNewAcrossStore,
  countNewForCourse,
  getCourseBucket,
  knownSnapshotsForCourse,
  listGlobalInbox,
  loadThreadStore,
  markThreadSeen,
  mergeCoursePoll,
  saveThreadStore,
  setThreadNoAnswerNeeded,
  sortedEntriesForCourse,
  type ThreadStore,
} from "./lib/threadStore";
import { countUnanswered, entryNeedsAnswer } from "./lib/unanswered";
import type { ForumThread, ForumThreadsResponse } from "./lib/types";

type InboxFilter = "all" | "unanswered";

const SESSION_STORAGE_KEY = "tau-support-use-cookies";
const CSRF_STORAGE_KEY = "tau-support-csrf-token";
const JWT_PAYLOAD_STORAGE_KEY = "tau-support-jwt-payload";
const JWT_SIGNATURE_STORAGE_KEY = "tau-support-jwt-signature";
const RUN_SESSION_STORAGE_KEY = "tau-support-check-all-run-session";

type SyncStatus =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      lastResponse?: ForumThreadsResponse;
      upsertedCount?: number;
    };

function readStoredAuth() {
  try {
    const storedCookiesPref = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return {
      useCookies: storedCookiesPref === null ? true : storedCookiesPref === "1",
      csrfToken: sessionStorage.getItem(CSRF_STORAGE_KEY) ?? "",
      jwtHeaderPayload: sessionStorage.getItem(JWT_PAYLOAD_STORAGE_KEY) ?? "",
      jwtSignature: sessionStorage.getItem(JWT_SIGNATURE_STORAGE_KEY) ?? "",
    };
  } catch {
    return {
      useCookies: true,
      csrfToken: "",
      jwtHeaderPayload: "",
      jwtSignature: "",
    };
  }
}

function hasCookieAuth(auth: {
  csrfToken: string;
  jwtHeaderPayload: string;
  jwtSignature: string;
}): boolean {
  return hasReusableSession({
    csrfToken: auth.csrfToken,
    jwtHeaderPayload: auth.jwtHeaderPayload,
    jwtSignature: auth.jwtSignature,
  });
}

function loadRunSession(): LmsSessionCredentials | null {
  try {
    const raw = sessionStorage.getItem(RUN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const session = parsed as LmsSessionCredentials;
    return hasReusableSession(session) ? session : null;
  } catch {
    return null;
  }
}

function saveRunSession(session: LmsSessionCredentials): void {
  try {
    sessionStorage.setItem(RUN_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

function clearRunSession(): void {
  try {
    sessionStorage.removeItem(RUN_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function formatFetchError(err: unknown): string {
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return (
      "Request timed out after 3 minutes. Campus IL may be slow or blocking " +
      "access — use browser cookies, load fewer threads, and wait before retrying."
    );
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Something went wrong";
}

const AUTH_REQUIRED_MESSAGE =
  "בדוק הכל דורש עוגיות דפדפן (csrftoken + JWT) בהגדרות, או כבו את ״Use browser cookies״ והגדירו LMS_USERNAME / LMS_PASSWORD בשרת (התחברות חד-פעמית לכל הריצה).";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function RequestStatsLine({
  stats,
}: {
  stats: NonNullable<ForumThreadsResponse["requestStats"]>;
}) {
  const authLabel = stats.usedCookies
    ? "browser cookies (no password login)"
    : `${stats.loginRequests} login request${stats.loginRequests === 1 ? "" : "s"}`;

  return (
    <p className="text-[11px] leading-snug text-surface-400" dir="ltr">
      This run: {authLabel} · {stats.forumApiRequests} forum API request
      {stats.forumApiRequests === 1 ? "" : "s"} · {stats.totalRequests} total ·{" "}
      {formatDuration(stats.durationMs)}
    </p>
  );
}

function courseDisplayName(courseId: string): string {
  const course = findCourseById(courseId);
  return course?.nameHe || course?.name || courseId;
}

function unansweredFirstCourseIds(
  courses: typeof COURSES,
  store: ThreadStore
): string[] {
  const withUnanswered: string[] = [];
  const withoutUnanswered: string[] = [];
  for (const course of courses) {
    const entries = Object.values(getCourseBucket(store, course.id).threads);
    if (entries.length > 0 && countUnanswered(entries) > 0) {
      withUnanswered.push(course.id);
    } else {
      withoutUnanswered.push(course.id);
    }
  }
  return [...withUnanswered, ...withoutUnanswered];
}

function newCheckAllTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Math.random().toString(36).slice(2)}`;
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function App() {
  const storedAuth = readStoredAuth();
  const [auth, setAuth] = useState<AuthSettingsValues>({
    threadCount: "3",
    useCookies: storedAuth.useCookies,
    csrfToken: storedAuth.csrfToken,
    jwtHeaderPayload: storedAuth.jwtHeaderPayload,
    jwtSignature: storedAuth.jwtSignature,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadStore, setThreadStore] = useState<ThreadStore>(() =>
    loadThreadStore()
  );
  const [syncByCourse, setSyncByCourse] = useState<Record<string, SyncStatus>>(
    {}
  );
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkAllError, setCheckAllError] = useState<string | null>(null);
  const [checkAllStats, setCheckAllStats] = useState<
    ForumThreadsResponse["requestStats"] | null
  >(null);
  const [checkAllProgress, setCheckAllProgress] =
    useState<CheckAllProgress | null>(null);
  const [checkAllSummary, setCheckAllSummary] =
    useState<CheckAllSummary | null>(null);
  const [checkAllCursor, setCheckAllCursor] = useState<CheckAllCursor | null>(
    () => loadCheckAllCursor()
  );
  const [checkAllFrozenOrder, setCheckAllFrozenOrder] = useState<
    string[] | null
  >(null);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");

  const threadStoreRef = useRef(threadStore);
  threadStoreRef.current = threadStore;
  const syncRef = useRef(syncByCourse);
  syncRef.current = syncByCourse;
  const authRef = useRef(auth);
  authRef.current = auth;
  const checkAllCancelRef = useRef(false);
  const checkAllTabIdRef = useRef(newCheckAllTabId());
  const checkAllCourses = useMemo(() => checkAllCourseList(COURSES), []);

  useEffect(() => {
    saveThreadStore(threadStore);
  }, [threadStore]);

  useEffect(() => {
    if (!checkingAll || checkAllProgress?.phase !== "fetching") return;
    const id = window.setInterval(() => {
      setElapsedTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [checkingAll, checkAllProgress?.phase]);

  useEffect(() => {
    const tabId = checkAllTabIdRef.current;
    return () => {
      releaseCheckAllLock(tabId);
    };
  }, []);

  const persistAuth = useCallback((next: AuthSettingsValues) => {
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        next.useCookies ? "1" : "0"
      );
      sessionStorage.setItem(CSRF_STORAGE_KEY, next.csrfToken);
      sessionStorage.setItem(JWT_PAYLOAD_STORAGE_KEY, next.jwtHeaderPayload);
      sessionStorage.setItem(JWT_SIGNATURE_STORAGE_KEY, next.jwtSignature);
    } catch {
      // ignore quota / private mode
    }
  }, []);

  const cookieAuthFrom = useCallback((values: AuthSettingsValues) => {
    return {
      csrfToken: values.csrfToken.trim(),
      jwtHeaderPayload: values.jwtHeaderPayload.trim(),
      jwtSignature: values.jwtSignature.trim(),
    };
  }, []);

  const pollCourse = useCallback(
    async (
      courseId: string,
      options?: { forceSeed?: boolean; session?: LmsSessionCredentials }
    ) => {
      const currentAuth = authRef.current;
      const cookieAuth = cookieAuthFrom(currentAuth);
      const sessionOverride = options?.session;
      const useSession =
        Boolean(sessionOverride && hasReusableSession(sessionOverride)) ||
        (currentAuth.useCookies && hasCookieAuth(cookieAuth));

      if (currentAuth.useCookies && !sessionOverride && !hasCookieAuth(cookieAuth)) {
        const message =
          "Paste csrftoken plus both JWT cookies " +
          "(edx-jwt-cookie-header-payload and edx-jwt-cookie-signature), " +
          "or turn off “Use browser cookies” in Settings.";
        setSyncByCourse((prev) => ({
          ...prev,
          [courseId]: { status: "error", message },
        }));
        return { ok: false as const, upserted: 0, message };
      }

      persistAuth(currentAuth);

      const bucket = getCourseBucket(threadStoreRef.current, courseId);
      const hasStored = Object.keys(bucket.threads).length > 0;
      const seed = options?.forceSeed === true || !bucket.lastCheckedAt;

      setSyncByCourse((prev) => ({
        ...prev,
        [courseId]: { status: "syncing" },
      }));

      try {
        const parsedCount = Number.parseInt(currentAuth.threadCount, 10);
        const pageSize = Number.isFinite(parsedCount) ? parsedCount : 3;
        const course = findCourseById(courseId);
        const categoryName = course?.forumCategory.trim() || undefined;
        const sessionCreds: LmsSessionCredentials | null = sessionOverride
          ? sessionOverride
          : currentAuth.useCookies
            ? {
                csrfToken: cookieAuth.csrfToken,
                jwtHeaderPayload: cookieAuth.jwtHeaderPayload,
                jwtSignature: cookieAuth.jwtSignature,
              }
            : null;

        const data = await fetchForumThreads(courseId, {
          categoryName,
          pageSize,
          maxPages: seed ? 1 : 5,
          ...(seed
            ? {}
            : {
                since: bucket.lastCheckedAt ?? undefined,
                knownThreads: knownSnapshotsForCourse(
                  threadStoreRef.current,
                  courseId
                ),
              }),
          ...(useSession && sessionCreds
            ? {
                csrfToken: sessionCreds.csrfToken,
                ...(sessionCreds.sessionId
                  ? { sessionId: sessionCreds.sessionId }
                  : {}),
                ...(sessionCreds.jwtHeaderPayload
                  ? { jwtHeaderPayload: sessionCreds.jwtHeaderPayload }
                  : {}),
                ...(sessionCreds.jwtSignature
                  ? { jwtSignature: sessionCreds.jwtSignature }
                  : {}),
              }
            : {}),
        });

        let persistError: string | null = null;
        // Merged (most complete) versions of the threads we just fetched — used
        // for the Supabase mirror so we sync the full comment tree, not a
        // summary payload.
        let syncThreads: ForumThread[] = [];
        setThreadStore((prev) => {
          const next = mergeCoursePoll(prev, courseId, data.threads, {
            seed: seed && !hasStored,
            forumUiOrigin: data.forumUiOrigin,
            categoryName: data.categoryName ?? categoryName,
            totalCount: data.totalCount,
          });
          const saved = saveThreadStore(next);
          if (!saved.ok) {
            persistError = saved.message;
          }
          threadStoreRef.current = next;
          const mergedBucket = getCourseBucket(next, courseId);
          syncThreads = data.threads
            .map((t) => mergedBucket.threads[t.id]?.thread)
            .filter((t): t is ForumThread => Boolean(t));
          return next;
        });

        setSyncByCourse((prev) => ({
          ...prev,
          [courseId]: {
            status: "ready",
            lastResponse: data,
            upsertedCount: data.threads.length,
          },
        }));

        // Mirror to Supabase (Phase 1 RAG corpus). Non-blocking: the local
        // inbox is the source of truth in the browser, so failures (or a
        // missing Supabase config) only warn and never break the poll.
        if (syncThreads.length > 0) {
          void syncCourseThreadsToSupabase(courseId, syncThreads).then(
            (res) => {
              if (!res.ok && !res.skipped) {
                console.warn(
                  `[tau-support] Supabase sync failed for ${courseId}: ${res.message}`
                );
              }
            }
          );
        }

        if (persistError) {
          return {
            ok: false as const,
            upserted: data.threads.length,
            message: persistError,
            persistError: true as const,
            data,
          };
        }

        return { ok: true as const, upserted: data.threads.length, data };
      } catch (err) {
        const message = formatFetchError(err);
        setSyncByCourse((prev) => ({
          ...prev,
          [courseId]: { status: "error", message },
        }));
        return { ok: false as const, upserted: 0, message };
      }
    },
    [cookieAuthFrom, persistAuth]
  );

  const handleSelectCourse = useCallback((courseId: string) => {
    // Selection only shows the local store — fetch via טען תגובות or בדוק הכל.
    setSelectedId(courseId);
  }, []);

  const handleSelectInbox = useCallback(() => {
    setSelectedId(INBOX_SELECTION);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!selectedId || selectedId === INBOX_SELECTION) return;
    void pollCourse(selectedId);
  }, [pollCourse, selectedId]);

  const persistCursor = useCallback(
    (next: CheckAllCursor) => {
      saveCheckAllCursor(next);
      setCheckAllCursor(next);
    },
    []
  );

  const handleStopCheckAll = useCallback(() => {
    checkAllCancelRef.current = true;
    setCheckAllProgress((prev) =>
      prev ? { ...prev, phase: "stopping" } : prev
    );
  }, []);

  const handleCheckAll = useCallback(
    async (mode: "resume" | "restart" | "fresh" = "fresh") => {
      const currentAuth = authRef.current;
      const cookieAuth = cookieAuthFrom(currentAuth);

      let runSession: LmsSessionCredentials | null = null;
      if (currentAuth.useCookies) {
        if (!hasCookieAuth(cookieAuth)) {
          setCheckAllError(AUTH_REQUIRED_MESSAGE);
          setSettingsOpen(true);
          return;
        }
        runSession = {
          csrfToken: cookieAuth.csrfToken,
          jwtHeaderPayload: cookieAuth.jwtHeaderPayload,
          jwtSignature: cookieAuth.jwtSignature,
        };
      } else {
        const cached = loadRunSession();
        if (mode === "resume" && cached) {
          runSession = cached;
        } else {
          try {
            runSession = await fetchLmsLogin();
            saveRunSession(runSession);
          } catch (err) {
            const message = formatFetchError(err);
            clearRunSession();
            setCheckAllError(message);
            return;
          }
        }
      }

      if (!runSession || !hasReusableSession(runSession)) {
        setCheckAllError(AUTH_REQUIRED_MESSAGE);
        setSettingsOpen(true);
        return;
      }

      if (!tryAcquireCheckAllLock(checkAllTabIdRef.current)) {
        setCheckAllError(checkAllStopMessage("lock"));
        return;
      }

      const sidebarOrderIds = unansweredFirstCourseIds(
        COURSES,
        threadStoreRef.current
      );
      const queue = sidebarOrderIds
        .map((id) => checkAllCourses.find((course) => course.id === id))
        .filter(
          (course): course is (typeof checkAllCourses)[number] =>
            Boolean(course)
        );
      const existingCursor = loadCheckAllCursor();
      const resume =
        mode === "resume" &&
        hasIncompleteCheckAll(
          existingCursor,
          queue.map((course) => course.id)
        );
      const completed = new Set(
        resume ? (existingCursor?.completedCourseIds ?? []) : []
      );
      const startedAt =
        resume && existingCursor?.startedAt
          ? existingCursor.startedAt
          : new Date().toISOString();

      checkAllCancelRef.current = false;
      setCheckingAll(true);
      setCheckAllError(null);
      setCheckAllStats(null);
      setCheckAllSummary(null);
      setSelectedId((prev) => prev ?? INBOX_SELECTION);
      setCheckAllFrozenOrder(sidebarOrderIds);
      persistCursor({
        startedAt,
        completedCourseIds: [...completed],
        status: "in_progress",
      });

      let totalUpserted = 0;
      let lastStats: ForumThreadsResponse["requestStats"] | null = null;
      const failedNames: string[] = [];
      let stopKind: CheckAllStopKind | undefined;
      let persistStopMessage: string | null = null;
      let scanned = completed.size;

      const pending = queue.filter((course) => !completed.has(course.id));

      try {
        for (let i = 0; i < pending.length; i += 1) {
          const course = pending[i]!;
          const nextCourse = pending[i + 1];
          const index = scanned + 1;

          if (checkAllCancelRef.current) {
            stopKind = "cancelled";
            break;
          }

          if (isBrowserOffline()) {
            stopKind = "offline";
            break;
          }

          refreshCheckAllLock(checkAllTabIdRef.current);
          setElapsedTick(0);
          setCheckAllProgress({
            index,
            total: queue.length,
            courseId: course.id,
            phase: "fetching",
            fetchStartedAt: Date.now(),
          });

          const result = await pollCourse(course.id, { session: runSession });
          scanned += 1;

          if (result.ok) {
            totalUpserted += result.upserted;
            completed.add(course.id);
            persistCursor({
              startedAt,
              completedCourseIds: [...completed],
              status: "in_progress",
            });
            if (result.data?.requestStats) {
              lastStats = result.data.requestStats;
            }
          } else if ("persistError" in result && result.persistError) {
            persistStopMessage = result.message;
            stopKind = "persist";
            break;
          } else {
            const sync = syncRef.current[course.id];
            const message =
              result.message ??
              (sync?.status === "error" ? sync.message : "Check failed");
            const classified = classifyCheckAllStop(message);
            failedNames.push(courseDisplayName(course.id));
            if (classified === "auth") {
              clearRunSession();
            }
            if (classified) {
              stopKind = classified;
              break;
            }
          }

          if (checkAllCancelRef.current) {
            stopKind = "cancelled";
            break;
          }

          if (nextCourse) {
            setElapsedTick(0);
            setCheckAllProgress({
              index: scanned + 1,
              total: queue.length,
              courseId: nextCourse.id,
              phase: "fetching",
              fetchStartedAt: Date.now(),
            });
            await waitCheckAllGap(CHECK_ALL_GAP_MS, () =>
              checkAllCancelRef.current
            );
            if (checkAllCancelRef.current) {
              stopKind = "cancelled";
              break;
            }
          }
        }

        const incomplete = completed.size < queue.length;
        if (!incomplete) {
          clearCheckAllCursor();
          setCheckAllCursor(null);
          if (!currentAuth.useCookies) {
            clearRunSession();
          }
        } else {
          persistCursor({
            startedAt,
            completedCourseIds: [...completed],
            status: "incomplete",
          });
        }

        const summary: CheckAllSummary = {
          scanned,
          total: queue.length,
          upserted: totalUpserted,
          failedNames,
          stoppedReason: stopKind,
          incomplete,
        };

        setCheckAllStats(lastStats);
        setCheckAllSummary(summary);
        setCheckAllError(
          stopKind === "persist" && persistStopMessage
            ? `${checkAllStopMessage("persist")} ${persistStopMessage}`
            : stopKind
              ? checkAllStopMessage(stopKind)
              : failedNames.length > 0
                ? `נסרקו ${scanned}/${queue.length}. נכשלו: ${failedNames.join(", ")}`
                : null
        );
      } finally {
        releaseCheckAllLock(checkAllTabIdRef.current);
        setCheckingAll(false);
        setCheckAllProgress(null);
        setCheckAllFrozenOrder(null);
      }
    },
    [checkAllCourses, cookieAuthFrom, persistCursor, pollCourse]
  );

  const handleMarkSeen = useCallback((courseId: string, threadId: string) => {
    setThreadStore((prev) => {
      const next = markThreadSeen(prev, courseId, threadId);
      threadStoreRef.current = next;
      return next;
    });
  }, []);

  const handleToggleNoAnswerNeeded = useCallback(
    (courseId: string, threadId: string, currentlyMarked: boolean) => {
      setThreadStore((prev) => {
        const next = setThreadNoAnswerNeeded(
          prev,
          courseId,
          threadId,
          !currentlyMarked
        );
        threadStoreRef.current = next;
        return next;
      });
    },
    []
  );

  function handleAuthChange(patch: Partial<AuthSettingsValues>) {
    setAuth((prev) => ({ ...prev, ...patch }));
  }

  function handleOpenSettings() {
    setSettingsOpen(true);
  }

  function handleCloseSettings() {
    setSettingsOpen(false);
  }

  const sidebarCache: Record<string, CourseCacheEntry> = {};
  for (const course of COURSES) {
    const bucket = getCourseBucket(threadStore, course.id);
    const entries = Object.values(bucket.threads);
    const sync = syncByCourse[course.id];
    const lastCheckedAt = bucket.lastCheckedAt;

    if (sync?.status === "syncing") {
      sidebarCache[course.id] = { status: "syncing", lastCheckedAt };
    } else if (entries.length > 0) {
      sidebarCache[course.id] = {
        status: "ready",
        unansweredCount: countUnanswered(entries),
        newCount: countNewForCourse(threadStore, course.id),
        lastCheckedAt,
      };
    } else if (sync?.status === "error") {
      sidebarCache[course.id] = {
        status: "error",
        message: sync.message,
        lastCheckedAt,
      };
    } else {
      sidebarCache[course.id] = { status: "idle", lastCheckedAt };
    }
  }

  const inboxItems = useMemo(
    () => listGlobalInbox(threadStore),
    [threadStore]
  );
  const inboxUnansweredCount = useMemo(
    () => countUnanswered(inboxItems.map(({ entry }) => entry)),
    [inboxItems]
  );
  const filteredInboxItems = useMemo(() => {
    if (inboxFilter !== "unanswered") return inboxItems;
    return inboxItems.filter(({ entry }) => entryNeedsAnswer(entry));
  }, [inboxFilter, inboxItems]);
  const inboxNewCount = countNewAcrossStore(threadStore);

  const selectedCourseId =
    selectedId && selectedId !== INBOX_SELECTION ? selectedId : null;
  const selectedCourse = selectedCourseId
    ? findCourseById(selectedCourseId)
    : undefined;
  const selectedBucket = selectedCourseId
    ? getCourseBucket(threadStore, selectedCourseId)
    : null;
  const selectedEntries = selectedCourseId
    ? sortedEntriesForCourse(threadStore, selectedCourseId)
    : [];
  const selectedSync = selectedCourseId
    ? syncByCourse[selectedCourseId]
    : undefined;
  const showingInbox = selectedId === INBOX_SELECTION;
  const isSyncingSelected = selectedSync?.status === "syncing";
  const canResumeCheckAll = hasIncompleteCheckAll(
    checkAllCursor,
    checkAllCourses.map((course) => course.id)
  );
  const checkAllElapsedSeconds =
    checkAllProgress?.phase === "fetching" &&
    checkAllProgress.fetchStartedAt &&
    elapsedTick >= 0
      ? Math.max(
          0,
          Math.floor((Date.now() - checkAllProgress.fetchStartedAt) / 1000)
        )
      : undefined;
  const selectedUnansweredCount = selectedCourseId
    ? countUnanswered(selectedEntries)
    : 0;
  const selectedNewCount = selectedCourseId
    ? countNewForCourse(threadStore, selectedCourseId)
    : 0;
  const courseRequestStats =
    selectedSync?.status === "ready"
      ? selectedSync.lastResponse?.requestStats
      : undefined;

  return (
    <PageLayout
      toolName="TAU Support"
      toolDescription="Check campus IL forum threads for new student comments across your courses"
      toolNameHe="תמיכה טכנית - קמפוס IL"
      toolDescriptionHe="ריכוז כל השאלות הטכניות של התלמידים מכלל הקורסים של האוניברסיטה בקמפוס IL"
    >
      <div className="relative mx-auto flex w-full max-w-[90rem] flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28),4px_0_6px_-4px_rgba(0,0,0,0.28)]">
        <button
          type="button"
          onClick={handleOpenSettings}
          aria-label="הגדרות"
          title="הגדרות"
          className="absolute right-2 top-2 z-30 inline-flex h-8 w-8 items-center justify-center rounded-control border border-surface-200 bg-white text-surface-600 shadow-sm transition-colors hover:bg-surface-50 hover:text-surface-900"
        >
          <SettingsIcon />
        </button>

        <div
          dir="rtl"
          className="flex min-h-[560px] flex-col md:h-[calc(100vh-6rem)] md:min-h-[480px]"
        >
          <div className="relative z-20 flex shrink-0">
            {/* Matches sidebar width so the course header sits only above the threads pane. */}
            <div
              className="hidden shrink-0 border-b border-surface-200 bg-white md:block md:w-[34%]"
              aria-hidden
            />
            <div className="relative z-20 flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3 border-b border-r border-surface-200 bg-white px-4 py-2.5 shadow-[0_3px_4px_-3px_rgba(0,0,0,0.22)]">
              <div className="min-w-0 flex-1 ps-9 text-right md:ps-0">
                {selectedId ? (
                  <>
                    <p className="truncate text-sm font-semibold text-surface-900">
                      {showingInbox
                        ? "פיד של כל הקורסים"
                        : selectedCourse?.nameHe ||
                          selectedCourse?.name ||
                          selectedCourseId}
                    </p>
                    {showingInbox ? (
                      <p
                        className="mt-0.5 text-xs text-surface-600"
                        dir="rtl"
                      >
                        <span className="font-semibold text-surface-900">
                          {inboxFilter === "unanswered"
                            ? filteredInboxItems.length
                            : inboxItems.length}
                        </span>{" "}
                        {inboxFilter === "unanswered"
                          ? "שרשורים ללא מענה"
                          : "שרשורים שמורים"}
                        {" · "}
                        <span className="font-semibold text-red-800">
                          {inboxUnansweredCount}
                        </span>{" "}
                        ללא מענה
                        {" · "}
                        <span className="font-semibold text-blue-800">
                          {inboxNewCount}
                        </span>{" "}
                        תגובות חדשות מפעם שעברה
                      </p>
                    ) : (
                      <p
                        className="mt-0.5 text-xs text-surface-600"
                        dir="rtl"
                      >
                        <span className="font-semibold text-surface-900">
                          {selectedEntries.length}
                        </span>{" "}
                        שרשורים שמורים
                        {" · "}
                        <span className="font-semibold text-red-800">
                          {selectedUnansweredCount}
                        </span>{" "}
                        ללא מענה
                        {" · "}
                        <span className="font-semibold text-blue-800">
                          {selectedNewCount}
                        </span>{" "}
                        תגובות חדשות מפעם שעברה
                      </p>
                    )}
                    {showingInbox && checkAllStats ? (
                      <div className="mt-1">
                        <RequestStatsLine stats={checkAllStats} />
                      </div>
                    ) : null}
                    {!showingInbox && courseRequestStats ? (
                      <div className="mt-1">
                        <RequestStatsLine stats={courseRequestStats} />
                      </div>
                    ) : null}
                    {checkingAll && checkAllProgress ? (
                      <p className="mt-1 flex items-center justify-end gap-2 text-[11px] text-surface-600">
                        <Spinner size="sm" />
                        <span>
                          {checkAllProgress.phase === "stopping"
                            ? "עוצר אחרי הקורס הנוכחי…"
                            : `בודקים ${checkAllProgress.index}/${checkAllProgress.total} · ${courseDisplayName(checkAllProgress.courseId)}`}
                          {checkAllProgress.phase !== "stopping" &&
                          checkAllProgress.fetchStartedAt
                            ? ` · ${formatElapsedHe(Date.now() - checkAllProgress.fetchStartedAt)}`
                            : null}
                        </span>
                      </p>
                    ) : isSyncingSelected ? (
                      <p className="mt-1 flex items-center justify-end gap-2 text-[11px] text-surface-500">
                        <Spinner size="sm" />
                        מסנכרן…
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-surface-600">
                    בחרו פיד של כל הקורסים / קורס, או בדקו את כל הקורסים
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {showingInbox ? (
                  <div
                    className="flex items-center overflow-hidden rounded-md border border-surface-200 bg-surface-50 text-xs"
                    role="group"
                    aria-label="סינון פיד"
                  >
                    <button
                      type="button"
                      onClick={() => setInboxFilter("all")}
                      className={`px-2.5 py-1.5 transition-colors ${
                        inboxFilter === "all"
                          ? "bg-white font-semibold text-surface-900 shadow-sm"
                          : "text-surface-600 hover:text-surface-900"
                      }`}
                    >
                      הכל
                    </button>
                    <button
                      type="button"
                      onClick={() => setInboxFilter("unanswered")}
                      className={`border-r border-surface-200 px-2.5 py-1.5 transition-colors ${
                        inboxFilter === "unanswered"
                          ? "bg-white font-semibold text-red-800 shadow-sm"
                          : "text-surface-600 hover:text-surface-900"
                      }`}
                    >
                      ללא מענה
                      {inboxUnansweredCount > 0
                        ? ` (${inboxUnansweredCount})`
                        : ""}
                    </button>
                  </div>
                ) : null}
                {checkingAll ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleStopCheckAll}
                    disabled={checkAllProgress?.phase === "stopping"}
                    title="הבדיקה תיעצר אחרי הקורס הנוכחי"
                  >
                    {checkAllProgress?.phase === "stopping"
                      ? "עוצר אחרי הקורס הנוכחי…"
                      : "עצור"}
                  </Button>
                ) : canResumeCheckAll ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleCheckAll("resume")}
                    >
                      המשך בדיקה
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCheckAll("restart")}
                    >
                      בדוק הכל מחדש
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCheckAll("fresh")}
                  >
                    בדוק הכל
                  </Button>
                )}
                {selectedCourseId ? (
                  <LoadThreadsButton
                    threadCount={auth.threadCount}
                    onThreadCountChange={(count) =>
                      handleAuthChange({ threadCount: String(count) })
                    }
                    onLoad={handleRefresh}
                    loading={selectedSync?.status === "syncing"}
                    disabled={
                      selectedSync?.status === "syncing" || checkingAll
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <CourseSidebar
              courses={COURSES}
              selectedId={selectedId}
              cache={sidebarCache}
              inboxNewCount={inboxNewCount}
              onSelectInbox={handleSelectInbox}
              onSelect={handleSelectCourse}
              frozenCourseIds={checkAllFrozenOrder}
              checkAll={
                checkAllProgress
                  ? {
                      courseId: checkAllProgress.courseId,
                      phase: checkAllProgress.phase,
                      elapsedSeconds: checkAllElapsedSeconds,
                    }
                  : null
              }
            />

            <main className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-surface-200 bg-[#E8E8EA] md:border-t-0">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {!selectedId ? (
                  <EmptySelection />
                ) : showingInbox ? (
                  <div className="flex flex-col gap-3 p-4">
                    {checkAllSummary || checkAllError ? (
                      <div
                        className={`rounded-md border p-3 text-sm ${
                          checkAllError && isCaptchaError(checkAllError)
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : checkAllError
                              ? "border-danger bg-red-50 text-danger"
                              : "border-surface-200 bg-white text-surface-700"
                        }`}
                      >
                        {checkAllSummary ? (
                          <p>
                            נסרקו {checkAllSummary.scanned}/
                            {checkAllSummary.total}
                            {" · "}
                            נשמרו {checkAllSummary.upserted} שרשורים
                            {" · "}
                            {inboxUnansweredCount} ללא מענה
                            {checkAllSummary.failedNames.length > 0
                              ? ` · נכשלו: ${checkAllSummary.failedNames.join(", ")}`
                              : ""}
                          </p>
                        ) : null}
                        {checkAllError ? (
                          <p className={checkAllSummary ? "mt-1" : undefined}>
                            {checkAllError}
                          </p>
                        ) : null}
                        {checkAllSummary?.incomplete && !checkingAll ? (
                          <button
                            type="button"
                            className="mt-2 font-semibold text-blue-800 underline-offset-2 hover:underline"
                            onClick={() => void handleCheckAll("resume")}
                          >
                            המשך בדיקה
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {inboxItems.length === 0 ? (
                      <div className="rounded-md border border-surface-200 bg-white p-4 text-right text-sm text-surface-600">
                        הפיד ריק. לחצו על{" "}
                        <span className="font-semibold">בדוק הכל</span> כדי
                        למשוך שרשורים מכל הקורסים (הריצה הראשונה שומרת בלי תגי
                        ״חדש״).
                      </div>
                    ) : filteredInboxItems.length === 0 ? (
                      <div className="rounded-md border border-surface-200 bg-white p-4 text-right text-sm text-surface-600">
                        אין שרשורים ללא מענה בפיד.
                      </div>
                    ) : (
                      filteredInboxItems.map(({ courseId, entry }) => {
                        const bucket = getCourseBucket(threadStore, courseId);
                        return (
                          <ThreadCard
                            key={`${courseId}:${entry.thread.id}`}
                            thread={entry.thread}
                            courseId={courseId}
                            courseLabel={courseDisplayName(courseId)}
                            forumUiOrigin={
                              bucket.forumUiOrigin ?? "https://app.campus.gov.il"
                            }
                            categoryName={
                              bucket.categoryName ??
                              findCourseById(courseId)?.forumCategory
                            }
                            isNew={entry.isNew}
                            isUpdated={entry.isUpdated}
                            noAnswerNeeded={Boolean(entry.noAnswerNeeded)}
                            onOpen={() =>
                              handleMarkSeen(courseId, entry.thread.id)
                            }
                            onToggleNoAnswerNeeded={() =>
                              handleToggleNoAnswerNeeded(
                                courseId,
                                entry.thread.id,
                                Boolean(entry.noAnswerNeeded)
                              )
                            }
                          />
                        );
                      })
                    )}
                  </div>
                ) : selectedEntries.length === 0 &&
                  selectedSync?.status === "syncing" ? (
                  <div className="flex h-full min-h-[280px] items-center justify-center gap-2 text-sm text-surface-600">
                    <Spinner size="sm" />
                    {auth.useCookies
                      ? "Fetching forum threads…"
                      : "Logging in and fetching forum threads…"}
                  </div>
                ) : selectedEntries.length === 0 &&
                  selectedSync?.status === "error" ? (
                  <div className="p-4">
                    <div
                      className={`rounded-md border p-4 text-sm ${
                        isCaptchaError(selectedSync.message)
                          ? "border-amber-400 bg-amber-50 text-amber-900"
                          : "border-danger bg-red-50 text-danger"
                      }`}
                    >
                      {selectedSync.message}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 p-4">
                    {selectedSync?.status === "error" ? (
                      <div
                        className={`rounded-md border p-3 text-sm ${
                          isCaptchaError(selectedSync.message)
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : "border-danger bg-red-50 text-danger"
                        }`}
                      >
                        {selectedSync.message}
                      </div>
                    ) : null}

                    {selectedEntries.length === 0 ? (
                      <div className="rounded-md border border-surface-200 bg-white p-4 text-right text-sm text-surface-600">
                        אין שרשורים שמורים לקורס זה. לחצו טען תגובות או בדוק
                        הכל.
                      </div>
                    ) : (
                      selectedEntries.map((entry) => (
                        <ThreadCard
                          key={entry.thread.id}
                          thread={entry.thread}
                          courseId={selectedCourseId!}
                          forumUiOrigin={
                            selectedBucket?.forumUiOrigin ??
                            "https://app.campus.gov.il"
                          }
                          categoryName={
                            selectedBucket?.categoryName ??
                            selectedCourse?.forumCategory
                          }
                          isNew={entry.isNew}
                          isUpdated={entry.isUpdated}
                          noAnswerNeeded={Boolean(entry.noAnswerNeeded)}
                          onOpen={() =>
                            handleMarkSeen(selectedCourseId!, entry.thread.id)
                          }
                          onToggleNoAnswerNeeded={() =>
                            handleToggleNoAnswerNeeded(
                              selectedCourseId!,
                              entry.thread.id,
                              Boolean(entry.noAnswerNeeded)
                            )
                          }
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>

      <AuthSettings
        values={auth}
        onChange={handleAuthChange}
        open={settingsOpen}
        onClose={handleCloseSettings}
      />
    </PageLayout>
  );
}
