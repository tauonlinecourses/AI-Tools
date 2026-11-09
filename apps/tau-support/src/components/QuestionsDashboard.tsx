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
} from "recharts";
import { Button, Spinner } from "@workspace/ui";
import { categoryColor } from "../lib/categoryColors";
import { COURSES, courseLabel } from "../lib/courses";
import type {
  DashboardCluster,
  DashboardPoint,
  DashboardSnapshot,
  DashboardStepResult,
} from "../lib/dashboardTypes";
import { buildForumThreadUrl } from "../lib/forumUrls";
import { QuestionMap3D } from "./QuestionMap3D";

const FORUM_UI_ORIGIN = "https://app.campus.gov.il";
const ALL = "__all__";
const MAX_REFRESH_EMBED_CALLS = 200;

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

/** Group sizes and counts as seen through the course filter. */
function clustersForPoints(
  clusters: DashboardCluster[],
  points: DashboardPoint[]
): DashboardCluster[] {
  const byCluster = new Map<number, DashboardPoint[]>();
  for (const point of points) {
    if (point.clusterId === null) continue;
    const members = byCluster.get(point.clusterId);
    if (members) members.push(point);
    else byCluster.set(point.clusterId, [point]);
  }
  return clusters
    .flatMap((cluster) => {
      const members = byCluster.get(cluster.id) ?? [];
      // Fixed and lone groups are valid with a single question in the filter.
      if (members.length < (cluster.reserved || cluster.lone ? 1 : 2)) return [];
      const dates = members
        .map((m) => m.createdAt)
        .filter((d): d is string => Boolean(d))
        .sort();
      return [
        {
          ...cluster,
          size: members.length,
          unansweredCount: members.filter((m) => m.status === "unanswered")
            .length,
          courseIds: [...new Set(members.map((m) => m.courseId))],
          firstAt: dates[0] ?? null,
          lastAt: dates[dates.length - 1] ?? null,
        },
      ];
    })
    .sort(
      (a, b) => Number(Boolean(a.lone)) - Number(Boolean(b.lone)) || b.size - a.size
    );
}

interface CategoryGroup {
  category: string;
  questions: number;
  unanswered: number;
  /** Largest question type first. */
  clusters: DashboardCluster[];
}

