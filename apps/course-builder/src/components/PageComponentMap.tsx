import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, PageComponent } from "../lib/types";
import { PAGE_TYPE_LABEL, PAGE_TYPE_LOGO } from "../lib/types";
import {
  BannerIcon,
  ButtonIcon,
  InteractiveUnitIcon,
  QuestionIcon,
  TextIcon,
  TextUnitIcon,
  ThumbnailIcon,
  VideoIcon,
} from "./icons";

const TYPE_LABEL: Record<ComponentType, string> = {
  banner: "באנר",
  video: "וידאו",
  interactive_video: "וידאו אינטרקטיבי",
  text: "טקסט",
  question: "שאלה",
  image: "תמונה",
  text_unit: "יחידת טקסט",
  interactive_unit: "יחידה אינטראקטיבית",
  button: "כפתור",
  notes_board: PAGE_TYPE_LABEL.notes_board,
  word_cloud: PAGE_TYPE_LABEL.word_cloud,
  forum: PAGE_TYPE_LABEL.forum,
};

function MapIcon({ type }: { type: ComponentType }) {
  const cls = "w-3.5 h-3.5";
  switch (type) {
    case "banner":
      return <BannerIcon className={cls} />;
    case "video":
    case "interactive_video":
      return <VideoIcon className={cls} />;
    case "text":
      return <TextIcon className={cls} />;
    case "question":
      return <QuestionIcon className={cls} />;
    case "image":
      return <ThumbnailIcon className={cls} />;
    case "text_unit":
      return <TextUnitIcon className={cls} />;
    case "interactive_unit":
      return <InteractiveUnitIcon className={cls} />;
    case "button":
      return <ButtonIcon className={cls} />;
    case "notes_board":
    case "word_cloud":
    case "forum":
      return (
        <img
          src={PAGE_TYPE_LOGO[type]}
          alt=""
          className={`${cls} object-contain`}
        />
      );
  }
}

interface Props {
  components: PageComponent[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/** Sticky icon-only outline of page components (order = page order). */
export function PageComponentMap({ components, activeId, onSelect }: Props) {
  const navRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pill, setPill] = useState<{ top: number; ready: boolean }>({
    top: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!activeId) {
      setPill((prev) => ({ ...prev, ready: false }));
      return;
    }
    const nav = navRef.current;
    const button = buttonRefs.current.get(activeId);
    if (!nav || !button) {
      setPill((prev) => ({ ...prev, ready: false }));
      return;
    }

    setPill({
      top: button.offsetTop,
      ready: true,
    });

    // Keep the active icon visible inside a tall overflowing map.
    const buttonTop = button.offsetTop;
    const buttonBottom = buttonTop + button.offsetHeight;
    if (buttonTop < nav.scrollTop) {
      nav.scrollTo({ top: Math.max(0, buttonTop - 8), behavior: "smooth" });
    } else if (buttonBottom > nav.scrollTop + nav.clientHeight) {
      nav.scrollTo({
        top: buttonBottom - nav.clientHeight + 8,
        behavior: "smooth",
      });
    }
  }, [activeId, components]);

  if (components.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label="מפת רכיבי העמוד"
      className="relative sticky top-20 z-20 self-start flex flex-col items-center gap-0.5 w-9 max-h-[calc(100vh-7rem)] overflow-y-auto py-1.5 rounded-lg border border-surface-200 bg-white/90 shadow-sm backdrop-blur-sm"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute left-1/2 z-0 w-7 h-7 rounded-md bg-surface-100 ring-1 ring-surface-300 transition-[transform,opacity] duration-300 ease-out ${
          pill.ready ? "opacity-100" : "opacity-0"
        }`}
        style={{
          top: 0,
          transform: `translate(-50%, ${pill.top}px)`,
        }}
      />
      {components.map((component) => {
        const label = TYPE_LABEL[component.type] ?? component.type;
        const active = activeId === component.id;
        return (
          <button
            key={component.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(component.id, el);
              else buttonRefs.current.delete(component.id);
            }}
            type="button"
            title={label}
            aria-label={label}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(component.id)}
            className={`relative z-[1] flex items-center justify-center w-7 h-7 rounded-md transition-[color,opacity] duration-300 ease-out ${
              active
                ? "text-surface-900 opacity-100"
                : "text-surface-400 opacity-55 hover:opacity-100 hover:text-surface-800"
            }`}
          >
            <MapIcon type={component.type} />
          </button>
        );
      })}
    </nav>
  );
}
