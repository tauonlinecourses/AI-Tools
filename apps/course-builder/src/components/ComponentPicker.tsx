import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, PageComponent } from "../lib/types";
import {
  CATALOG,
  CATEGORIES,
  POPULAR,
  TEMPLATES,
  catalogItem,
  componentLabel,
  componentOf,
  lockReason,
  readRecent,
  subscribeRecent,
  searchCatalog,
  suggestionsAfter,
  suggestTemplates,
  templateLockReason,
  type CatalogItem,
  type ComponentTemplate,
  type CategoryId,
  type PickerType,
} from "../lib/componentCatalog";
import { ChevronDownIcon, LockIcon, PencilIcon, TrashIcon } from "./icons";
import { DuplicateTemplateNameError } from "../lib/api";
import {
  deleteUserTemplate,
  isTemplateNameTaken,
  renameUserTemplate,
  useUserTemplates,
} from "../lib/userTemplates";

type View = "home" | "all" | "templates" | CategoryId;

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
const LayersIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />
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

/** Recently used tiles in the quick bar (the rest of the room goes to popular). */
const QUICK_RECENT_MAX = 3;

/**
 * Quick bar layout: how many recent and "most used" tiles fit next to the recommended
 * templates, and one shared tile width that makes the row end flush (no leftover gap).
 * When space runs out, popular tiles go first, then recent ones.
 */
function fitQuickBar(
  width: number,
  suggestionCount: number,
  recentCount: number,
  popularCount: number,
): { recent: number; popular: number; tileWidth: number } {
  for (let k = recentCount + popularCount; k >= 0; k--) {
    const r = Math.min(recentCount, k);
    const p = k - r;
    const n = suggestionCount + k;
    const gaps =
      TILE_GAP * (Math.max(suggestionCount - 1, 0) + Math.max(r - 1, 0) + Math.max(p - 1, 0));
    const chrome = SEPARATOR * ((r > 0 ? 1 : 0) + (p > 0 ? 1 : 0));
    const w = (width - chrome - gaps) / n;
    if (w >= TILE_MIN) return { recent: r, popular: p, tileWidth: Math.min(w, TILE_MAX) };
  }
  return { recent: 0, popular: 0, tileWidth: TILE_MIN };
}

const tileBtn =
  "relative flex w-full min-w-0 flex-col items-center gap-1.5 rounded-control border border-transparent px-1.5 py-2.5 text-center text-[13px] leading-tight transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6CBF]";
const tileBtnOk = "hover:border-surface-200 hover:bg-surface-50 focus-visible:bg-surface-50";
const tileBtnLocked = "cursor-not-allowed opacity-45";

/**
 * Add-component menu: opens as a quick bar (recommended templates for this spot + most
 * used types) that expands into search, a category rail and the full catalog.
 * Chrome matches site panels (surface borders, sharp control radii, blue accent);
 * category colors stay on icons, dots, and template previews.
 */
