import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageLayout, Button, Spinner } from "@workspace/ui";
import { AuthSettings, type AuthSettingsValues } from "./components/AuthSettings";
import {
  CourseSidebar,
  INBOX_SELECTION,
  type CourseCacheEntry,
} from "./components/CourseSidebar";
import { EmptySelection } from "./components/EmptySelection";
import { ThreadCard } from "./components/ThreadCard";
import { fetchForumThreads } from "./lib/api";
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
import type { ForumThreadsResponse } from "./lib/types";

type InboxFilter = "all" | "unanswered";

const SESSION_STORAGE_KEY = "tau-support-use-cookies";
const CSRF_STORAGE_KEY = "tau-support-csrf-token";
const JWT_PAYLOAD_STORAGE_KEY = "tau-support-jwt-payload";
const JWT_SIGNATURE_STORAGE_KEY = "tau-support-jwt-signature";
const SETTINGS_COLLAPSED_KEY = "tau-support-settings-collapsed";

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
      settingsCollapsed: sessionStorage.getItem(SETTINGS_COLLAPSED_KEY) === "1",
    };
  } catch {
    return {
      useCookies: true,
      csrfToken: "",
      jwtHeaderPayload: "",
      jwtSignature: "",
      settingsCollapsed: false,
    };
  }
}

