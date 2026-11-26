import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageLayout } from "@workspace/ui";
import { ComponentBankPanel } from "./components/ComponentBankPanel";
import { drupalHomePath } from "./paths";

type ToolMode = "components" | "images";

/** Hub header is `h-12` (3rem) in PageLayout. */
const HEADER_OFFSET = "3rem";

/**
 * Drupal Helper UI (no Router). Mount at hub `/drupal-tool/*`, or under
 * the same path in the standalone Vite app’s `<BrowserRouter>`.
 */
export default function App() {
  return (
    <PageLayout
      toolName="Drupal Helper"
      toolDescription="Component bank for direct paste into Drupal, plus an image generator matched to Drupal site designs."
      toolNameHe="כלי עזר לדרופל"
      toolDescriptionHe="בנק רכיבים להעתקה ישירה לדרופל ומחולל תמונות להתאמה לעיצובים של האתר בדרופל"
      maxWidth="full"
      padded={false}
    >
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="*" element={<Navigate to={drupalHomePath()} replace />} />
      </Routes>
    </PageLayout>
  );
}

function HomePage() {
  const [mode, setMode] = useState<ToolMode>("components");

  return (
    <div
      className="flex w-full items-center justify-center"
      style={{ height: `calc(100vh - ${HEADER_OFFSET})` }}
      dir="rtl"
    >
      <div
        className="flex flex-col overflow-hidden rounded-control border border-surface-200 bg-white"
        style={{ width: "70%", height: "80%" }}
      >
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="min-h-0 flex-1 overflow-auto border-t border-surface-200 p-6">
          {mode === "components" ? (
            <ComponentBankPanel />
          ) : (
            <ImageGeneratorPanel />
          )}
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ToolMode;
  onChange: (mode: ToolMode) => void;
}) {
  const segments: { id: ToolMode; label: string }[] = [
    { id: "components", label: "בנק רכיבים" },
    { id: "images", label: "מחולל תמונות" },
  ];

  return (
    <div
      className="flex w-full shrink-0 text-sm font-semibold"
      role="tablist"
      aria-label="מצב הכלי"
    >
      {segments.map((seg, i) => {
        const selected = mode === seg.id;
        return (
          <button
            key={seg.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(seg.id)}
            className={`flex-1 py-2.5 text-center transition-colors duration-fast ${
              i > 0 ? "border-s border-surface-200" : ""
            } ${
              selected
                ? "bg-black text-white"
                : "bg-white text-surface-600 hover:bg-surface-50 hover:text-surface-900"
            }`}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

function ImageGeneratorPanel() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-surface-900">מחולל תמונות</h2>
      <p className="text-sm leading-relaxed text-surface-600">
        כאן יופיע מחולל תמונות להתאמה לעיצובי האתר בדרופל. הפיצ׳ר עדיין בפיתוח.
      </p>
    </div>
  );
}
