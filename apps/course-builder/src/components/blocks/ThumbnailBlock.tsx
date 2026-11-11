import type { CourseViewMode, ImageProps } from "../../lib/types";
import { useEffect, useState } from "react";
import { MediaImage, type MediaImagePaint } from "./MediaImage";

interface Props {
  props: ImageProps;
  mode: CourseViewMode;
  onChange: (props: ImageProps) => void;
  /** Page title used for the default placeholder label. */
  pageTitle: string;
  /** 1-based index among image components on this page (by current order). */
  imageNumber: number;
}

function defaultImageLabel(pageTitle: string, imageNumber: number): string {
  return `${pageTitle.trim() || "ללא כותרת"} | תמונה מספר ${imageNumber}`;
}

export function ImageBlock({ props, mode, pageTitle, imageNumber }: Props) {
  const imageHref = props.imageUrl?.trim() || undefined;
  const label = defaultImageLabel(pageTitle, imageNumber);
  const [imgStatus, setImgStatus] = useState<"none" | "loading" | "loaded" | "error">(
    imageHref ? "loading" : "none"
  );
  const [paintVia, setPaintVia] = useState<MediaImagePaint["via"] | null>(null);
  const openOnClick = mode !== "review";

  useEffect(() => {
    setImgStatus(imageHref ? "loading" : "none");
    setPaintVia(null);
  }, [imageHref]);

  const naturalImage = imgStatus === "loaded" && paintVia === "img";
  const framedPaint = imgStatus === "loaded" && paintVia === "iframe";
  const imageShowing = naturalImage || framedPaint;
  const showTitle = !imageShowing;
  const showNoFile = imgStatus === "none" || imgStatus === "error";

  const labelEl = showTitle ? (
    <div className="flex flex-col items-center justify-center gap-6 max-w-2xl">
      <p className="text-surface-700 text-xl sm:text-2xl font-semibold text-center">
        {label}
      </p>
      {showNoFile && (
        <p className="text-sm sm:text-base text-surface-500 font-medium">ללא קובץ</p>
      )}
    </div>
  ) : null;

  const media = imageHref ? (
    <MediaImage
      url={imageHref}
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
          setImgStatus("loaded");
        } else if (status === "error") {
          setPaintVia(null);
          setImgStatus("error");
        } else {
          setPaintVia(null);
          setImgStatus("loading");
        }
      }}
    />
  ) : null;

  // Natural img: height follows the image. Otherwise grey aspect-video placeholder /
  // framed iframe. Always `block` so <a> keeps aspect-ratio height.
  const frameClass = naturalImage
    ? "relative block w-full overflow-hidden select-none"
    : `relative block aspect-video w-full overflow-hidden select-none ${
        framedPaint ? "" : "bg-[#E8EAED]"
      }`;

  if (imageHref && openOnClick) {
    return (
      <a
        href={imageHref}
        target="_blank"
        rel="noreferrer"
        className={`${frameClass} ${
          naturalImage
            ? "cursor-pointer hover:opacity-90 transition-opacity duration-fast"
            : "cursor-pointer hover:bg-black/10 transition-colors duration-fast"
        }`}
        title="פתח תמונה"
      >
        {media}
        {showTitle && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
            {labelEl}
          </div>
        )}
      </a>
    );
  }

  return (
    <div className={frameClass}>
      {media}
      {showTitle && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          {labelEl}
        </div>
      )}
    </div>
  );
}