function hasCookieAuth(auth: {
  csrfToken: string;
  jwtHeaderPayload: string;
  jwtSignature: string;
}): boolean {
  return Boolean(
    auth.csrfToken.trim() &&
      auth.jwtHeaderPayload.trim() &&
      auth.jwtSignature.trim()
  );
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

function isCaptchaError(message: string): boolean {
  return (
    message.includes("human verification") ||
    message.includes("CAPTCHA") ||
    message.toLowerCase().includes("captcha")
  );
}

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

export default function App() {
  const storedAuth = readStoredAuth();
  const [auth, setAuth] = useState<AuthSettingsValues>({
    threadCount: "3",
    useCookies: storedAuth.useCookies,
    csrfToken: storedAuth.csrfToken,
    jwtHeaderPayload: storedAuth.jwtHeaderPayload,
    jwtSignature: storedAuth.jwtSignature,
  });
  const [settingsCollapsed, setSettingsCollapsed] = useState(
    storedAuth.settingsCollapsed
  );
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
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");

  const threadStoreRef = useRef(threadStore);
  threadStoreRef.current = threadStore;
  const syncRef = useRef(syncByCourse);
  syncRef.current = syncByCourse;
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    saveThreadStore(threadStore);
  }, [threadStore]);

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
    async (courseId: string, options?: { forceSeed?: boolean }) => {
      const currentAuth = authRef.current;
      const cookieAuth = cookieAuthFrom(currentAuth);

      if (currentAuth.useCookies && !hasCookieAuth(cookieAuth)) {
        setSyncByCourse((prev) => ({
          ...prev,
          [courseId]: {
            status: "error",
            message:
              "Paste csrftoken plus both JWT cookies " +
              "(edx-jwt-cookie-header-payload and edx-jwt-cookie-signature), " +
              "or turn off “Use browser cookies” in Settings.",
          },
        }));
        return { ok: false as const, upserted: 0 };
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
          ...(currentAuth.useCookies
            ? {
                csrfToken: cookieAuth.csrfToken,
                jwtHeaderPayload: cookieAuth.jwtHeaderPayload,
                jwtSignature: cookieAuth.jwtSignature,
              }
            : {}),
        });

        setThreadStore((prev) => {
          const next = mergeCoursePoll(prev, courseId, data.threads, {
            seed: seed && !hasStored,
            forumUiOrigin: data.forumUiOrigin,
            categoryName: data.categoryName ?? categoryName,
            totalCount: data.totalCount,
          });
          threadStoreRef.current = next;
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

        return { ok: true as const, upserted: data.threads.length, data };
      } catch (err) {
        setSyncByCourse((prev) => ({
          ...prev,
          [courseId]: { status: "error", message: formatFetchError(err) },
        }));
        return { ok: false as const, upserted: 0 };
      }
    },
    [cookieAuthFrom, persistAuth]
  );

  const handleSelectCourse = useCallback((courseId: string) => {
    // Selection only shows the local store — fetch via Refresh or בדוק הכל.
    setSelectedId(courseId);
    setCheckAllError(null);
  }, []);

  const handleSelectInbox = useCallback(() => {
    setSelectedId(INBOX_SELECTION);
    setCheckAllError(null);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!selectedId || selectedId === INBOX_SELECTION) return;
    void pollCourse(selectedId);
  }, [pollCourse, selectedId]);

  const handleCheckAll = useCallback(async () => {
    setCheckingAll(true);
    setCheckAllError(null);
    setCheckAllStats(null);
    setSelectedId((prev) => prev ?? INBOX_SELECTION);

    let totalUpserted = 0;
    let lastStats: ForumThreadsResponse["requestStats"] | null = null;
    const errors: string[] = [];

    for (const course of COURSES) {
      const result = await pollCourse(course.id);
      if (result.ok) {
        totalUpserted += result.upserted;
        if (result.data?.requestStats) {
          lastStats = result.data.requestStats;
        }
      } else {
        const sync = syncRef.current[course.id];
        if (sync?.status === "error") {
          errors.push(`${courseDisplayName(course.id)}: ${sync.message}`);
        }
      }
    }

    if (errors.length > 0) {
      setCheckAllError(
        errors.length === COURSES.length
          ? errors[0] ?? "Check all failed"
          : `Finished with ${errors.length} error(s). Upserted ${totalUpserted} thread(s). First error: ${errors[0]}`
      );
    }

    setCheckAllStats(lastStats);
    setCheckingAll(false);
  }, [pollCourse]);

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

  function handleToggleSettings() {
    setSettingsCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(SETTINGS_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
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
  const isSyncingSelected =
    checkingAll || selectedSync?.status === "syncing";
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
      <div className="mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28),4px_0_6px_-4px_rgba(0,0,0,0.28)]">
        <AuthSettings
          values={auth}
          onChange={handleAuthChange}
          collapsed={settingsCollapsed}
          onToggleCollapsed={handleToggleSettings}
        />

        <div
          dir="rtl"
          className="flex min-h-[560px] flex-col md:h-[calc(100vh-11rem)] md:min-h-[480px]"
        >
          <div className="relative z-20 flex shrink-0">
            {/* Matches sidebar width so the course header sits only above the threads pane. */}
            <div
              className="hidden shrink-0 border-b border-surface-200 bg-white md:block md:w-[34%]"
              aria-hidden
            />
            <div className="relative z-20 flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3 border-b border-r border-surface-200 bg-white px-4 py-2.5 shadow-[0_3px_4px_-3px_rgba(0,0,0,0.22)]">
              <div className="min-w-0 flex-1 text-right">
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
                    {isSyncingSelected ? (
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCheckAll()}
                  loading={checkingAll}
                  disabled
                  title="בדוק הכל מושבת זמנית — השתמשו ב-Refresh לקורס נבחר"
                >
                  בדוק הכל
                </Button>
                {selectedCourseId ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRefresh}
                    loading={selectedSync?.status === "syncing"}
                    disabled={
                      selectedSync?.status === "syncing" || checkingAll
                    }
                  >
                    Refresh
                  </Button>
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
            />

            <main className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-surface-200 bg-[#E8E8EA] md:border-t-0">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {!selectedId ? (
                  <EmptySelection />
                ) : showingInbox ? (
                  <div className="flex flex-col gap-3 p-4">
                    {checkAllError ? (
                      <div
                        className={`rounded-md border p-3 text-sm ${
                          isCaptchaError(checkAllError)
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : "border-danger bg-red-50 text-danger"
                        }`}
                      >
                        {checkAllError}
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
                        אין שרשורים שמורים לקורס זה. לחצו Refresh או בדוק הכל.
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
    </PageLayout>
  );
}