export function ComponentPicker({
  prevType,
  contextLabel,
  components,
  isHome,
  iconFor,
  onPick,
  onPickTemplate,
  onClose,
  persistent = false,
}: {
  /** Type of the block right before the insert point (drives suggestions). */
  prevType: ComponentType | null;
  /** e.g. "הוספה אחרי: טקסט". */
  contextLabel: string;
  components: PageComponent[];
  isHome: boolean;
  iconFor: (type: ComponentType) => React.ReactNode;
  onPick: (type: PickerType) => void;
  /** Insert several components at once. */
  onPickTemplate: (template: ComponentTemplate) => void;
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
  const recent = useSyncExternalStore(subscribeRecent, readRecent);
  const userTemplates = useUserTemplates();
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
  const quickTemplates = suggestTemplates(prevType, components, isHome);
  const reason = (t: PickerType) => lockReason(componentOf(t), components, isHome);
  const results = useMemo(() => searchCatalog(query), [query]);

  // Focus: first open tile in the quick bar, search box once expanded.
  // A persistent bar never grabs focus by itself (it renders on page load).
  const didExpand = useRef(false);
  useEffect(() => {
    const winX = window.scrollX;
    const winY = window.scrollY;
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
    // Focus can still move the window in some browsers; keep the shell pinned.
    if (window.scrollX !== winX || window.scrollY !== winY) {
      window.scrollTo(winX, winY);
    }
  }, [expanded, persistent]);

  // When the full menu opens, nudge the main pane so more of the picker is visible.
  // Always clamp to the content's max scroll — never use scrollIntoView (it can
  // scroll the window and leave blank space below the app shell).
  useLayoutEffect(() => {
    const el = rootRef.current;
    const scrollRoot = document.querySelector<HTMLElement>("[data-course-main-scroll]");
    if (!el || !scrollRoot) return;

    const clampScroll = () => {
      const maxScroll = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
      if (scrollRoot.scrollTop > maxScroll) scrollRoot.scrollTop = maxScroll;
    };

    if (!expanded) {
      // Collapse shortens the page; pull scroll back if we were past the new end.
      const id = requestAnimationFrame(clampScroll);
      return () => cancelAnimationFrame(id);
    }

    const winX = window.scrollX;
    const winY = window.scrollY;
    const id = requestAnimationFrame(() => {
      const maxScroll = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
      const rootRect = scrollRoot.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const need = elRect.bottom - rootRect.bottom + 8;
      if (need > 0) {
        const top = Math.min(maxScroll, scrollRoot.scrollTop + need);
        if (top > scrollRoot.scrollTop) {
          scrollRoot.scrollTo({ top, behavior: "smooth" });
        }
      }
      // Keep the outer window pinned — nested scrollIntoView/focus can move it.
      if (window.scrollX !== winX || window.scrollY !== winY) {
        window.scrollTo(winX, winY);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

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

  // Keep the keyboard-highlighted row in view inside the results pane only.
  useEffect(() => {
    const row = rootRef.current?.querySelector<HTMLElement>("[data-active='true']");
    const pane = row?.closest<HTMLElement>("[data-picker-results]");
    if (!row || !pane) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    if (rowTop < pane.scrollTop) pane.scrollTop = rowTop;
    else if (rowBottom > pane.scrollTop + pane.clientHeight) {
      pane.scrollTop = rowBottom - pane.clientHeight;
    }
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
        className={`${tileBtn} ${r ? tileBtnLocked : tileBtnOk}`}
      >
        {r && <LockIcon className="absolute end-1.5 top-1.5 h-3 w-3 text-surface-500" />}
        <TypeIcon item={item} iconFor={iconFor} />
        <span className="w-full truncate text-surface-800">{item.label}</span>
      </button>
    );
  };

  /** Fixed-width tile, same look as the quick bar. */
  const tileSlot = (t: PickerType) => (
    <div key={t} className="w-[84px] shrink-0">
      {tile(t)}
    </div>
  );

  const templateCard = (template: ComponentTemplate) => {
    const r = templateLockReason(template, components, isHome);
    return (
      <button
        key={template.id}
        type="button"
        aria-disabled={r ? true : undefined}
        title={r ?? undefined}
        onClick={() => (r ? setMessage(r) : onPickTemplate(template))}
        className={`flex min-w-0 flex-col gap-2 rounded-control border border-surface-200 bg-white p-2.5 text-start transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6CBF] ${
          r ? "cursor-not-allowed opacity-45" : "hover:border-[#0F6CBF] hover:bg-surface-50"
        }`}
      >
        <span className="flex flex-col gap-[3px] rounded-control bg-surface-50 p-1.5" aria-hidden>
          {template.types.map((t, i) => (
            <i
              key={i}
              className="block h-[9px] rounded-timeline"
              style={{ background: `color-mix(in srgb, ${catColor(catalogItem(t).category)} 45%, white)` }}
            />
          ))}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-surface-900">
          {template.label}
          {r && <LockIcon className="h-3 w-3 text-surface-500" />}
        </span>
        <small className="text-[11.5px] leading-snug text-surface-500">{r ?? template.description}</small>
      </button>
    );
  };

  async function renameTemplate(template: ComponentTemplate) {
    const next = window.prompt("שם חדש לתבנית", template.label)?.trim();
    if (!next || next === template.label) return;
    if (isTemplateNameTaken(next, template.id)) {
      setMessage("כבר יש לך תבנית בשם הזה");
      return;
    }
    try {
      await renameUserTemplate(template.id, next);
    } catch (e) {
      setMessage(e instanceof DuplicateTemplateNameError ? e.message : "שינוי השם נכשל");
    }
  }

  async function removeTemplate(template: ComponentTemplate) {
    if (!window.confirm(`למחוק את התבנית "${template.label}"? לא ניתן לשחזר אותה.`)) return;
    try {
      await deleteUserTemplate(template.id);
    } catch {
      setMessage("מחיקת התבנית נכשלה");
    }
  }

  const templateAction =
    "rounded-control bg-white/90 p-1 text-surface-500 shadow-sm transition-colors duration-fast hover:bg-surface-100 hover:text-surface-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6CBF]";

  /** User template: the same card plus rename / delete (siblings, not nested buttons). */
  const userTemplateCard = (template: ComponentTemplate) => (
    <div key={template.id} className="group/tpl relative flex min-w-0 flex-col">
      {templateCard(template)}
      <div className="absolute top-1.5 end-1.5 flex gap-0.5 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/tpl:opacity-100">
        <button
          type="button"
          title="שינוי שם"
          aria-label={`שינוי שם התבנית ${template.label}`}
          onClick={() => void renameTemplate(template)}
          className={templateAction}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="מחיקה"
          aria-label={`מחיקת התבנית ${template.label}`}
          onClick={() => void removeTemplate(template)}
          className={templateAction}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2";
  const subHeading = "mb-1.5 text-[11.5px] font-semibold text-surface-500";
  const mine = userTemplates.templates;

  /**
   * "My templates" above the built-in ones. `showEmptyHint` explains how to make one
   * (templates tab only, so For You stays compact).
   */
  const templateSections = (showEmptyHint: boolean) => (
    <div className="flex flex-col gap-3">
      {(mine.length > 0 || showEmptyHint) && (
        <div>
          <div className={subHeading}>התבניות שלי</div>
          {mine.length > 0 ? (
            <div className={gridClass}>{mine.map(userTemplateCard)}</div>
          ) : (
            <p className="text-xs text-surface-500">
              {userTemplates.status === "loading"
                ? "טוען…"
                : userTemplates.status === "error"
                  ? "לא הצלחנו לטעון את התבניות שלך"
                  : "עדיין אין לך תבניות. בנו עמוד ולחצו על שמירת העמוד כתבנית בכותרת העמוד."}
            </p>
          )}
        </div>
      )}
      <div>
        {(mine.length > 0 || showEmptyHint) && <div className={subHeading}>תבניות מוכנות</div>}
        <div className={gridClass}>{TEMPLATES.map(templateCard)}</div>
      </div>
    </div>
  );

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
        className={`flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-start transition-colors duration-fast ${
          isActive ? "bg-surface-100" : "hover:bg-surface-50"
        } ${r ? "cursor-not-allowed opacity-45" : ""}`}
      >
        <TypeIcon item={item} iconFor={iconFor} />
        <span className="flex min-w-0 flex-col leading-snug">
          <span className="text-sm text-surface-900">
            {item.label}
            {index === 0 && (
              <span className="ms-1.5 rounded-control bg-surface-100 px-1.5 text-[10.5px] font-semibold text-[#0F6CBF]">
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
      <div className="mx-1 mb-1 mt-3 flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-surface-500 first:mt-0.5">
        <span className="h-2 w-2 rounded-timeline" style={{ background: c.color }} />
        {c.label}
        {id === "social" || id === "quiz" ? (
          <span className="inline-flex items-center gap-1 font-normal">
            · <LockIcon className="h-3 w-3" /> סוג פעילות אחד לעמוד
          </span>
        ) : null}
      </div>
    );
  };

  // `relative` gives the sr-only live regions (position: absolute) a containing block;
  // without it they escape the shell's clip and stretch the document's scroll height.
  const shell =
    "relative my-2 overflow-hidden rounded-control border border-surface-200 bg-white";

  if (!expanded) {
    const quickRecent = recent.slice(0, QUICK_RECENT_MAX);
    const common = POPULAR.filter((t) => !quickRecent.includes(t));
    const fit = quickWidth
      ? fitQuickBar(quickWidth, quickTemplates.length, quickRecent.length, common.length)
      : { recent: 0, popular: 0, tileWidth: 84 };
    // Template tile: same box as a component tile, with a mini block stack as its icon.
    const templateSlot = (template: ComponentTemplate) => {
      const r = templateLockReason(template, components, isHome);
      return (
        <div key={template.id} className="shrink-0" style={{ width: fit.tileWidth }}>
          <button
            type="button"
            data-pick={template.id}
            aria-disabled={r ? true : undefined}
            title={r ?? template.description}
            onClick={() => (r ? setMessage(r) : onPickTemplate(template))}
            className={`${tileBtn} ${r ? tileBtnLocked : tileBtnOk}`}
          >
            {r && <LockIcon className="absolute end-1.5 top-1.5 h-3 w-3 text-surface-500" />}
            <span
              aria-hidden
              className="flex h-[34px] w-[42px] shrink-0 flex-col gap-[2px] rounded-control bg-surface-50 p-[4px]"
            >
              {template.types.map((t, i) => (
                <i
                  key={i}
                  className="block flex-1 rounded-timeline"
                  style={{ background: `color-mix(in srgb, ${catColor(catalogItem(t).category)} 55%, white)` }}
                />
              ))}
            </span>
            <span className="w-full truncate text-surface-800">{template.label}</span>
          </button>
        </div>
      );
    };
    const slot = (t: PickerType) => (
      <div key={t} className="shrink-0" style={{ width: fit.tileWidth }}>
        {tile(t)}
      </div>
    );
    return (
      <div ref={rootRef} dir="rtl" role="dialog" aria-label="הוספה מהירה" onKeyDown={onKeyDown} className={shell}>
        <div ref={quickRowRef} className="flex justify-center gap-x-3 overflow-hidden px-2 pb-1 pt-2">
          {/* RTL: first in DOM sits on the right — recent, then popular, templates visual-left. */}
          {fit.recent > 0 && (
            <>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1 truncate px-1.5 text-[11.5px] text-surface-500">
                  <ClockIcon />
                  בשימוש לאחרונה
                </span>
                <div className="flex gap-0.5">{quickRecent.slice(0, fit.recent).map(slot)}</div>
              </div>
              <span className="w-px shrink-0 self-stretch bg-surface-200" aria-hidden />
            </>
          )}
          {fit.popular > 0 && (
            <>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1 truncate px-1.5 text-[11.5px] text-surface-500">
                  <SparkIcon />
                  הנפוצים ביותר
                </span>
                <div className="flex gap-0.5">{common.slice(0, fit.popular).map(slot)}</div>
              </div>
              <span className="w-px shrink-0 self-stretch bg-surface-200" aria-hidden />
            </>
          )}
          <div className="flex shrink-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 px-1.5 text-[11.5px] text-surface-500">
              <LayersIcon />
              {prevType ? `תבניות מומלצות אחרי ${typeLabel(prevType)}` : "תבניות לפתיחת עמוד"}
            </span>
            <div className="flex gap-0.5">{quickTemplates.map(templateSlot)}</div>
          </div>
        </div>
        <p aria-live="polite" className={message ? "px-3 pb-1.5 text-xs text-warning" : "sr-only"}>
          {message}
        </p>
        <button
          type="button"
          data-expand
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-2 border-t border-surface-200 bg-[#F8F9FA] px-3 py-2.5 text-[13px] font-medium text-[#0F6CBF] transition-colors duration-fast hover:bg-surface-100 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-[#0F6CBF]"
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
    { id: "templates", label: "תבניות", count: TEMPLATES.length + mine.length },
    ...CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      count: CATALOG.filter((i) => i.category === c.id).length,
    })),
  ];
  const shownCats = view === "all" ? CATEGORIES.map((c) => c.id) : [view as CategoryId];
  // For You: recommended + recent share one row; keep counts low so tiles stay readable.
  const homeSuggestions = suggestions.slice(0, 3);
  const homeRecent = recent.filter((t) => !homeSuggestions.includes(t)).slice(0, 3);

  return (
    <div
      ref={rootRef}
      dir="rtl"
      role="dialog"
      aria-label="הוספת רכיב"
      aria-description={contextLabel}
      onKeyDown={onKeyDown}
      className={shell}
    >
      {/* Sidebar full height; search + body sit beside it (visual left in RTL). */}
      <div className="grid h-[380px] grid-cols-[136px_minmax(0,1fr)] max-sm:h-auto max-sm:grid-cols-1">
        <nav
          aria-label="קטגוריות"
          className="flex flex-col gap-0.5 overflow-auto border-e border-surface-200 bg-[#F8F9FA] px-1.5 py-2 max-sm:flex-row max-sm:border-b max-sm:border-e-0"
        >
          {views.map((v) => {
            const selected = view === v.id;
            const cat = CATEGORIES.find((c) => c.id === v.id);
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setView(v.id);
                  setQuery("");
                  setActive(0);
                  setMessage("");
                }}
                className={`flex shrink-0 items-start justify-between gap-2 rounded-control px-2.5 py-2 text-start text-[13px] leading-snug transition-colors duration-fast ${
                  selected
                    ? "bg-[#0F6CBF] font-medium text-white"
                    : "text-surface-800 hover:bg-white hover:text-surface-900"
                }`}
              >
                <span className="flex min-w-0 items-start gap-1.5">
                  {cat && (
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-timeline ${selected ? "ring-1 ring-white/70" : ""}`}
                      style={{ background: cat.color }}
                      aria-hidden
                    />
                  )}
                  <span className="whitespace-normal break-words">{v.label}</span>
                </span>
                {v.count !== undefined && (
                  <span
                    className={`mt-0.5 shrink-0 text-[11px] font-normal ${selected ? "text-white/80" : "text-surface-500"}`}
                  >
                    {v.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-col gap-1.5 p-2.5 pb-2">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-surface-200 bg-white px-2.5 py-1.5 text-surface-500 focus-within:border-[#0F6CBF]">
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
                  className="w-full min-w-0 border-0 bg-transparent text-sm text-surface-900 outline-none"
                />
              </label>
              {persistent && (
                <button
                  type="button"
                  onClick={collapse}
                  title="חזרה לתפריט המהיר"
                  aria-label="חזרה לתפריט המהיר"
                  className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1.5 text-xs font-medium text-[#0F6CBF] transition-colors duration-fast hover:bg-surface-100"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5 rotate-180" />
                  חזרה
                </button>
              )}
            </div>
            <p aria-live="polite" className={message ? "px-0.5 text-xs text-warning" : "sr-only"}>
              {message}
            </p>
          </div>

          <div
            data-picker-results
            className="min-h-0 flex-1 overflow-auto px-2.5 pb-2 max-sm:max-h-[300px]"
          >
            {query.trim() ? (
              results.length ? (
                <div className="flex flex-col gap-0.5">{results.map(row)}</div>
              ) : (
                <p className="p-5 text-center text-sm text-surface-500">
                  לא נמצא רכיב בשם {query.trim()}. נסו מילה אחרת או עיינו בקטגוריות.
                </p>
              )
            ) : view === "home" ? (
              <div className="flex flex-col gap-4 px-0.5 py-1">
                <div className="flex gap-x-3 overflow-hidden">
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 px-1.5 text-xs font-semibold text-surface-500">
                      <SparkIcon />
                      {prevType ? `מומלץ אחרי ${typeLabel(prevType)}` : "מומלץ לפתיחת עמוד"}
                    </div>
                    <div className="flex gap-0.5">{homeSuggestions.map(tileSlot)}</div>
                  </div>
                  {homeRecent.length > 0 && (
                    <>
                      <span className="w-px shrink-0 self-stretch bg-surface-200" aria-hidden />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 truncate px-1.5 text-xs font-semibold text-surface-500">
                          <ClockIcon />
                          בשימוש לאחרונה
                        </div>
                        <div className="flex gap-0.5">{homeRecent.map(tileSlot)}</div>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-surface-500">
                    <LayersIcon />
                    תבניות (כמה רכיבים יחד)
                  </div>
                  {templateSections(false)}
                </div>
              </div>
            ) : view === "templates" ? (
              <div className="px-0.5 py-1">
                <p className="mb-2 text-xs text-surface-500">
                  כל תבנית מוסיפה כמה רכיבים יחד. שאלות ופעילויות נוספות לתחתית העמוד.
                </p>
                {templateSections(true)}
              </div>
            ) : view === "all" ? (
              // Categories flow inline and wrap only once a row is full.
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                {shownCats.map((id) => (
                  <div key={id} className="min-w-0">
                    {sectionHeader(id)}
                    <div className="grid grid-flow-col auto-cols-[84px] gap-0.5">
                      {CATALOG.filter((i) => i.category === id).map((i) => tile(i.type))}
                    </div>
                  </div>
                ))}
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
      </div>
    </div>
  );
}

function typeLabel(t: ComponentType): string {
  return componentLabel(t);
}

function TypeIcon({
  item,
  iconFor,
  small,
}: {
  item: CatalogItem;
  iconFor: (type: ComponentType) => React.ReactNode;
  small?: boolean;
}) {
  const color = catColor(item.category);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${small ? "h-6 w-6 rounded-control" : "h-[34px] w-[34px] rounded-control"}`}
      style={{ color, background: `color-mix(in srgb, ${color} 14%, white)` }}
    >
      {iconFor(componentOf(item.type))}
    </span>
  );
}
