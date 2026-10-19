import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Spinner } from "@workspace/ui";
import type { CourseTree, PageType } from "../lib/types";
import { PAGE_TYPE_LABEL, PAGE_TYPE_LOGO } from "../lib/types";
import * as api from "../lib/api";
import {
  ALL_COMPONENT_TYPES,
  ALL_PAGE_TYPES,
  COMPONENT_TYPE_LABEL,
  type CourseOverviewStats,
} from "../lib/courseOverviewStats";

interface CourseOverviewProps {
  tree: CourseTree;
}

const PAGE_TYPE_COLORS: Record<string, string> = {
  page: "#3B82F6",
  h5p: "#8B5CF6",
  notes_board: "#F59E0B",
  word_cloud: "#06B6D4",
  forum: "#EC4899",
};

const WORKFLOW_COLORS: Record<string, string> = {
  in_progress: "#F59E0B",
  ready_for_implementation: "#10B981",
};

const IMPLEMENT_COLORS: Record<string, string> = {
  implemented: "#10B981",
  needs_update: "#F59E0B",
  not_implemented: "#EF4444",
};

const COMPONENT_COLORS = [
  "#EF4444",
  "#3B82F6",
  "#8B5CF6",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#6366F1",
];

interface StatTileProps {
  label: string;
  value: string | number;
  accent: string;
}

function StatTile({ label, value, accent }: StatTileProps) {
  return (
    <div className="relative overflow-hidden border border-surface-200 bg-white px-4 py-3">
      <span
        className="absolute inset-y-0 end-0 w-1"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <p className="text-xs font-medium text-surface-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-surface-900 tabular-nums leading-none">
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  legend,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  legend?: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="border border-surface-200 bg-white p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-surface-800 mb-3">{title}</h3>
      {empty ? (
        <p className="flex items-center justify-center text-sm text-surface-400 h-[200px]">
          אין נתונים להצגה עדיין
        </p>
      ) : (
        <>
          {/* LTR chart geometry — Recharts axes/legends break under dir=rtl */}
          <div dir="ltr" className="h-[200px] w-full">
            {children}
          </div>
          {legend ? <div className="mt-3" dir="rtl">{legend}</div> : null}
        </>
      )}
    </div>
  );
}

function ColorLegend({
  items,
}: {
  items: Array<{ key: string; name: string; color: string; value: number }>;
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
      {items.map((item) => (
        <li
          key={item.key}
          className="inline-flex items-center gap-1.5 text-xs text-surface-700"
        >
          <span
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span>
            {item.name} ({item.value})
          </span>
        </li>
      ))}
    </ul>
  );
}

function PageTypeLegend({
  items,
}: {
  items: Array<{ key: string; name: string; value: number }>;
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
      {items.map((item) => (
        <li
          key={item.key}
          className="inline-flex items-center gap-1.5 text-xs text-surface-700"
        >
          <img
            src={PAGE_TYPE_LOGO[item.key as PageType]}
            alt=""
            className="w-4 h-4 object-contain shrink-0"
          />
          <span>
            {item.name} ({item.value})
          </span>
        </li>
      ))}
    </ul>
  );
}

function tooltipStyle(): React.CSSProperties {
  return {
    backgroundColor: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    fontSize: 13,
    direction: "rtl",
    textAlign: "right",
  };
}