function groupByCategory(clusters: DashboardCluster[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const cluster of clusters) {
    const group = groups.get(cluster.category) ?? {
      category: cluster.category,
      questions: 0,
      unanswered: 0,
      clusters: [],
    };
    group.questions += cluster.size;
    group.unanswered += cluster.unansweredCount;
    group.clusters.push(cluster);
    groups.set(cluster.category, group);
  }
  return [...groups.values()].sort((a, b) => b.questions - a.questions);
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
}: {
  data: { category: string; questions: number; color: string }[];
}) {
  return (
    // In an RTL parent, SVG text anchors flip and axis labels land on the bars.
    <div dir="ltr" className="w-full">
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
          tick={{ fill: "#52514e", fontSize: 13 }}
        />
        <Tooltip
          cursor={{ fill: "#f2f1ec" }}
          formatter={(value) => [String(value), "שאלות"]}
        />
        <Bar
          dataKey="questions"
          barSize={20}
          radius={[4, 0, 0, 4]}
        >
          {data.map((row) => (
            <Cell key={row.category} fill={row.color} />
          ))}
          {/* On a reversed axis, "right" means the bar's far (visually left) end. */}
          <LabelList dataKey="questions" position="right" fill="#52514e" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

function ClusterRow({
  cluster,
  members,
  open,
  onToggle,
}: {
  cluster: DashboardCluster;
  members: DashboardPoint[];
  open: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const [bodies, setBodies] = useState<Record<string, string> | null>(null);
  const [bodiesFailed, setBodiesFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
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
  }, [open, members]);

  return (
    <li
      ref={ref}
      className="scroll-mt-16 border-b border-surface-200 last:border-b-0"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-sky-50 ${
          open ? "bg-sky-100" : ""
        }`}
      >
        <span className="w-10 shrink-0 text-lg font-semibold text-surface-900">
          {cluster.size}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-surface-900">
            {cluster.name}
          </span>
          <span className="block truncate text-xs text-surface-600">
            {cluster.category} · {cluster.courseIds.length} קורסים ·{" "}
            {formatDate(cluster.firstAt)} – {formatDate(cluster.lastAt)}
          </span>
        </span>
        {cluster.unansweredCount > 0 ? (
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900">
            {cluster.unansweredCount} ללא מענה
          </span>
        ) : null}
      </button>
      {open ? (
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
      ) : null}
    </li>
  );
}

function CategoryRow({
  group,
  membersByCluster,
  open,
  onToggle,
  selectedClusterId,
  onToggleCluster,
}: {
  group: CategoryGroup;
  membersByCluster: Map<number, DashboardPoint[]>;
  open: boolean;
  onToggle: () => void;
  selectedClusterId: number | null;
  onToggleCluster: (id: number) => void;
}) {
  const rowRef = useRef<HTMLLIElement | null>(null);

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
            {group.questions} שאלות · {group.clusters.length} סוגי שאלות
          </span>
        </span>
        {group.unanswered > 0 ? (
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900">
            {group.unanswered} ללא מענה
          </span>
        ) : null}
      </button>
      {open ? (
        <ul className="border-t border-surface-200 bg-white pe-6">
          {group.clusters.map((cluster) => (
            <ClusterRow
              key={cluster.id}
              cluster={cluster}
              members={membersByCluster.get(cluster.id) ?? []}
              open={selectedClusterId === cluster.id}
              onToggle={() => onToggleCluster(cluster.id)}
            />
          ))}
        </ul>
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
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    null
  );

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
      for (let call = 0; call < MAX_REFRESH_EMBED_CALLS; call += 1) {
        setProgress(`מכין שאלות לניתוח (${embeddedTotal})`);
        const step = await runStep("embedDashboardQuestions");
        embeddedTotal += step.embedded ?? 0;
        if (!step.remaining || !step.embedded) break;
      }
      setProgress("מקבץ שאלות דומות");
      await runStep("rebuildDashboardClusters");
      setProgress("נותן שמות לקבוצות");
      const named = await runStep("nameDashboardClusters");
      setNotice(named.message ?? null);
      setSnapshot(
        await callDashboard<DashboardSnapshot | null>("getDashboardSnapshot")
      );
      setSelectedClusterId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הניתוח נכשל");
    } finally {
      setProgress(null);
    }
  }, []);

  const courseIds = useMemo(
    () => [...new Set(snapshot?.points.map((p) => p.courseId) ?? [])],
    [snapshot]
  );

  const allCategories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cluster of snapshot?.clusters ?? []) {
      totals.set(
        cluster.category,
        (totals.get(cluster.category) ?? 0) + cluster.size
      );
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => category);
  }, [snapshot]);

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
    return (snapshot?.points ?? []).filter(
      (p) =>
        (courseFilter === ALL || p.courseId === courseFilter) &&
        inDateRange(p.createdAt)
    );
  }, [snapshot, courseFilter, startDate, endDate]);

  const courseClusters = useMemo(
    () => clustersForPoints(snapshot?.clusters ?? [], filteredPoints),
    [snapshot, filteredPoints]
  );

  const visibleClusters = useMemo(
    () =>
      courseClusters.filter(
        (c) => categoryFilter === ALL || c.category === categoryFilter
      ),
    [courseClusters, categoryFilter]
  );

  const visiblePoints = useMemo(() => {
    if (categoryFilter === ALL) return filteredPoints;
    const ids = new Set(visibleClusters.map((c) => c.id));
    return filteredPoints.filter(
      (p) => p.clusterId !== null && ids.has(p.clusterId)
    );
  }, [filteredPoints, visibleClusters, categoryFilter]);

  const membersByCluster = useMemo(() => {
    const map = new Map<number, DashboardPoint[]>();
    for (const point of visiblePoints) {
      if (point.clusterId === null) continue;
      map.set(point.clusterId, [...(map.get(point.clusterId) ?? []), point]);
    }
    return map;
  }, [visiblePoints]);

  const categoryGroups = useMemo(
    () => groupByCategory(visibleClusters),
    [visibleClusters]
  );

  /** A click on the 3D map opens that point's category and question type. */
  const handleSelectFromMap = useCallback(
    (id: number) => {
      setSelectedClusterId(id);
      const cluster = snapshot?.clusters.find((c) => c.id === id);
      if (cluster) setOpenCategory(cluster.category);
    },
    [snapshot]
  );

  const categoryData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cluster of courseClusters) {
      totals.set(
        cluster.category,
        (totals.get(cluster.category) ?? 0) + cluster.size
      );
    }
    return [...totals.entries()]
      .map(([category, questions]) => ({
        category,
        questions,
        color: categoryColor(category),
      }))
      .sort((a, b) => b.questions - a.questions);
  }, [courseClusters]);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  const repeatClusters = visibleClusters.filter((c) => !c.lone);
  const groupedCount = repeatClusters.reduce((sum, c) => sum + c.size, 0);
  const unansweredRepeats = repeatClusters.reduce(
    (sum, c) => sum + c.unansweredCount,
    0
  );
  const repeatShare = visiblePoints.length
    ? Math.round((groupedCount / visiblePoints.length) * 100)
    : 0;
  const selectClass =
    "min-w-0 max-w-[14rem] flex-1 truncate rounded-md border border-surface-200 bg-white px-2 py-1.5 text-sm text-surface-900";

  const dateLabelClass =
    "flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-surface-600";
  const dateInputClass =
    "rounded-md border border-surface-200 bg-white px-2 py-1.5 text-sm text-surface-900";

  return (
    <div dir="rtl" className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={progress !== null}
          className="order-last ms-auto shrink-0"
        >
          רענן ניתוח
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
        {snapshot ? (
          <div className="order-first flex min-w-0 flex-1 justify-start gap-2">
            <select
              aria-label="סינון לפי קורס"
              className={selectClass}
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                setSelectedClusterId(null);
              }}
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
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setSelectedClusterId(null);
              }}
            >
              <option value={ALL}>כל הקטגוריות</option>
              {allCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <label className={dateLabelClass}>
              מתאריך
              <input
                type="date"
                className={dateInputClass}
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedClusterId(null);
                }}
              />
            </label>
            <label className={dateLabelClass}>
              עד תאריך
              <input
                type="date"
                className={dateInputClass}
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedClusterId(null);
                }}
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

      {!snapshot ? (
        <p className="rounded-control border border-surface-200 p-8 text-center text-surface-600">
          עדיין אין ניתוח. לחצו על <strong>רענן ניתוח</strong> כדי לקבץ את שאלות
          הפורום. בהרצה הראשונה זה עשוי לקחת כמה דקות.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="שאלות שנותחו"
              value={visiblePoints.length.toLocaleString("he-IL")}
            />
            <StatTile label="שאלות שחוזרות על עצמן" value={`${repeatShare}%`} />
            <StatTile
              label="קבוצות של שאלות דומות"
              value={repeatClusters.length.toLocaleString("he-IL")}
            />
            <StatTile
              label="שאלות חוזרות ללא מענה"
              value={unansweredRepeats.toLocaleString("he-IL")}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="overflow-hidden rounded-control border border-surface-200">
              <h2 className="border-b border-surface-200 px-4 py-3 font-semibold text-surface-900">
                מפת שאלות תלת־ממדית
              </h2>
              <QuestionMap3D
                points={visiblePoints}
                clusters={snapshot.clusters}
                onSelectCluster={handleSelectFromMap}
              />
              <p className="border-t border-surface-200 px-4 py-2 text-xs text-surface-600">
                נקודות קרובות הן שאלות דומות. המרחקים במפה הם קירוב, והקבוצות
                חושבו על הנתונים המלאים.
              </p>
            </section>

            <section className="rounded-control border border-surface-200 p-4">
              <h2 className="mb-3 font-semibold text-surface-900">
                שאלות לפי קטגוריה
              </h2>
              {categoryData.length > 0 ? (
                <CategoryChart data={categoryData} />
              ) : (
                <p className="text-sm text-surface-600">אין נתונים להצגה.</p>
              )}
            </section>
          </div>

          <section className="overflow-hidden rounded-control border border-surface-200">
            <h2 className="border-b border-surface-200 px-4 py-3 font-semibold text-surface-900">
              קטגוריות וסוגי שאלות
            </h2>
            {categoryGroups.length > 0 ? (
              <ul className="max-h-[32rem] overflow-y-auto">
                {categoryGroups.map((group) => (
                  <CategoryRow
                    key={group.category}
                    group={group}
                    membersByCluster={membersByCluster}
                    open={openCategory === group.category}
                    onToggle={() =>
                      setOpenCategory((current) =>
                        current === group.category ? null : group.category
                      )
                    }
                    selectedClusterId={selectedClusterId}
                    onToggleCluster={(id) =>
                      setSelectedClusterId((current) =>
                        current === id ? null : id
                      )
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-surface-600">
                לא נמצאו קבוצות של שאלות דומות.
              </p>
            )}
          </section>

          <p className="text-xs text-surface-600">
            הנתונים מבוססים על שרשורים ששמורים במערכת בלבד
            {snapshot.totalAvailable > snapshot.points.length
              ? `; הניתוח כולל את ${snapshot.points.length.toLocaleString("he-IL")} השאלות החדשות מתוך ${snapshot.totalAvailable.toLocaleString("he-IL")}`
              : ""}
            . סף דמיון: {snapshot.similarityThreshold}.
          </p>
        </>
      )}
    </div>
  );
}
