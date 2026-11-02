import type { ComponentType, CourseViewMode, TextUnitProps } from "../../lib/types";
import { useEffect, useState } from "react";
import { resolveInteractiveEmbedSrc } from "../../lib/interactiveEmbed";
import { MediaImage } from "./MediaImage";

type LinkUnitType = Extract<ComponentType, "text_unit" | "interactive_unit">;

interface Props {
  props: TextUnitProps;
  mode: CourseViewMode;
  onChange: (props: TextUnitProps) => void;
  /** Page title used for the default placeholder label. */
  pageTitle: string;
  /** 1-based index among this unit type on the page. */
  unitNumber: number;
  /** Which link-unit variant — drives the placeholder name. */
  unitType: LinkUnitType;
}

const UNIT_LABEL: Record<LinkUnitType, string> = {
  text_unit: "יחידת טקסט",
  interactive_unit: "יחידה אינטראקטיבית",
};

function defaultUnitLabel(
  pageTitle: string,
  unitType: LinkUnitType,
  unitNumber: number
): string {
  return `${pageTitle.trim() || "ללא כותרת"} | ${UNIT_LABEL[unitType]} מספר ${unitNumber}`;
}

function UnitPlaceholder({
  label,
  hasImageUrl,
  hasFileUrl,
}: {
  label: string;
  hasImageUrl: boolean;
  hasFileUrl: boolean;
}) {
  return (
    <div className="relative aspect-video w-full bg-[#E8EAED] overflow-hidden select-none">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-surface-700 text-xl sm:text-2xl font-semibold text-center max-w-2xl">
          {label}
        </p>
        {!hasImageUrl && (
          <p className="text-sm sm:text-base text-surface-500 font-medium">ללא תמונה</p>
        )}
        {!hasFileUrl && (
          <p className="text-sm sm:text-base text-surface-500 font-medium">ללא קובץ</p>
        )}
      </div>
    </div>
  );
}

function InteractiveEmbed({
  src,
  title,
  openHref,
}: {
  src: string;
  title: string;
  openHref?: string;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="relative aspect-video w-full overflow-hidden bg-[#E8EAED]">
        <iframe
          src={src}
          title={title}
          className="absolute inset-0 w-full h-full border-0"
          allow="fullscreen; clipboard-write; autoplay"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {openHref && (
        <a
          href={openHref}
          target="_blank"
          rel="noreferrer"
          className="self-start text-sm font-medium text-surface-600 hover:text-surface-900 underline-offset-2 hover:underline"
          dir="rtl"
        >
          פתח בחלון חדש
        </a>
      )}
    </div>
  );
}

/**
 * Link thumbnail unit (יחידת טקסט / יחידה אינטראקטיבית):
 * - text_unit: shows `imageUrl`; click opens `fileUrl` when set.
 * - interactive_unit: prefers clickable thumbnail when `imageUrl` is set
 *   (הפניה / ציר זמן); otherwise embeds Genially/Canva/… from `fileUrl`.
 */
export function TextUnitBlock({
  props,
  pageTitle,
  unitNumber,
  unitType,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const imageHref = props.imageUrl?.trim() || undefined;
  const fileHref = props.fileUrl?.trim() || undefined;
  const label = defaultUnitLabel(pageTitle, unitType, unitNumber);
  const embedSrc =
    unitType === "interactive_unit" ? resolveInteractiveEmbedSrc(fileHref) : null;

  useEffect(() => {
    setImgError(false);
  }, [imageHref]);

  const hasImage = !!imageHref && !imgError;

  // הפניה-style interactive: image thumbnail + external link (takes priority over iframe)
  if (hasImage) {
    const image = (
      <MediaImage
        url={imageHref}
        className="w-full aspect-video object-cover"
        onStatus={(status) => {
          if (status === "error") setImgError(true);
          else if (status === "loaded") setImgError(false);
        }}
      />
    );

    if (fileHref) {
      return (
        <a
          href={fileHref}
          target="_blank"
          rel="noreferrer"
          className="block w-full cursor-pointer hover:opacity-90 transition-opacity"
          title="פתח קישור"
        >
          {image}
        </a>
      );
    }

    return (
      <div className="relative w-full">
        {image}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-black/50 px-3 py-2">
          <p className="text-sm font-medium text-white/90">ללא קובץ</p>
        </div>
      </div>
    );
  }

  // Iframe-only Genially / Canva / … (no thumbnail image)
  if (embedSrc) {
    return (
      <InteractiveEmbed
        src={embedSrc}
        title={label}
        openHref={fileHref}
      />
    );
  }

  return (
    <UnitPlaceholder
      label={label}
      hasImageUrl={false}
      hasFileUrl={!!fileHref}
    />
  );
}
