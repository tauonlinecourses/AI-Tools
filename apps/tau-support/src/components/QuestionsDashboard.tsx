import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  BarStack,
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
import { CATEGORY_COLORS, categoryColor } from "../lib/categoryColors";
import { courseColor } from "../lib/courseColors";
import {
  courseLabel,
  findCourseById,
  getRuntimeCourseCatalog,
} from "../lib/courses";
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
  const course = findCourseById(courseId);
  return course ? courseLabel(course) : courseId;
}

/** Short label for chart tooltips (Hebrew title when present). */
function shortCourseName(courseId: string): string {
  const course = findCourseById(courseId);
  return course?.nameHe || course?.name || courseId;
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

/** A local-time "YYYY-MM-DD" string, the format date inputs use. */
function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The day of the earliest question, or "" when no question has a date. */
function firstQuestionDate(points: DashboardPoint[]): string {
  let min = Infinity;
  for (const p of points) {
    const ms = p.createdAt ? Date.parse(p.createdAt) : NaN;
    if (ms < min) min = ms;
  }
  return Number.isFinite(min) ? toDateInputValue(min) : "";
}

/** One month's bar: total + a count per series key (category or course). */
interface MonthCount {
  label: string;
  questions: number;
  [seriesKey: string]: string | number;
}

interface MonthlyBreakdown {
  rows: MonthCount[];
  /** Series keys present in the data, in a stable stack order. */
  series: string[];
}

const CATEGORY_ORDER = Object.keys(CATEGORY_COLORS);
function courseOrderIds(): string[] {
  return getRuntimeCourseCatalog().map((c) => c.id);
}

/** Fixed list first, then any leftover names (e.g. older snapshots). */
function orderedCategories(names: Iterable<string>): string[] {
  const present = new Set(names);
  const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
  for (const name of present) {
    if (!CATEGORY_COLORS[name]) ordered.push(name);
  }
  return ordered;
}

/** Catalog order first, then any course ids not in the runtime catalog. */
function orderedCourses(ids: Iterable<string>): string[] {
  const present = new Set(ids);
  const catalogOrder = courseOrderIds();
  const ordered = catalogOrder.filter((id) => present.has(id));
  for (const id of present) {
    if (!catalogOrder.includes(id)) ordered.push(id);
  }
  return ordered;
}

/**
 * Questions per calendar month, oldest first, with empty months kept as 0.
 * `seriesOf` chooses the stack key (category name or course id).
 */
function countByMonth(
  points: DashboardPoint[],
  seriesOf: (point: DashboardPoint) => string,
  orderSeries: (names: Iterable<string>) => string[]
): MonthlyBreakdown {
  const counts = new Map<string, Map<string, number>>();
  const seenSeries = new Set<string>();
  let first: Date | null = null;
  let last: Date | null = null;
  for (const p of points) {
    if (!p.createdAt) continue;
    const d = new Date(p.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let bySeries = counts.get(key);
    if (!bySeries) {
      bySeries = new Map();
      counts.set(key, bySeries);
    }
    const seriesKey = seriesOf(p);
    bySeries.set(seriesKey, (bySeries.get(seriesKey) ?? 0) + 1);
    seenSeries.add(seriesKey);
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  if (!first || !last) return { rows: [], series: [] };

  const series = orderSeries(seenSeries);
  const rows: MonthCount[] = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth(), 1);
  while (cursor <= end) {
    const bySeries = counts.get(`${cursor.getFullYear()}-${cursor.getMonth()}`);
    const row: MonthCount = {
      label: cursor.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
      questions: 0,
    };
    for (const seriesKey of series) {
      const n = bySeries?.get(seriesKey) ?? 0;
      row[seriesKey] = n;
      row.questions += n;
    }
    rows.push(row);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return { rows, series };
}

function MonthlyTooltip({
  active,
  payload,
  label,
  colorFor,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    name?: string | number;
    value?: number | string;
    dataKey?: string | number;
  }>;
  label?: string | number;
  colorFor: (seriesKey: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload
    .filter((entry) => typeof entry.value === "number" && entry.value > 0)
    .map((entry) => ({
      key: String(entry.dataKey ?? entry.name ?? ""),
      name: String(entry.name ?? entry.dataKey ?? ""),
      count: entry.value as number,
    }))
    .sort((a, b) => b.count - a.count);
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div
      dir="rtl"
      className="rounded-md border border-surface-200 bg-white px-3 py-2 text-sm shadow-sm"
    >
      <p className="mb-1 font-semibold text-surface-900">{label}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-surface-900">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colorFor(item.key) }}
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="shrink-0 tabular-nums text-surface-600">{item.count}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 border-t border-surface-200 pt-1 text-surface-600">
        סה״כ {total}
      </p>
    </div>
  );
}

type MonthlyView = "total" | "byCategory" | "byCourse";

function monthTotalLabel(value: unknown): string {
  return typeof value === "number" && value > 0 ? String(value) : "";
}

function MonthlyChart({
  data,
  series,
  view,
  color,
  colorFor,
  seriesName,
}: {
  data: MonthCount[];
  series: string[];
  view: MonthlyView;
  /** Solid-bar fill when view is "total". */
  color: string;
  colorFor: (seriesKey: string) => string;
  /** Display name for a stack segment (tooltip). */
  seriesName: (seriesKey: string) => string;
}) {
  // Labels sit on the last series; its zero-height segment still rides the stack top.
  const labelSeries = series[series.length - 1];
  const stacked = view === "byCategory" || view === "byCourse";
  return (
    // LTR so time runs left to right, oldest month first.
    <div dir="ltr" className="w-full [&_*:focus]:outline-none">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e7e6df" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#52514e", fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#52514e", fontSize: 12 }}
          />
          {stacked ? (
            <>
              <Tooltip
                cursor={{ fill: "#f2f1ec" }}
                content={<MonthlyTooltip colorFor={colorFor} />}
              />
              {/* Clips the whole column so the top stays rounded for any top segment. */}
              <BarStack radius={[4, 4, 0, 0]}>
                {series.map((seriesKey) => (
                  <Bar
                    key={seriesKey}
                    dataKey={seriesKey}
                    name={seriesName(seriesKey)}
                    fill={colorFor(seriesKey)}
                    maxBarSize={40}
                    isAnimationActive={false}
                  >
                    {seriesKey === labelSeries ? (
                      <LabelList
                        dataKey="questions"
                        position="top"
                        fill="#52514e"
                        fontSize={11}
                        formatter={monthTotalLabel}
                      />
                    ) : null}
                  </Bar>
                ))}
              </BarStack>
            </>
          ) : (
            <>
              <Tooltip
                cursor={{ fill: "#f2f1ec" }}
                formatter={(value) => [String(value), "שאלות"]}
              />
              <Bar
                dataKey="questions"
                fill={color}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="questions"
                  position="top"
                  fill="#52514e"
                  fontSize={11}
                  formatter={monthTotalLabel}
                />
              </Bar>
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Owns the סה״כ / לפי קטגוריה / לפי קורס toggle so flipping it does not
 * re-render sibling charts (Recharts would replay their label animations).
 */
function MonthlyChartSection({
  points,
  categoryFilter,
  courseFilter,
}: {
  points: DashboardPoint[];
  categoryFilter: string;
  courseFilter: string;
}) {
  const [monthlyView, setMonthlyView] = useState<MonthlyView>("total");
  const monthlyData = useMemo(
    () =>
      monthlyView === "byCourse"
        ? countByMonth(points, (p) => p.courseId, orderedCourses)
        : countByMonth(points, (p) => p.category, orderedCategories),
    [points, monthlyView]
  );

  return (
    <section className="rounded-control border border-surface-200 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 font-semibold text-surface-900">
          שאלות לפי חודש
          {categoryFilter !== ALL ? (
            <span className="font-normal text-surface-600">
              {" "}
              · {categoryFilter}
            </span>
          ) : null}
        </h2>
        <div
          className="flex shrink-0 items-center overflow-hidden rounded-md border border-surface-200 bg-surface-50 text-xs"
          role="group"
          aria-label="תצוגת גרף חודשי"
        >
          <button
            type="button"
            onClick={() => setMonthlyView("total")}
            className={`px-2.5 py-1.5 transition-colors ${
              monthlyView === "total"
                ? "bg-white font-semibold text-surface-900 shadow-sm"
                : "text-surface-600 hover:text-surface-900"
            }`}
          >
            סה״כ
          </button>
          <button
            type="button"
            onClick={() => setMonthlyView("byCategory")}
            className={`border-r border-surface-200 px-2.5 py-1.5 transition-colors ${
              monthlyView === "byCategory"
                ? "bg-white font-semibold text-surface-900 shadow-sm"
                : "text-surface-600 hover:text-surface-900"
            }`}
          >
            לפי קטגוריה
          </button>
          <button
            type="button"
            onClick={() => setMonthlyView("byCourse")}
            className={`border-r border-surface-200 px-2.5 py-1.5 transition-colors ${
              monthlyView === "byCourse"
                ? "bg-white font-semibold text-surface-900 shadow-sm"
                : "text-surface-600 hover:text-surface-900"
            }`}
          >
            לפי קורס
          </button>
        </div>
      </div>
      {monthlyData.rows.length > 0 ? (
        <>
          <MonthlyChart
            data={monthlyData.rows}
            series={monthlyData.series}
            view={monthlyView}
            color={
              categoryFilter !== ALL
                ? categoryColor(categoryFilter)
                : courseFilter !== ALL
                  ? courseColor(courseFilter)
                  : "#0284c7"
            }
            colorFor={monthlyView === "byCourse" ? courseColor : categoryColor}
            seriesName={
              monthlyView === "byCourse" ? shortCourseName : (key) => key
            }
          />
          {monthlyView === "byCategory" ? (
            <p className="mt-2 text-xs text-surface-600">
              כל עמודה מפוצלת לפי קטגוריה (אותם צבעים כמו בטבלת הקטגוריות).
            </p>
          ) : null}
          {monthlyView === "byCourse" ? (
            <p className="mt-2 text-xs text-surface-600">
              כל עמודה מפוצלת לפי קורס.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-surface-600">אין נתונים להצגה.</p>
      )}
    </section>
  );
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
          isAnimationActive={false}
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
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-surface-900">
            {group.category}
          </span>
          <span className="block truncate text-xs text-surface-600">
            {group.questions.length} שאלות
          </span>
        </span>
        {/* After the label in DOM so RTL flex parks it on the visual left. */}
        <span
          aria-hidden
          className={`shrink-0 text-surface-600 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
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

  // The start date defaults to the first question's day: an empty startDate
  // shows (and filters) as that day.
  const firstDate = useMemo(
    () => firstQuestionDate(current?.points ?? []),
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

  const filtersActive =
    courseFilter !== ALL ||
    categoryFilter !== ALL ||
    (startDate !== "" && startDate !== firstDate) ||
    endDate !== "";
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
                value={startDate || firstDate}
                min={firstDate || undefined}
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
                min={startDate || firstDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCourseFilter(ALL);
                setCategoryFilter(ALL);
                setStartDate("");
                setEndDate("");
              }}
              disabled={!filtersActive}
              className="shrink-0"
            >
              איפוס סינון
            </Button>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label="שאלות שנותחו"
              value={visiblePoints.length.toLocaleString("he-IL")}
            />
            <StatTile
              label="קטגוריות"
              value={categoryGroups.length.toLocaleString("he-IL")}
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

          <MonthlyChartSection
            points={visiblePoints}
            categoryFilter={categoryFilter}
            courseFilter={courseFilter}
          />

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
