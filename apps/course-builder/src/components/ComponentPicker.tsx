import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PageComponent } from "../lib/types";
import {
  CATALOG,
  CATEGORIES,
  POPULAR,
  catalogItem,
  lockReason,
  readRecent,
  searchCatalog,
  suggestionsAfter,
  type CatalogItem,
  type CategoryId,
  type PickerType,
} from "../lib/componentCatalog";
import { ChevronDownIcon, LockIcon } from "./icons";

type View = "home" | "all" | CategoryId;

const SearchIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" />
  </svg>
);
const SparkIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path strokeLinecap="round" d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </svg>
);
const ClockIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path strokeLinecap="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />
  </svg>
);

const catColor = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.color;

const TILE_MIN = 80;
const TILE_MAX = 110;
const TILE_GAP = 2; // gap-0.5
const SEPARATOR = 1 + 12 * 2; // 1px line + gap-x-3 on each side

/**
 * Quick bar layout: how many "most used" tiles fit next to the suggestions,
 * and one shared tile width that makes the row end flush (no leftover gap).
 */
function fitQuickBar(
  width: number,
  suggestionCount: number,
  commonCount: number,
): { common: number; tileWidth: number } {
  for (let k = commonCount; k >= 0; k--) {
    const n = suggestionCount + k;
    const gaps = TILE_GAP * (Math.max(suggestionCount - 1, 0) + Math.max(k - 1, 0));
    const chrome = k > 0 ? SEPARATOR : 0;
    const w = (width - chrome - gaps) / n;
    if (w >= TILE_MIN) return { common: k, tileWidth: Math.min(w, TILE_MAX) };
  }
  return { common: 0, tileWidth: TILE_MIN };
}

/**
 * Add-component menu: opens as a quick bar (suggestions for this spot + most
 * used types) that expands into search, a category rail and the full catalog.
 */
