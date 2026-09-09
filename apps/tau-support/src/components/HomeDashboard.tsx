import { Button, Spinner } from "@workspace/ui";
import {
  isCaptchaError,
  type CheckAllProgress,
  type CheckAllSummary,
  type LastCheckAllRun,
} from "../lib/checkAllRun";

export interface HomeDashboardStats {
  totalCourses: number;
  unansweredCount: number;
  answeredCount: number;
  totalQuestions: number;
  noAnswerNeededCount: number;
}

type FlowStage = "auth" | "scanning" | "done" | "stopping";

interface HomeDashboardProps {
  stats: HomeDashboardStats;
  lastRun: LastCheckAllRun | null;
  checkingAll: boolean;
  canResume: boolean;
  progress: CheckAllProgress | null;
  elapsedSeconds?: number;
  currentCourseName?: string | null;
  summary: CheckAllSummary | null;
  error: string | null;
  disabled?: boolean;
  onCheckAll: (mode: "fresh" | "resume" | "restart") => void;
  onStop: () => void;
  /** Hard-abort from the pause screen — clears mid-run resume state. */
  onDismissCheckAll: () => void;
}

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

function currentHebrewMonth(): string {
  return HEBREW_MONTHS[new Date().getMonth()] ?? "";
}

export function homeGreetingTitle(now = new Date()): string {
  const month = HEBREW_MONTHS[now.getMonth()] ?? "";
  return `שלום אחראי/ת תמיכה של חודש ${month} 👋`;
}

function formatLastRunDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STAT_THEMES = {
  courses: {
    box: "bg-sky-100 border-sky-300 text-sky-950",
    value: "text-sky-800",
  },
  unanswered: {
    box: "bg-rose-100 border-rose-300 text-rose-950",
    value: "text-rose-700",
  },
  answered: {
    box: "bg-amber-100 border-amber-300 text-amber-950",
    value: "text-amber-800",
  },
  newActivity: {
    box: "bg-violet-100 border-violet-300 text-violet-950",
    value: "text-violet-700",
  },
  neverPolled: {
    box: "bg-emerald-100 border-emerald-300 text-emerald-950",
    value: "text-emerald-800",
  },
} as const;

function StatBox({
  label,
  value,
  theme,
}: {
  label: string;
  value: string | number;
  theme: (typeof STAT_THEMES)[keyof typeof STAT_THEMES];
}) {
  return (
    <div
      className={`flex min-h-[7.5rem] min-w-0 flex-col justify-between rounded-2xl border-2 px-4 py-4 shadow-sm ${theme.box}`}
    >
      <p className="text-sm font-medium leading-snug opacity-90">{label}</p>
      <p
        className={`mt-3 text-4xl font-bold tabular-nums tracking-tight ${theme.value}`}
      >
        {value}
      </p>
    </div>
  );
}

function stageFromProgress(
  checkingAll: boolean,
  progress: CheckAllProgress | null
): FlowStage {
  if (!checkingAll) return "done";
  if (progress?.phase === "stopping") return "stopping";
  if (!progress) return "auth";
  return "scanning";
}

