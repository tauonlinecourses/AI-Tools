import { useEffect, useRef, useState } from "react";
import type { PageComponent } from "../lib/types";
import {
  CATEGORIES,
  catalogItem,
  describeTemplateTypes,
  templateTypesFromPage,
} from "../lib/componentCatalog";
import { DuplicateTemplateNameError } from "../lib/api";
import { isTemplateNameTaken, saveUserTemplate, useUserTemplates } from "../lib/userTemplates";
import { TemplateIcon } from "./icons";

const MAX_NAME = 80;

/**
 * Edit-mode page-header button: saves the page's block layout (types and order,
 * no content) as one of the user's private templates.
 */
export function SaveTemplateButton({
  components,
  defaultName,
}: {
  components: PageComponent[];
  defaultName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Loads the list so the duplicate-name check has something to compare against.
  useUserTemplates();

  const types = templateTypesFromPage(components);
  // A page with only a banner has nothing to save (banners are left out).
  const empty = types.length === 0;

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Brief confirmation after saving.
  useEffect(() => {
    if (!savedName) return;
    const t = window.setTimeout(() => setSavedName(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedName]);

  function toggle() {
    if (empty) return;
    if (!open) {
      setName(defaultName.trim().slice(0, MAX_NAME));
      setError(null);
    }
    setOpen((v) => !v);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("יש לתת שם לתבנית");
      return;
    }
    if (isTemplateNameTaken(trimmed)) {
      setError("כבר יש לך תבנית בשם הזה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveUserTemplate(trimmed, types);
      setOpen(false);
      setSavedName(trimmed);
    } catch (e) {
      setError(
        e instanceof DuplicateTemplateNameError
          ? e.message
          : `השמירה נכשלה: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setSaving(false);
    }
  }

  const label = empty ? "אין רכיבים לשמירה כתבנית" : "שמירת העמוד כתבנית";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-disabled={empty ? true : undefined}
        aria-expanded={open}
        title={label}
        aria-label={label}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-control border leading-none transition-colors duration-fast ${
          empty
            ? "cursor-not-allowed border-surface-200 bg-surface-50 text-surface-400 opacity-60"
            : open
              ? "border-[#0F6CBF] bg-[#0F6CBF] text-white"
              : "border-black bg-white text-black hover:bg-gray-50 active:bg-gray-100"
        }`}
      >
        <TemplateIcon />
      </button>

      {savedName && !open && (
        <div
          role="status"
          className="absolute top-full end-0 z-[60] mt-2 whitespace-nowrap rounded-control border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-lg"
        >
          התבנית „{savedName}” נשמרה בתבניות שלי
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="שמירת העמוד כתבנית"
          className="absolute top-full end-0 z-[60] mt-2 flex w-80 flex-col gap-2.5 rounded-control border border-surface-200 bg-white p-3 shadow-lg"
        >
          <span className="text-sm font-semibold text-surface-800">שמירת העמוד כתבנית</span>
          <p className="text-xs leading-snug text-surface-500">
            נשמר מבנה העמוד בלבד (סוגי הרכיבים והסדר שלהם), בלי התוכן ובלי הבאנר (הוא נוסף אוטומטית לכל עמוד). התבנית תופיע אצלך ב„תבניות שלי”.
          </p>
          <label className="flex flex-col gap-1 text-xs font-medium text-surface-600">
            שם התבנית
            <input
              autoFocus
              value={name}
              maxLength={MAX_NAME}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              className="rounded-control border border-surface-200 px-2 py-1.5 text-sm text-surface-900 outline-none focus:border-[#0F6CBF]"
            />
          </label>
          <div className="flex items-start gap-2 rounded-control bg-surface-50 p-2">
            <span className="flex w-10 shrink-0 flex-col gap-[3px]" aria-hidden>
              {types.map((t, i) => (
                <i
                  key={i}
                  className="block h-[7px] rounded-timeline"
                  style={{
                    background: `color-mix(in srgb, ${
                      CATEGORIES.find((c) => c.id === catalogItem(t).category)!.color
                    } 45%, white)`,
                  }}
                />
              ))}
            </span>
            <small className="text-[11.5px] leading-snug text-surface-600">
              {describeTemplateTypes(types)}
            </small>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-control px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100"
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-control bg-[#0F6CBF] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0B5A9F] disabled:opacity-60"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
