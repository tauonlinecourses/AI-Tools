import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS, OTHER_CATEGORY_COLOR } from "../lib/categoryColors";
import type {
  DashboardCluster,
  DashboardPoint,
} from "../lib/dashboardTypes";

const UNGROUPED_COLOR = "#d6d5ce";
const HOVER_LINE_CHARS = 55;
const OTHER_LABEL = "קטגוריות נוספות";
const UNGROUPED_LABEL = "שאלות ללא קבוצה";

type PlotlyElement = HTMLDivElement & {
  on?: (event: string, cb: (e: PlotlyClick) => void) => void;
  removeAllListeners?: (event: string) => void;
};

interface PlotlyClick {
  points: { customdata?: number | null }[];
}

interface Props {
  points: DashboardPoint[];
  clusters: DashboardCluster[];
  onSelectCluster: (id: number) => void;
}

/** Plotly hover labels don't wrap on their own. */
function wrapLines(text: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > HOVER_LINE_CHARS) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  return lines.join("<br>");
}

function hoverText(point: DashboardPoint, clusterName?: string): string {
  // Student text must not be read as Plotly's pseudo-HTML.
  const safe = (s: string) => wrapLines(s.replace(/[<>&]/g, " "));
  const parts = [`<b>${safe(point.title)}</b>`];
  if (point.snippet) parts.push(safe(point.snippet));
  if (clusterName) parts.push(`<i>${safe(clusterName)}</i>`);
  return parts.join("<br>");
}

function trace(
  name: string,
  points: DashboardPoint[],
  clusterById: Map<number, DashboardCluster>,
  color: string,
  size: number
) {
  return {
    type: "scatter3d",
    mode: "markers",
    name,
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
    z: points.map((p) => p.z),
    customdata: points.map((p) => p.clusterId),
    text: points.map((p) =>
      hoverText(
        p,
        p.clusterId === null ? undefined : clusterById.get(p.clusterId)?.name
      )
    ),
    hovertemplate: "%{text}<extra></extra>",
    marker: { color, size, opacity: 0.9 },
  };
}

function buildTraces({
  points,
  clusters,
}: Omit<Props, "onSelectCluster">) {
  const clusterById = new Map(clusters.map((c) => [c.id, c]));
  const categoryOf = (p: DashboardPoint) =>
    p.clusterId === null ? null : clusterById.get(p.clusterId)?.category ?? null;

  const traces = Object.entries(CATEGORY_COLORS).map(([category, color]) =>
    trace(
      category,
      points.filter((p) => categoryOf(p) === category),
      clusterById,
      color,
      4
    )
  );
  traces.push(
    trace(
      OTHER_LABEL,
      points.filter((p) => {
        const category = categoryOf(p);
        return category !== null && !(category in CATEGORY_COLORS);
      }),
      clusterById,
      OTHER_CATEGORY_COLOR,
      4
    ),
    trace(
      UNGROUPED_LABEL,
      points.filter((p) => p.clusterId === null),
      clusterById,
      UNGROUPED_COLOR,
      2.5
    )
  );
  // Empty traces would add legend entries for categories that aren't shown.
  return traces.filter((t) => t.x.length > 0);
}

const hiddenAxis = {
  showticklabels: false,
  showgrid: false,
  zeroline: false,
  showspikes: false,
  title: { text: "" },
};

const layout = {
  // A stable uirevision keeps the user's camera when the selection changes.
  uirevision: "keep",
  margin: { l: 0, r: 0, t: 0, b: 0 },
  paper_bgcolor: "#fcfcfb",
  scene: { xaxis: hiddenAxis, yaxis: hiddenAxis, zaxis: hiddenAxis },
  // The categories bar chart next to the map doubles as its color key.
  showlegend: false,
  hoverlabel: { align: "right", font: { size: 13 } },
};

export function QuestionMap3D({ onSelectCluster, ...traceProps }: Props) {
  const containerRef = useRef<PlotlyElement | null>(null);
  const onSelectRef = useRef(onSelectCluster);
  onSelectRef.current = onSelectCluster;
  const [loadError, setLoadError] = useState(false);
  const { points, clusters } = traceProps;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Large WebGL bundle: fetched only when this view opens.
        const { default: Plotly } = await import("plotly.js-gl3d-dist-min");
        const element = containerRef.current;
        if (cancelled || !element) return;
        await Plotly.react(
          element,
          buildTraces({ points, clusters }),
          layout,
          { displaylogo: false, responsive: true, displayModeBar: false }
        );
        element.removeAllListeners?.("plotly_click");
        element.on?.("plotly_click", (event) => {
          const id = event.points[0]?.customdata;
          if (typeof id === "number") onSelectRef.current(id);
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, clusters]);

  useEffect(() => {
    const element = containerRef.current;
    return () => {
      if (!element) return;
      void import("plotly.js-gl3d-dist-min").then(({ default: Plotly }) =>
        Plotly.purge(element)
      );
    };
  }, []);

  if (loadError) {
    return (
      <p className="p-6 text-sm text-red-800">
        לא ניתן היה לטעון את הגרף התלת־ממדי.
      </p>
    );
  }
  return <div ref={containerRef} className="h-[30rem] w-full" dir="ltr" />;
}