function FlowPipeline({
  stage,
  progress,
  elapsedSeconds,
  currentCourseName,
}: {
  stage: FlowStage;
  progress: CheckAllProgress | null;
  elapsedSeconds?: number;
  currentCourseName?: string | null;
}) {
  const stages: { id: FlowStage; label: string }[] = [
    { id: "auth", label: "התחברות" },
    { id: "scanning", label: "סריקת קורסים" },
    { id: "done", label: "סיום" },
  ];

  const activeIndex =
    stage === "stopping" || stage === "scanning"
      ? 1
      : stage === "auth"
        ? 0
        : 2;

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.index / progress.total) * 100))
      : stage === "done"
        ? 100
        : 0;

  return (
    <div className="w-full max-w-lg" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        {stages.map((s, i) => {
          const isActive = i === activeIndex && stage !== "done";
          const isComplete = i < activeIndex || stage === "done";
          return (
            <div key={s.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                  isActive
                    ? "border-amber-500 bg-amber-50 text-amber-900 shadow-[0_0_0_4px_rgba(245,158,11,0.2)]"
                    : isComplete
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-surface-300 bg-white text-surface-400"
                }`}
              >
                {isActive ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
                ) : null}
                {isComplete && !isActive ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : isActive ? (
                  <Spinner size="sm" />
                ) : (
                  <span className="text-sm font-semibold">{i + 1}</span>
                )}
              </div>
              <span
                className={`text-center text-[11px] font-medium ${
                  isActive
                    ? "text-amber-900"
                    : isComplete
                      ? "text-emerald-800"
                      : "text-surface-400"
                }`}
              >
                {stage === "stopping" && s.id === "scanning"
                  ? "עוצר…"
                  : s.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-200">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            stage === "stopping" ? "bg-amber-500" : "bg-blue-600"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mt-4 min-h-[3.25rem] overflow-hidden text-center">
        {stage === "stopping" ? (
          <p
            key={`stop-${progress?.courseId ?? "none"}`}
            className="animate-[courseSlideLeft_0.4s_ease-out] text-sm font-medium text-amber-900"
          >
            עוצר אחרי הקורס הנוכחי…
            {currentCourseName ? ` · ${currentCourseName}` : ""}
          </p>
        ) : stage === "auth" ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner size="md" />
            <p className="text-sm font-medium text-surface-600">
              מתחבר לCampus IL
            </p>
          </div>
        ) : progress ? (
          <div
            key={progress.courseId}
            className="animate-[courseSlideLeft_0.4s_ease-out] space-y-1"
          >
            <p className="text-sm font-semibold text-surface-900">
              {progress.index}/{progress.total}
              {currentCourseName ? ` · ${currentCourseName}` : ""}
            </p>
            {elapsedSeconds != null && progress.fetchStartedAt ? (
              <p className="text-xs text-surface-500">{elapsedSeconds} שנ׳</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const whiteCtaClass =
  "mx-auto w-auto min-w-[12rem] max-w-xs border-2 border-surface-900 bg-white px-8 text-base font-semibold text-surface-900 shadow-sm hover:bg-surface-50 active:bg-surface-100";

export function HomeDashboard({
  stats,
  lastRun,
  checkingAll,
  canResume,
  progress,
  elapsedSeconds,
  currentCourseName,
  summary,
  error,
  disabled,
  onCheckAll,
  onStop,
  onDismissCheckAll,
}: HomeDashboardProps) {
  const stage = stageFromProgress(checkingAll, progress);
  const month = currentHebrewMonth();
  const flowReport =
    !checkingAll && summary
      ? {
          scanned: summary.scanned,
          total: summary.total,
          upserted: summary.upserted,
          incomplete: summary.incomplete,
        }
      : !checkingAll && lastRun
        ? {
            scanned: lastRun.scanned,
            total: lastRun.total,
            upserted: lastRun.upserted,
            incomplete: lastRun.incomplete,
          }
        : null;

  return (
    <div
      dir="rtl"
      className="flex h-full min-h-[320px] flex-col overflow-y-auto px-6 py-8 sm:px-10"
    >
      <div className="my-auto flex w-full flex-col gap-14 sm:gap-16">
      <header className="text-center">
        <h2 className="text-3xl font-semibold leading-snug text-surface-900 sm:text-4xl">
          שלום אחראי/ת תמיכה של חודש {month}{" "}
          <span className="inline-block origin-[70%_70%] animate-[wave_1.4s_ease-in-out_infinite]" aria-hidden>
            👋
          </span>
        </h2>
        <p className="mt-7 text-base font-medium text-surface-900 sm:mt-8 sm:text-lg">
          {lastRun
            ? `העדכון האחרון היה ב: ${formatLastRunDateTime(lastRun.completedAt)}${
                lastRun.incomplete ? " (ריצה חלקית)" : ""
              }`
            : "העדכון האחרון היה ב: עדיין לא הורצה בדיקת שאלות חדשות"}
        </p>
      </header>

      <section className="flex flex-col items-center gap-12 sm:gap-14">
        {checkingAll ? (
          <>
            <FlowPipeline
              stage={stage}
              progress={progress}
              elapsedSeconds={elapsedSeconds}
              currentCourseName={currentCourseName}
            />
            {progress?.phase === "stopping" ? (
              <div className="flex flex-col items-center gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={onDismissCheckAll}
                  title="בטל את הבדיקה לחלוטין וחזור למסך הראשי"
                >
                  בטל בדיקה
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={onStop}
                title="הבדיקה תיעצר אחרי הקורס הנוכחי"
              >
                עצור
              </Button>
            )}
          </>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-12 sm:gap-14">
            {flowReport ? (
              <div className="rounded-md bg-white px-4 py-3 text-center text-surface-900">
                <p className="text-base font-semibold">
                  {flowReport.incomplete
                    ? "הריצה לא הושלמה"
                    : "העדכון בוצע בהצלחה"}
                </p>
                <p className="mt-1 text-sm text-surface-900">
                  נשמרו {flowReport.upserted} שאלות חדשות מ
                  {flowReport.scanned} קורסים
                </p>
                {summary && summary.failedNames.length > 0 ? (
                  <p className="mt-1 text-sm text-surface-600">
                    נכשלו: {summary.failedNames.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div
                className={`rounded-md border p-3 text-center text-sm ${
                  isCaptchaError(error)
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : "border-danger bg-red-50 text-danger"
                }`}
              >
                {error}
              </div>
            ) : null}

            {canResume ? (
              <div className="flex w-full flex-col items-center gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className={whiteCtaClass}
                  onClick={() => onCheckAll("resume")}
                  disabled={disabled}
                >
                  המשך בדיקה
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className="w-auto"
                  onClick={() => onCheckAll("restart")}
                  disabled={disabled}
                >
                  בדוק הכל מחדש
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                className={whiteCtaClass}
                onClick={() => onCheckAll("fresh")}
                disabled={disabled}
              >
                בדיקת שאלות חדשות
              </Button>
            )}
          </div>
        )}
      </section>

      <section
        aria-label="סטטיסטיקות"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4"
      >
        <StatBox
          label="קורסים במערכת"
          value={stats.totalCourses}
          theme={STAT_THEMES.courses}
        />
        <StatBox
          label={'סה"כ שאלות'}
          value={stats.totalQuestions}
          theme={STAT_THEMES.newActivity}
        />
        <StatBox
          label="שאלות ללא מענה"
          value={stats.unansweredCount}
          theme={STAT_THEMES.unanswered}
        />
        <StatBox
          label="שאלות שנענו"
          value={stats.answeredCount}
          theme={STAT_THEMES.answered}
        />
        <StatBox
          label="לא צריכות מענה"
          value={stats.noAnswerNeededCount}
          theme={STAT_THEMES.neverPolled}
        />
      </section>

      <style>{`
        @keyframes wave {
          0%, 60%, 100% { transform: rotate(0deg); }
          10%, 30% { transform: rotate(14deg); }
          20%, 40% { transform: rotate(-8deg); }
          50% { transform: rotate(10deg); }
        }
        @keyframes courseSlideLeft {
          from {
            transform: translateX(1.5rem);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      </div>
    </div>
  );
}