export function ComponentPicker({
  prevType,
  contextLabel,
  components,
  isHome,
  iconFor,
  onPick,
  onClose,
  persistent = false,
}: {
  /** Type of the block right before the insert point (drives suggestions). */
  prevType: ComponentType | null;
  /** e.g. "הוספה אחרי: טקסט". */
  contextLabel: string;
  components: PageComponent[];
  isHome: boolean;
  iconFor: (type: PickerType) => React.ReactNode;
  onPick: (type: PickerType) => void;
  onClose: () => void;
  /**
   * Always-visible bar (bottom of the page): no focus grab on mount, no
   * outside-click close, and Esc collapses the full menu back to the bar.
   */
  persistent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const recent = useMemo(readRecent, []);
  const quickRowRef = useRef<HTMLDivElement>(null);
  const [quickWidth, setQuickWidth] = useState(0);

  // Track the quick bar's inner width so tiles can share it evenly.
  useLayoutEffect(() => {
    const el = quickRowRef.current;
    if (expanded || !el) return;
    const measure = () =>
      setQuickWidth(el.clientWidth - parseFloat(getComputedStyle(el).paddingInline || "0") * 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  const suggestions = suggestionsAfter(prevType);
  const reason = (t: PickerType) => lockReason(t, components, isHome);
  const results = useMemo(() => searchCatalog(query), [query]);

  // Focus: first open tile in the quick bar, search box once expanded.
  // A persistent bar never grabs focus by itself (it renders on page load).
  const didExpand = useRef(false);
  useEffect(() => {
    if (expanded) {
      didExpand.current = true;
      searchRef.current?.focus({ preventScroll: true });
    } else if (persistent) {
      if (didExpand.current) {
        rootRef.current?.querySelector<HTMLElement>("[data-expand]")?.focus({ preventScroll: true });
      }
    } else {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-pick]:not([aria-disabled='true'])")
        ?.focus({ preventScroll: true });
    }
  }, [expanded, persistent]);

  // Close on outside pointer-down (the triggers toggle themselves).
  useEffect(() => {
    if (persistent) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Element | null;
      if (!t || rootRef.current?.contains(t) || t.closest("[data-picker-trigger]")) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, persistent]);

  function collapse() {
    setExpanded(false);
    setQuery("");
    setActive(0);
    setView("home");
    setMessage("");
  }

  function pick(type: PickerType) {
    const r = reason(type);
    if (r) {
      setMessage(r);
      return;
    }
    onPick(type);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (persistent) collapse();
      else onClose();
      return;
    }
    if (e.target !== searchRef.current || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[Math.min(active, results.length - 1)].type);
    }
  }

  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    rootRef.current
      ?.querySelector("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  const tile = (t: PickerType) => {
    const item = catalogItem(t);
    const r = reason(t);
    return (
      <button
        key={t}
        type="button"
        data-pick={t}
        aria-disabled={r ? true : undefined}
        title={r ?? item.description}
        onClick={() => pick(t)}
        className={`relative flex w-full min-w-0 flex-col items-center gap-1.5 rounded-[10px] border border-transparent px-1.5 py-2.5 text-center text-[13px] leading-tight transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6CBF] ${
          r
            ? "cursor-not-allowed opacity-45"
            : "hover:border-[#D6E0EA] hover:bg-[#EEF3F8] focus-visible:bg-[#EEF3F8]"
        }`}
      >
        {r && <LockIcon className="absolute end-1.5 top-1.5 h-3 w-3 text-surface-500" />}
        <TypeIcon item={item} iconFor={iconFor} />
        <span className="w-full truncate text-[#1B3A5C]">{item.label}</span>
      </button>
    );
  };

  const chip = (t: PickerType) => {
    const item = catalogItem(t);
    const r = reason(t);
    return (
      <button
        key={t}
        type="button"
        data-pick={t}
        aria-disabled={r ? true : undefined}
        title={r ?? item.description}
        onClick={() => pick(t)}
        className={`inline-flex items-center gap-1.5 rounded-full border border-[#D6E0EA] bg-white py-1 pe-3 ps-1.5 text-[13px] text-[#1B3A5C] transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6CBF] ${
          r ? "cursor-not-allowed opacity-45" : "hover:border-[#0F6CBF]"
        }`}
      >
        <TypeIcon item={item} iconFor={iconFor} small />
        {item.label}
        {r && <LockIcon className="h-3 w-3 text-surface-500" />}
      </button>
    );
  };

  const row = (item: CatalogItem, index: number) => {
    const r = reason(item.type);
    const isActive = index === active;
    return (
      <button
        key={item.type}
        type="button"
        data-pick={item.type}
        data-active={isActive}
        aria-disabled={r ? true : undefined}
        onClick={() => pick(item.type)}
        onMouseMove={() => setActive(index)}
        className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-start ${
          isActive ? "bg-[#EEF3F8]" : ""
        } ${r ? "cursor-not-allowed opacity-45" : ""}`}
      >
        <TypeIcon item={item} iconFor={iconFor} />
        <span className="flex min-w-0 flex-col leading-snug">
          <span className="text-sm text-[#14263A]">
            {item.label}
            {index === 0 && (
              <span className="ms-1.5 rounded-[5px] bg-[#D4E5F5] px-1.5 text-[10.5px] font-semibold text-[#1B3A5C]">
                תוצאה מובילה
              </span>
            )}
          </span>
          <small className="truncate text-xs text-surface-500">{r ?? item.description}</small>
        </span>
      </button>
    );
  };

  const sectionHeader = (id: CategoryId) => {
    const c = CATEGORIES.find((x) => x.id === id)!;
    return (
      <div className="mx-1 mb-1 mt-3 flex items-center gap-1.5 text-xs font-semibold text-surface-500 first:mt-0.5">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: c.color }} />
        {c.label}
        {id === "social" || id === "quiz" ? (
          <span className="inline-flex items-center gap-1 font-normal">
            · <LockIcon className="h-3 w-3" /> סוג פעילות אחד לעמוד
          </span>
        ) : null}
      </div>
    );
  };

  const shell =
    "my-2 overflow-hidden rounded-[14px] border border-[#D6E0EA] bg-white shadow-[0_10px_30px_-12px_rgba(20,38,58,0.28)]";

  if (!expanded) {
    const common = POPULAR.filter((t) => !suggestions.includes(t));
    const fit = quickWidth
      ? fitQuickBar(quickWidth, suggestions.length, common.length)
      : { common: 0, tileWidth: 84 };
    const slot = (t: PickerType) => (
      <div key={t} className="shrink-0" style={{ width: fit.tileWidth }}>
        {tile(t)}
      </div>
    );
    return (
      <div ref={rootRef} dir="rtl" role="dialog" aria-label="הוספה מהירה" onKeyDown={onKeyDown} className={shell}>
        <div ref={quickRowRef} className="flex gap-x-3 overflow-hidden px-2 pt-2">
          <div className="flex shrink-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 px-1.5 text-[11.5px] text-surface-500">
              <SparkIcon />
              {prevType ? `מומלץ אחרי ${typeLabel(prevType)}` : "מומלץ לפתיחת עמוד"}
            </span>
            <div className="flex gap-0.5">{suggestions.map(slot)}</div>
          </div>
          {fit.common > 0 && (
            <>
              <span className="w-px shrink-0 self-stretch bg-[#D6E0EA]" aria-hidden />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1 truncate px-1.5 text-[11.5px] text-surface-500">
                  <ClockIcon />
                  הנפוצים ביותר
                </span>
                <div className="flex gap-0.5">{common.slice(0, fit.common).map(slot)}</div>
              </div>
            </>
          )}
        </div>
        <p aria-live="polite" className="min-h-[18px] px-3 pb-1 text-xs text-[#B7791F]">
          {message}
        </p>
        <button
          type="button"
          data-expand
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-2 border-t border-[#D6E0EA] bg-[#EEF3F8] px-3 py-2.5 text-[13px] font-medium text-[#0F6CBF] hover:bg-[#D4E5F5] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-[#0F6CBF]"
        >
          <SearchIcon />
          חיפוש וכל הרכיבים ({CATALOG.length})
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const views: { id: View; label: string; count?: number }[] = [
    { id: "home", label: "בשבילך" },
    { id: "all", label: "הכל", count: CATALOG.length },
    ...CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      count: CATALOG.filter((i) => i.category === c.id).length,
    })),
  ];
  const shownCats = view === "all" ? CATEGORIES.map((c) => c.id) : [view as CategoryId];

  return (
    <div ref={rootRef} dir="rtl" role="dialog" aria-label="הוספת רכיב" onKeyDown={onKeyDown} className={shell}>
      <div className="flex flex-col gap-2 border-b border-[#D6E0EA] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-xs text-surface-500">
            {contextLabel}
            <span aria-live="polite" className="ms-2 text-[#B7791F]">{message}</span>
          </span>
          {persistent && (
            <button
              type="button"
              onClick={collapse}
              className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-medium text-[#0F6CBF] hover:bg-[#D4E5F5]"
            >
              <ChevronDownIcon className="h-3.5 w-3.5 rotate-180" />
              חזרה לתפריט המהיר
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 rounded-[10px] border border-[#D6E0EA] bg-white px-2.5 py-1.5 text-surface-500 focus-within:border-[#0F6CBF] focus-within:shadow-[0_0_0_3px_#D4E5F5]">
          <SearchIcon />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setMessage("");
            }}
            placeholder="חיפוש רכיב… (סרטון, quiz, פורום)"
            autoComplete="off"
            aria-label="חיפוש רכיב"
            className="w-full min-w-0 border-0 bg-transparent text-sm text-[#14263A] outline-none"
          />
        </label>
      </div>

      {query.trim() ? (
        <div className="max-h-[320px] overflow-auto p-1.5">
          {results.length ? (
            results.map(row)
          ) : (
            <p className="p-5 text-center text-sm text-surface-500">
              לא נמצא רכיב בשם “{query.trim()}”. נסו מילה אחרת או עיינו בקטגוריות.
            </p>
          )}
        </div>
      ) : (
        <div className="grid h-[340px] grid-cols-[136px_minmax(0,1fr)] max-sm:h-auto max-sm:grid-cols-1">
          <nav
            aria-label="קטגוריות"
            className="flex flex-col gap-0.5 overflow-auto border-e border-[#D6E0EA] bg-[#EEF3F8] px-1.5 py-2 max-sm:flex-row max-sm:border-b max-sm:border-e-0"
          >
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={view === v.id}
                onClick={() => setView(v.id)}
                className={`flex shrink-0 items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-start text-[13px] ${
                  view === v.id
                    ? "bg-white font-semibold text-[#0F6CBF] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[#14263A] hover:bg-white/60"
                }`}
              >
                <span>{v.label}</span>
                {v.count !== undefined && <span className="text-[11px] font-normal text-surface-500">{v.count}</span>}
              </button>
            ))}
          </nav>
          <div className="min-w-0 overflow-auto px-2.5 py-2 max-sm:max-h-[300px]">
            {view === "home" ? (
              <div className="flex flex-col gap-4 px-0.5 py-1">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-surface-500">
                    <SparkIcon />
                    {prevType ? `מומלץ אחרי ${typeLabel(prevType)}` : "מומלץ לפתיחת עמוד"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">{suggestions.map(chip)}</div>
                </div>
                {recent.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-surface-500">
                      <ClockIcon />
                      בשימוש לאחרונה
                    </div>
                    <div className="flex flex-wrap gap-1.5">{recent.map(chip)}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setView("all")}
                  className="self-start rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-[#0F6CBF] hover:bg-[#D4E5F5]"
                >
                  כל הרכיבים ({CATALOG.length}) ←
                </button>
              </div>
            ) : (
              shownCats.map((id) => (
                <div key={id}>
                  {sectionHeader(id)}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-0.5">
                    {CATALOG.filter((i) => i.category === id).map((i) => tile(i.type))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function typeLabel(t: ComponentType): string {
  return t === "interactive_video" ? "וידאו אינטרקטיבי" : catalogItem(t).label;
}

function TypeIcon({
  item,
  iconFor,
  small,
}: {
  item: CatalogItem;
  iconFor: (type: PickerType) => React.ReactNode;
  small?: boolean;
}) {
  const color = catColor(item.category);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${small ? "h-6 w-6 rounded-[7px]" : "h-[34px] w-[34px] rounded-[9px]"}`}
      style={{ color, background: `color-mix(in srgb, ${color} 14%, white)` }}
    >
      {iconFor(item.type)}
    </span>
  );
}
