import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Badge, Spinner } from "@workspace/ui";
import { toolIsOpenable, type Tool } from "../tools.config";
import { ui, localizeTool, type Locale } from "../i18n";
import { handoffToTool, prefetchToolHandoff } from "../lib/openTool";
import { placePopover } from "../lib/placePopover";
import { ToolIcon } from "./ToolIcon";
import { ToolInfoCard } from "./ToolInfoCard";

const OPEN_DELAY_MS = 350;
const CLOSE_DELAY_MS = 150;
/** Hover this long before pre-minting a handoff (skip quick mouse sweeps). */
const PREFETCH_DELAY_MS = 150;

export function ToolCard({
  tool,
  locale,
  allowed,
  teamNames,
}: {
  tool: Tool;
  locale: Locale;
  allowed: boolean;
  teamNames: string[];
}) {
  const navigate = useNavigate();
  const isComingSoon = tool.status === "coming-soon";
  const isAllowed = allowed;
  const isClickable = toolIsOpenable(tool) && isAllowed;
  const copy = localizeTool(locale, tool);
  const t = ui[locale];
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deniedTooltip = !isComingSoon && !isAllowed ? t.noPermission : undefined;

  const infoId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const schedule = useCallback((open: boolean) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setInfoOpen(open),
      open ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
    );
  }, []);
  const keepOpen = useCallback(() => window.clearTimeout(timer.current), []);

  const prefetchTimer = useRef<number | undefined>(undefined);
  const schedulePrefetch = useCallback(
    (start: boolean) => {
      window.clearTimeout(prefetchTimer.current);
      if (!start || !isClickable || tool.hubPath) return;
      prefetchTimer.current = window.setTimeout(
        () => void prefetchToolHandoff(tool),
        PREFETCH_DELAY_MS,
      );
    },
    [isClickable, tool],
  );

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(prefetchTimer.current);
    },
    [],
  );

  // Position once the card has rendered and we know its height.
  useLayoutEffect(() => {
    if (!infoOpen) {
      setPos(null);
      return;
    }
    const card = cardRef.current;
    const info = infoRef.current;
    if (!card || !info) return;
    const r = card.getBoundingClientRect();
    const p = placePopover(
      { top: r.top, left: r.left, width: r.width, height: r.height },
      { width: info.offsetWidth, height: info.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      t.dir,
    );
    setPos({ top: p.top, left: p.left });
  }, [infoOpen, t.dir]);

  // The card is fixed-position, so close it when the page moves under it.
  useEffect(() => {
    if (!infoOpen) return;
    const close = () => {
      window.clearTimeout(timer.current);
      setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  async function openTool() {
    if (!isClickable || opening) return;
    setError(null);
    setOpening(true);
    try {
      // Hub-hosted tools share PlatformAuth — navigate in-app, no handoff.
      if (tool.hubPath) {
        navigate(tool.hubPath);
        return;
      }
      const target = await handoffToTool(tool);
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open tool");
      setOpening(false);
    }
  }

  return (
    <>
      <div
        ref={cardRef}
        className={[
          "group relative bg-white border border-surface-200 p-5",
          "flex flex-col gap-3",
          "transition-colors duration-fast",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-900",
          isClickable
            ? "hover:bg-surface-50 hover:border-surface-900 cursor-pointer"
            : "opacity-60 cursor-not-allowed",
        ].join(" ")}
        aria-disabled={!isClickable}
        aria-label={
          deniedTooltip ? `${copy.name}. ${deniedTooltip}` : undefined
        }
        aria-describedby={infoOpen ? infoId : undefined}
        onClick={() => void openTool()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void openTool();
          }
        }}
        onMouseEnter={() => {
          schedule(true);
          schedulePrefetch(true);
        }}
        onMouseLeave={() => {
          schedule(false);
          schedulePrefetch(false);
        }}
        onFocus={() => {
          schedule(true);
          schedulePrefetch(true);
        }}
        onBlur={() => {
          schedule(false);
          schedulePrefetch(false);
        }}
        role={isClickable ? "link" : undefined}
        // Every card is focusable so keyboard users can read its info card.
        tabIndex={0}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-lg font-semibold text-surface-900 truncate">
              {copy.name}
            </h3>
            {isComingSoon && (
              <Badge variant="default" size="sm">{t.comingSoon}</Badge>
            )}
            {opening && <Spinner size="sm" />}
          </div>
          <ToolIcon name={tool.icon} />
        </div>
        <p className="text-sm text-surface-500 leading-relaxed">
          {copy.description}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {infoOpen &&
        createPortal(
          <ToolInfoCard
            ref={infoRef}
            id={infoId}
            tool={tool}
            locale={locale}
            allowed={isAllowed}
            teamNames={teamNames}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              opacity: pos ? 1 : 0,
            }}
            onMouseEnter={keepOpen}
            onMouseLeave={() => schedule(false)}
          />,
          document.body,
        )}
    </>
  );
}
