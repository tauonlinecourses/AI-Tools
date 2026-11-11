import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type YAxisTickContentProps,
} from "recharts";
import { Button, Spinner } from "@workspace/ui";
import { categoryColor } from "../lib/categoryColors";
import { COURSES, courseLabel } from "../lib/courses";
import {
  DASHBOARD_FORMAT_VERSION,
  type DashboardPoint,
  type DashboardSnapshot,
  type DashboardStepResult,
} from "../lib/dashboardTypes";
import { buildForumThreadUrl } from "../lib/forumUrls";
import { QuestionMap3D } from "./QuestionMap3D";

const FORUM_UI_ORIGIN = "https://app.campus.gov.il";
const ALL = "__all__";
const MAX_REFRESH_CALLS = 200;

async function callDashboard<T>(action: string, payload?: unknown): Promise<T> {
  const { tauData } = await import("../lib/tauDataClient");
  return tauData<T>(action, payload);
}

async function runStep(action: string): Promise<DashboardStepResult> {
  const result = await callDashboard<DashboardStepResult>(action);
  if (!result.ok) throw new Error(result.message || "הניתוח נכשל");
  return result;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("he-IL") : "—";
}

function courseName(courseId: string): string {
  const course = COURSES.find((c) => c.id === courseId);
  return course ? courseLabel(course) : courseId;
}

interface CategoryGroup {
  category: string;
  /** Newest first. */
  questions: DashboardPoint[];
}

