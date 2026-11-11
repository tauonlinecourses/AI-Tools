/**
 * Small chart building blocks for the admin dashboard (recharts).
 *
 * Colors: reference data-viz palette, light mode (the app has no dark theme).
 * Categorical slots are assigned in fixed order and follow the series, never
 * its rank. Status red is reserved for threshold lines and always labelled.
 */

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
export const CRITICAL = "#d03b3b";
const GRID = "#e8e8e5";
const AXIS_TEXT = "#52514e";
const RELEASE = "#8a8984";

// ------------------------------------------------------------------ format

export const fmt = {
  pct: (v: number | null | undefined) =>
    v == null ? "—" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`,
  sec: (ms: number | null | undefined) =>
    ms == null ? "—" : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`,
  usd: (v: number | null | undefined) =>
    v == null
      ? "—"
      : `$${v < 0.01 && v > 0 ? v.toFixed(4) : v < 10 ? v.toFixed(2) : v.toFixed(0)}`,
  int: (v: number | null | undefined) =>
    v == null ? "—" : Math.round(v).toLocaleString("en-US"),
  compact: (v: number | null | undefined) =>
    v == null
      ? "—"
      : new Intl.NumberFormat("en-US", { notation: "compact" }).format(v),
  num: (v: number | null | undefined, digits = 3) =>
    v == null ? "—" : v.toFixed(digits),
  /** "2026-11-05" → "05/11" */
  day: (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`,
};

// ------------------------------------------------------------------ layout

export function Section({
  title,
  question,
  children,
}: {
  title: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
        <p className="text-xs text-surface-500">{question}</p>
      </header>
      {children}
    </section>
  );
}

export function Card({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-[1.25rem] bg-white p-4 ring-1 ring-black/5 ${className}`}
    >
      <h3 className="text-sm font-medium text-surface-800">{title}</h3>
      {note ? <p className="mt-0.5 text-xs text-surface-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Threshold breached: shown with an icon + text, not color alone. */
  alert?: string;
}) {
  return (
    <div className="min-w-0 rounded-[1.25rem] bg-white px-4 py-3 ring-1 ring-black/5">
      <p className="truncate text-xs text-surface-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-surface-900" dir="ltr">
        {value}
      </p>
      {alert ? (
        <p className="mt-0.5 text-xs font-medium" style={{ color: CRITICAL }}>
          ⚠ {alert}
        </p>
      ) : hint ? (
        <p className="mt-0.5 truncate text-xs text-surface-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-[1rem] border border-dashed border-surface-200 px-6 text-center text-xs text-surface-500">
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ charts

export type Series = { key: string; label: string };
type Row = Record<string, unknown> & { day: string };

type CommonProps = {
  data: Row[];
  series: Series[];
  format: (v: number | null | undefined) => string;
  /** Horizontal threshold line, labelled. */
  threshold?: { value: number; label: string };
  /** Vertical release markers (pipeline version first seen). */
  releases?: Array<{ version: string; day: string }>;
  height?: number;
};

function axisProps(format: CommonProps["format"]) {
  return {
    x: {
      dataKey: "day",
      tickFormatter: fmt.day,
      tick: { fontSize: 11, fill: AXIS_TEXT },
      tickLine: false,
      axisLine: { stroke: GRID },
      minTickGap: 16,
    },
    y: {
      tickFormatter: (v: number) => format(v),
      tick: { fontSize: 11, fill: AXIS_TEXT },
      tickLine: false,
      axisLine: false,
      width: 52,
    },
  };
}

function tooltipProps(format: CommonProps["format"]) {
  return {
    formatter: (value: unknown) => format(typeof value === "number" ? value : null),
    labelFormatter: (label: unknown) => String(label),
    contentStyle: { fontSize: 12, borderRadius: 8, borderColor: GRID },
  };
}

function Markers({
  threshold,
  releases,
}: Pick<CommonProps, "threshold" | "releases">) {
  return (
    <>
      {threshold ? (
        <ReferenceLine
          y={threshold.value}
          stroke={CRITICAL}
          strokeDasharray="4 4"
          label={{ value: threshold.label, fill: CRITICAL, fontSize: 11, position: "insideTopRight" }}
        />
      ) : null}
      {(releases ?? []).map((r) => (
        <ReferenceLine
          key={r.version}
          x={r.day}
          stroke={RELEASE}
          strokeDasharray="2 3"
          label={{ value: r.version, fill: RELEASE, fontSize: 10, position: "insideTopLeft", angle: 0 }}
        />
      ))}
    </>
  );
}

export function TrendLines({
  data,
  series,
  format,
  threshold,
  releases,
  height = 200,
}: CommonProps) {
  const axes = axisProps(format);
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...axes.x} />
          <YAxis {...axes.y} />
          <Tooltip {...tooltipProps(format)} />
          {series.length > 1 ? <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} /> : null}
          <Markers threshold={threshold} releases={releases} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyBars({
  data,
  series,
  format,
  stacked = false,
  height = 200,
  threshold,
  releases,
}: CommonProps & { stacked?: boolean }) {
  const axes = axisProps(format);
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...axes.x} />
          <YAxis {...axes.y} />
          <Tooltip {...tooltipProps(format)} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          {series.length > 1 ? <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} /> : null}
          <Markers threshold={threshold} releases={releases} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              stackId={stacked ? "stack" : undefined}
              // 2px surface gap between stacked segments
              stroke="#ffffff"
              strokeWidth={stacked ? 1 : 0}
              radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ table

export function DataTable<T>({
  rows,
  columns,
  empty = "אין נתונים בטווח הזה",
}: {
  rows: T[];
  columns: Array<{ label: string; render: (row: T) => ReactNode; numeric?: boolean }>;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-surface-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-100 text-surface-500">
            {columns.map((c) => (
              <th key={c.label} className={`px-2 py-1.5 font-medium ${c.numeric ? "text-left" : "text-right"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-surface-50 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.label}
                  className={`px-2 py-1.5 ${c.numeric ? "text-left tabular-nums" : "text-right text-surface-800"}`}
                  dir={c.numeric ? "ltr" : undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
