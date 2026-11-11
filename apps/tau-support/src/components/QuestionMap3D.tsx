import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS, OTHER_CATEGORY_COLOR } from "../lib/categoryColors";
import type { DashboardPoint } from "../lib/dashboardTypes";

const HOVER_LINE_CHARS = 55;
const OTHER_LABEL = "קטגוריות נוספות";

type PlotlyElement = HTMLDivElement & {
  on?: (event: string, cb: (e: PlotlyClick) => void) => void;
  removeAllListeners?: (event: string) => void;
};

interface PlotlyClick {
  points: { customdata?: string | null }[];
}

interface Props {
  points: DashboardPoint[];
  /** A click on a point opens that question's category. */
  onSelectCategory: (category: string) => void;
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

function hoverText(point: DashboardPoint): string {
  // Student text must not be read as Plotly's pseudo-HTML.
  const safe = (s: string) => wrapLines(s.replace(/[<>&]/g, " "));
  const parts = [`<b>${safe(point.title)}</b>`];
  if (point.snippet) parts.push(safe(point.snippet));
  parts.push(`<i>${safe(point.category)}</i>`);
  return parts.join("<br>");
}

function trace(name: string, points: DashboardPoint[], color: string) {
  return {
    type: "scatter3d",
    mode: "markers",
    name,
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
    z: points.map((p) => p.z),
    customdata: points.map((p) => p.category),
    text: points.map(hoverText),
    hovertemplate: "%{text}<extra></extra>",
    marker: { color, size: 4, opacity: 0.9 },
  };
}

function buildTraces(points: DashboardPoint[]) {
  const traces = Object.entries(CATEGORY_COLORS).map(([category, color]) =>
    trace(
      category,
      points.filter((p) => p.category === category),
      color
    )
  );
  traces.push(
    trace(
      OTHER_LABEL,
      points.filter((p) => !(p.category in CATEGORY_COLORS)),
      OTHER_CATEGORY_COLOR
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

export function QuestionMap3D({ points, onSelectCategory }: Props) {
  const containerRef = useRef<PlotlyElement | null>(null);
  const onSelectRef = useRef(onSelectCategory);
  onSelectRef.current = onSelectCategory;
  const [loadError, setLoadError] = useState(false);

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
          buildTraces(points),
          layout,
          { displaylogo: false, responsive: true, displayModeBar: false }
        );
        element.removeAllListeners?.("plotly_click");
        element.on?.("plotly_click", (event) => {
          const category = event.points[0]?.customdata;
          if (typeof category === "string") onSelectRef.current(category);
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points]);

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
