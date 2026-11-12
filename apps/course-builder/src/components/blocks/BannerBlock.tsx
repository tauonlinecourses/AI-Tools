import { useEffect, useState } from "react";
import type { BannerProps, CourseViewMode } from "../../lib/types";
import { MediaImage, type MediaImagePaint } from "./MediaImage";

interface Props {
  props: BannerProps;
  mode: CourseViewMode;
  onChange: (props: BannerProps) => void;
  /** Page title used for the default banner name (`באנר - {page}`). */
  pageTitle: string;
}

function defaultBannerLabel(pageTitle: string): string {
  const title = pageTitle.trim() || "ללא כותרת";
  return `באנר - ${title}`;
}

function BannerPlaceholder({
  label,
  imageUrl,
  openOnClick = true,
}: {
  label: string;
  imageUrl?: string;
  /** When false (preview), the image is not wrapped in a link. */
  openOnClick?: boolean;
}) {
  const src = imageUrl?.trim() || undefined;
  const [imageStatus, setImageStatus] = useState<"none" | "loading" | "loaded" | "error">(
    src ? "loading" : "none"
  );
  const [paintVia, setPaintVia] = useState<MediaImagePaint["via"] | null>(null);

  useEffect(() => {
    setImageStatus(src ? "loading" : "none");
    setPaintVia(null);
  }, [src]);

  // Natural-size layout only for real <img> paints. Iframe / failed URLs keep 4:1.
  const naturalImage = imageStatus === "loaded" && paintVia === "img";
  const framedPaint = imageStatus === "loaded" && paintVia === "iframe";
  const imageShowing = naturalImage || framedPaint;
  // Name + "ללא קובץ" only when there is no painted image.
  const showTitle = !imageShowing;
  const showNoFile = imageStatus === "none" || imageStatus === "error";

  const labelEl = showTitle ? (
    <div className="flex flex-col items-center gap-2 max-w-2xl">
      <p className="text-xl sm:text-2xl font-semibold text-center text-surface-700">
        {label}
      </p>
      {showNoFile && (
        <p className="text-sm sm:text-base font-medium text-surface-500">ללא קובץ</p>
      )}
    </div>
  ) : null;

  const image = src ? (
    <MediaImage
      url={src}
      className={
        naturalImage
          ? "w-full h-auto block"
          : `absolute inset-0 w-full h-full object-contain ${
              framedPaint ? "" : "invisible"
            }`
      }
      onStatus={(status, paint) => {
        if (status === "loaded") {
          setPaintVia(paint?.via ?? "img");
          setImageStatus("loaded");
        } else if (status === "error") {
          setPaintVia(null);
          setImageStatus("error");
        } else {
          setPaintVia(null);
          setImageStatus("loading");
        }
      }}
    />
  ) : null;

  // Natural img: height follows the image. Otherwise fixed 4:1 (grey when not painted).
  // Always `block` so <a> gets aspect-ratio height (inline anchors collapse to 0).
  const frameClass = naturalImage
    ? "relative block w-full overflow-hidden select-none"
    : `relative block aspect-[4/1] w-full overflow-hidden select-none ${
        framedPaint ? "" : "bg-[#E8EAED]"
      }`;

  if (src && openOnClick) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className={`${frameClass} ${
          naturalImage
            ? "cursor-pointer hover:opacity-90 transition-opacity duration-fast"
            : "cursor-pointer hover:bg-black/10 transition-colors duration-fast"
        }`}
        title="פתח תמונת באנר"
      >
        {image}
        {showTitle && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            {labelEl}
          </div>
        )}
      </a>
    );
  }

  return (
    <div className={frameClass}>
      {image}
      {showTitle && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          {labelEl}
        </div>
      )}
    </div>
  );
}

export function BannerBlock({
  props,
  mode,
  pageTitle,
}: Props) {
  // Always use the derived default name — no custom title field in the UI.
  const label = defaultBannerLabel(pageTitle);
  const editable = mode === "edit";

  if (!editable) {
    return (
      <BannerPlaceholder
        label={label}
        imageUrl={props.imageUrl}
        openOnClick={mode !== "review"}
      />
    );
  }

  return <BannerPlaceholder label={label} imageUrl={props.imageUrl} />;
}