/** Largest category first; questions inside each newest first. */
function groupByCategory(points: DashboardPoint[]): CategoryGroup[] {
  const byCategory = new Map<string, DashboardPoint[]>();
  for (const point of points) {
    const list = byCategory.get(point.category);
    if (list) list.push(point);
    else byCategory.set(point.category, [point]);
  }
  return [...byCategory]
    .map(([category, questions]) => ({
      category,
      questions: questions.sort((a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
      ),
    }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-surface-200 bg-white p-4 text-right">
      <p className="text-2xl font-semibold text-surface-900">{value}</p>
      <p className="mt-1 text-sm text-surface-600">{label}</p>
    </div>
  );
}

function CategoryChart({
  data,
  selected,
  onSelect,
}: {
  data: { category: string; questions: number; color: string }[];
  /** The category shown on the map, or null for all. */
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  return (
    // In an RTL parent, SVG text anchors flip and axis labels land on the bars.
    // Clicking a bar focuses the SVG and its shapes; hide the browser outline.
    <div dir="ltr" className="w-full [&_*:focus]:outline-none">
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 0, bottom: 4, left: 32 }}
      >
        <CartesianGrid horizontal={false} stroke="#e7e6df" />
        <XAxis
          type="number"
          reversed
          hide
          allowDecimals={false}
          domain={[0, "dataMax"]}
        />
        <YAxis
          type="category"
          dataKey="category"
          orientation="right"
          width={130}
          tickLine={false}
          axisLine={false}
          tick={(props: YAxisTickContentProps) => {
            const category = String(props.payload.value);
            const faded = selected !== null && selected !== category;
            return (
              <text
                x={props.x}
                y={props.y}
                dy="0.355em"
                textAnchor="start"
                fill="#52514e"
                fontSize={13}
                opacity={faded ? 0.5 : 1}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(category)}
              >
                {category}
              </text>
            );
          }}
        />
        <Tooltip
          cursor={{ fill: "#f2f1ec" }}
          formatter={(value) => [String(value), "שאלות"]}
        />
        <Bar
          dataKey="questions"
          barSize={20}
          radius={[4, 0, 0, 4]}
          cursor="pointer"
          onClick={(_entry, index) => {
            const row = data[index];
            if (row) onSelect(row.category);
          }}
        >
          {data.map((row) => (
            <Cell
              key={row.category}
              fill={row.color}
              fillOpacity={selected === null || selected === row.category ? 1 : 0.3}
            />
          ))}
          {/* On a reversed axis, "right" means the bar's far (visually left) end. */}
          <LabelList dataKey="questions" position="right" fill="#52514e" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

/** Questions with their bodies, loaded when the list is shown. */
function QuestionList({ members }: { members: DashboardPoint[] }) {
  const [bodies, setBodies] = useState<Record<string, string> | null>(null);
  const [bodiesFailed, setBodiesFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBodies(null);
    setBodiesFailed(false);
    callDashboard<Record<string, string>>("getDashboardQuestionBodies", {
      threadIds: members.map((m) => m.threadId),
    })
      .then((result) => {
        if (!cancelled) setBodies(result);
      })
      .catch(() => {
        if (!cancelled) setBodiesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [members]);

  return (
    <ul className="space-y-3 bg-surface-50 px-4 py-3 text-sm">
      {bodiesFailed ? (
        <li className="text-xs text-red-800">לא ניתן היה לטעון את תוכן השאלות.</li>
      ) : null}
      {members.map((member) => (
        <li
          key={member.threadId}
          className="border-b border-surface-200 pb-3 last:border-b-0 last:pb-0"
        >
          <div className="flex items-baseline gap-2">
            <a
              href={buildForumThreadUrl(
                FORUM_UI_ORIGIN,
                member.courseId,
                member.threadId
              )}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 font-semibold text-sky-800 hover:underline"
            >
              {member.title}
            </a>
            <span className="shrink-0 text-xs text-surface-600">
              {formatDate(member.createdAt)}
            </span>
          </div>
          {bodies === null && !bodiesFailed ? (
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface-200" />
          ) : bodies?.[member.threadId] ? (
            <p className="mt-1 whitespace-pre-line text-surface-900">
              {bodies[member.threadId]}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CategoryRow({
  group,
  open,
  onToggle,
}: {
  group: CategoryGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const rowRef = useRef<HTMLLIElement | null>(null);

  // Also covers opening from the 3D map: bring the row into view.
  useEffect(() => {
    if (open) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const handleToggle = () => {
    const wasOpen = open;
    onToggle();
    // Closing from mid-list would otherwise leave this row above the viewport.
    if (wasOpen) {
      requestAnimationFrame(() =>
        rowRef.current?.scrollIntoView({ block: "nearest" })
      );
    }
  };

  return (
    <li ref={rowRef} className="border-b border-surface-200 last:border-b-0">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-sky-50 ${
          open
            ? "sticky top-0 z-10 border-b border-surface-200 bg-sky-50"
            : "bg-white"
        }`}
      >
        <span
          aria-hidden
          className={`shrink-0 text-surface-600 transition-transform ${
            open ? "-rotate-90" : ""
          }`}
        >
          ◂
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-surface-900">
            {group.category}
          </span>
          <span className="block truncate text-xs text-surface-600">
            {group.questions.length} שאלות
          </span>
        </span>
      </button>
      {open ? (
        <div className="border-t border-surface-200">
          <QuestionList members={group.questions} />
        </div>
      ) : null}
    </li>
  );
}

export function QuestionsDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    callDashboard<DashboardSnapshot | null>("getDashboardSnapshot")
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "טעינה נכשלה");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      let embeddedTotal = 0;
      for (let call = 0; call < MAX_REFRESH_CALLS; call += 1) {
        setProgress(`מכין שאלות לניתוח (${embeddedTotal})`);
        const step = await runStep("embedDashboardQuestions");
        embeddedTotal += step.embedded ?? 0;
        if (!step.remaining || !step.embedded) break;
      }
      let categorizedTotal = 0;
      for (let call = 0; call < MAX_REFRESH_CALLS; call += 1) {
        setProgress(`ממיין שאלות לקטגוריות (${categorizedTotal})`);
        const step = await runStep("categorizeDashboardQuestions");
        categorizedTotal += step.categorized ?? 0;
        // Stop when done, or when a call sorted nothing (AI down): retry next refresh.
        if (!step.remaining || !step.categorized) break;
      }
      setProgress("שומר את הניתוח");
      const built = await runStep("buildDashboardSnapshot");
      setNotice(built.message ?? null);
      setSnapshot(
        await callDashboard<DashboardSnapshot | null>("getDashboardSnapshot")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "הניתוח נכשל");
    } finally {
      setProgress(null);
    }
  }, []);

  // Snapshots saved before per-question categories cannot be shown.
  const current =
    snapshot?.formatVersion === DASHBOARD_FORMAT_VERSION ? snapshot : null;

  const courseIds = useMemo(
    () => [...new Set(current?.points.map((p) => p.courseId) ?? [])],
    [current]
  );

  const allCategories = useMemo(
    () => groupByCategory(current?.points ?? []).map((g) => g.category),
    [current]
  );

  const filteredPoints = useMemo(() => {
    // Whole days in the viewer's time zone, inclusive at both ends.
    const fromMs = startDate ? Date.parse(`${startDate}T00:00:00`) : null;
    const toMs = endDate ? Date.parse(`${endDate}T23:59:59.999`) : null;
    const inDateRange = (createdAt: string | null) => {
      if (fromMs === null && toMs === null) return true;
      if (!createdAt) return false;
      const ms = Date.parse(createdAt);
      return (fromMs === null || ms >= fromMs) && (toMs === null || ms <= toMs);
    };
    return (current?.points ?? []).filter(
      (p) =>
        (courseFilter === ALL || p.courseId === courseFilter) &&
        inDateRange(p.createdAt)
    );
  }, [current, courseFilter, startDate, endDate]);

  const visiblePoints = useMemo(
    () =>
      categoryFilter === ALL
        ? filteredPoints
        : filteredPoints.filter((p) => p.category === categoryFilter),
    [filteredPoints, categoryFilter]
  );

  const categoryGroups = useMemo(
    () => groupByCategory(visiblePoints),
    [visiblePoints]
  );

  // The chart ignores the category filter, so it always shows the full split.
  const categoryData = useMemo(
    () =>
      groupByCategory(filteredPoints).map((g) => ({
        category: g.category,
        questions: g.questions.length,
        color: categoryColor(g.category),
      })),
    [filteredPoints]
  );

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  const largest = categoryGroups[0];
  const largestShare =
    largest && visiblePoints.length
      ? Math.round((largest.questions.length / visiblePoints.length) * 100)
      : 0;
  const selectClass =
    "min-w-0 max-w-[14rem] flex-1 truncate rounded-md border border-surface-200 bg-white px-2 py-1.5 text-sm text-surface-900";
  const dateLabelClass =
    "flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-surface-600";
  const dateInputClass =
    "rounded-md border border-surface-200 bg-white px-2 py-1.5 text-sm text-surface-900";

  return (
    <div dir="rtl" className="space-y-5 p-5">
      <div className="space-y-2">
        {/* Row 1: dropdowns, last-updated time, refresh. */}
        <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={progress !== null}
            className="order-last ms-auto shrink-0"
          >
            מיון שאלות חדשות
          </Button>
          {progress ? (
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-surface-600">
              <Spinner size="sm" /> {progress}
            </span>
          ) : snapshot ? (
            <span className="shrink-0 whitespace-nowrap text-sm text-surface-600">
              עודכן לאחרונה: {new Date(snapshot.computedAt).toLocaleString("he-IL")}
            </span>
          ) : null}
          {current ? (
            <div className="order-first flex min-w-0 flex-1 justify-start gap-2">
              <select
                aria-label="סינון לפי קורס"
                className={selectClass}
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
              >
                <option value={ALL}>כל הקורסים</option>
                {courseIds.map((id) => (
                  <option key={id} value={id}>
                    {courseName(id)}
                  </option>
                ))}
              </select>
              <select
                aria-label="סינון לפי קטגוריה"
                className={selectClass}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value={ALL}>כל הקטגוריות</option>
                {allCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        {/* Row 2: date range. */}
        {current ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className={dateLabelClass}>
              מתאריך
              <input
                type="date"
                className={dateInputClass}
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className={dateLabelClass}>
              עד תאריך
              <input
                type="date"
                className={dateInputClass}
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control bg-red-100 p-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-control bg-amber-100 p-3 text-sm text-amber-950">
          {notice}
        </p>
      ) : null}

      {!current ? (
        <p className="rounded-control border border-surface-200 p-8 text-center text-surface-600">
          {snapshot ? (
            <>
              הניתוח השמור נבנה בגרסה קודמת. לחצו על <strong>מיון שאלות חדשות</strong>{" "}
              כדי לבנות אותו מחדש לפי קטגוריות.
            </>
          ) : (
            <>
              עדיין אין ניתוח. לחצו על <strong>מיון שאלות חדשות</strong> כדי למיין את
              שאלות הפורום. בהרצה הראשונה זה עשוי לקחת כמה דקות.
            </>
          )}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="שאלות שנותחו"
              value={visiblePoints.length.toLocaleString("he-IL")}
            />
            <StatTile
              label="קטגוריות"
              value={categoryGroups.length.toLocaleString("he-IL")}
            />
            <StatTile
              label={
                largest
                  ? `הקטגוריה הגדולה · ${largestShare}% מהשאלות`
                  : "הקטגוריה הגדולה"
              }
              value={largest?.category ?? "—"}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="overflow-hidden rounded-control border border-surface-200">
              <h2 className="border-b border-surface-200 px-4 py-3 font-semibold text-surface-900">
                מפת שאלות תלת־ממדית
              </h2>
              <QuestionMap3D
                points={visiblePoints}
                onSelectCategory={setOpenCategory}
              />
              <p className="border-t border-surface-200 px-4 py-2 text-xs text-surface-600">
                נקודות קרובות הן שאלות דומות, והצבע הוא הקטגוריה. המרחקים במפה
                הם קירוב.
              </p>
            </section>

            <section className="rounded-control border border-surface-200 p-4">
              <h2 className="mb-3 font-semibold text-surface-900">
                שאלות לפי קטגוריה
              </h2>
              {categoryData.length > 0 ? (
                <>
                  <CategoryChart
                    data={categoryData}
                    selected={categoryFilter === ALL ? null : categoryFilter}
                    onSelect={(category) =>
                      setCategoryFilter((current) =>
                        current === category ? ALL : category
                      )
                    }
                  />
                  <p className="mt-2 text-xs text-surface-600">
                    לחיצה על עמודה מציגה רק את הקטגוריה הזו. לחיצה נוספת מחזירה
                    את כל הקטגוריות.
                  </p>
                </>
              ) : (
                <p className="text-sm text-surface-600">אין נתונים להצגה.</p>
              )}
            </section>
          </div>

          <section className="overflow-hidden rounded-control border border-surface-200">
            <h2 className="border-b border-surface-200 px-4 py-3 font-semibold text-surface-900">
              קטגוריות ושאלות
            </h2>
            {categoryGroups.length > 0 ? (
              <ul className="max-h-[32rem] overflow-y-auto">
                {categoryGroups.map((group) => (
                  <CategoryRow
                    key={group.category}
                    group={group}
                    open={openCategory === group.category}
                    onToggle={() =>
                      setOpenCategory((open) =>
                        open === group.category ? null : group.category
                      )
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-surface-600">לא נמצאו שאלות.</p>
            )}
          </section>

          <p className="text-xs text-surface-600">
            הנתונים מבוססים על שרשורים ששמורים במערכת בלבד
            {current.totalAvailable > current.points.length
              ? `; הניתוח כולל את ${current.points.length.toLocaleString("he-IL")} השאלות החדשות מתוך ${current.totalAvailable.toLocaleString("he-IL")}`
              : ""}
            .
          </p>
        </>
      )}
    </div>
  );
}