export function CourseOverview({ tree }: CourseOverviewProps) {
  const [stats, setStats] = useState<CourseOverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getCourseOverviewData(tree)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tree]);

  const pageTypeData = useMemo(() => {
    if (!stats) return [];
    return ALL_PAGE_TYPES.filter((t) => stats.pageTypeCounts[t] > 0).map(
      (t) => ({
        key: t,
        name: PAGE_TYPE_LABEL[t],
        value: stats.pageTypeCounts[t],
        color: PAGE_TYPE_COLORS[t],
      })
    );
  }, [stats]);

  const workflowData = useMemo(() => {
    if (!stats) return [];
    const rows = [
      {
        key: "in_progress",
        name: "בעבודה",
        value: stats.workflowCounts.in_progress,
        color: WORKFLOW_COLORS.in_progress,
      },
      {
        key: "ready_for_implementation",
        name: "מוכן להטמעה",
        value: stats.workflowCounts.ready_for_implementation,
        color: WORKFLOW_COLORS.ready_for_implementation,
      },
    ];
    return rows.filter((r) => r.value > 0);
  }, [stats]);

  const implementData = useMemo(() => {
    if (!stats) return [];
    const r = stats.implementRollup;
    return [
      {
        name: "הוטמע",
        value: r.implemented_count,
        fill: IMPLEMENT_COLORS.implemented,
      },
      {
        name: "עבר שינוי",
        value: r.needs_update_count,
        fill: IMPLEMENT_COLORS.needs_update,
      },
      {
        name: "לא הוטמע",
        value: r.not_implemented_count,
        fill: IMPLEMENT_COLORS.not_implemented,
      },
    ].filter((row) => row.value > 0);
  }, [stats]);

  const componentData = useMemo(() => {
    if (!stats) return [];
    return ALL_COMPONENT_TYPES.filter(
      (t) => stats.componentTypeCounts[t] > 0
    ).map((t, i) => ({
      name: COMPONENT_TYPE_LABEL[t],
      value: stats.componentTypeCounts[t],
      fill: COMPONENT_COLORS[i % COMPONENT_COLORS.length],
    }));
  }, [stats]);

  return (
    <div dir="rtl" lang="he" className="max-w-5xl mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-surface-900 leading-snug">
          {tree.course.title?.trim() || "קורס"}
        </h1>
        <p className="mt-1 text-sm text-surface-500">
          סקירת מבנה והתקדמות
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-base text-surface-600 py-12 justify-center">
          <Spinner size="sm" />
          טוען סקירה...
        </div>
      )}

      {error && (
        <div className="border border-danger bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <StatTile
              label="שיעורים"
              value={stats.lessonCount}
              accent="#3B82F6"
            />
            <StatTile
              label="עמודים"
              value={stats.pageCount}
              accent="#8B5CF6"
            />
            <StatTile
              label="רכיבים"
              value={stats.componentCount}
              accent="#10B981"
            />
            <StatTile
              label="ממוצע עמודים לשיעור"
              value={stats.avgPagesPerLesson}
              accent="#F59E0B"
            />
            <StatTile
              label="ממוצע רכיבים לעמוד"
              value={stats.avgComponentsPerPage}
              accent="#EC4899"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard
              title="סוגי עמודים"
              empty={pageTypeData.length === 0}
              legend={<PageTypeLegend items={pageTypeData} />}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={pageTypeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {pageTypeData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(value, name) => [`${value}`, String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="סטטוס עבודה"
              empty={workflowData.length === 0}
              legend={<ColorLegend items={workflowData} />}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={workflowData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {workflowData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(value, name) => [`${value}`, String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="התקדמות הטמעה"
              empty={implementData.length === 0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={implementData}
                  margin={{ top: 12, right: 12, left: 4, bottom: 28 }}
                >
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={{ fontSize: 12, fill: "#4b5563" }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={false}
                    height={28}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#4b5563" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    cursor={{ fill: "rgba(15, 108, 191, 0.06)" }}
                  />
                  <Bar dataKey="value" name="רכיבים" radius={[4, 4, 0, 0]}>
                    {implementData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="סוגי רכיבים" empty={componentData.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={componentData}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#4b5563" }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fontSize: 11, fill: "#4b5563", textAnchor: "end" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    cursor={{ fill: "rgba(15, 108, 191, 0.06)" }}
                  />
                  <Bar dataKey="value" name="כמות" radius={[0, 4, 4, 0]}>
                    {componentData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
