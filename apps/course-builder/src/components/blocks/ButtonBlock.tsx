import { useEffect, useState } from "react";
import { Button } from "@workspace/ui";
import type { ButtonAlign, ButtonBlockProps, CourseViewMode } from "../../lib/types";
import { MediaImage, type MediaImagePaint } from "./MediaImage";

interface Props {
  props: ButtonBlockProps;
  mode: CourseViewMode;
  onChange: (props: ButtonBlockProps) => void;
}

/** Physical L/C/R — independent of page RTL (wrapper is dir=ltr). */
function justifyClass(align: ButtonAlign): string {
  if (align === "left") return "justify-start";
  if (align === "right") return "justify-end";
  return "justify-center";
}

/**
 * Content button preview. Alignment, link, and optional image URL are edited
 * from the card header popovers in PageContent (edit mode only); label is not
 * editable (fixed "כפתור" unless imported `text` is set). When `imageUrl`
 * paints, the image replaces the primary-button chrome. In implement, click
 * opens the image URL; in edit/review, click opens the button `url` when set.
 */
export function ButtonBlock({ props, mode }: Props) {
  const align: ButtonAlign = props.align ?? "center";
  const label = props.text?.trim() || "כפתור";
  const href = props.url?.trim() || undefined;
  const imageHref = props.imageUrl?.trim() || undefined;
  const imageClickHref =
    mode === "implement" ? imageHref : href;
  const [imgStatus, setImgStatus] = useState<"none" | "loading" | "loaded" | "error">(
    imageHref ? "loading" : "none"
  );
  const [paintVia, setPaintVia] = useState<MediaImagePaint["via"] | null>(null);

  useEffect(() => {
    setImgStatus(imageHref ? "loading" : "none");
    setPaintVia(null);
  }, [imageHref]);

  const showImage = imgStatus === "loaded" && paintVia !== null;

  const media = imageHref ? (
    <MediaImage
      url={imageHref}
      alt={label}
      className={
        showImage
          ? "max-h-[48px] w-auto h-auto block"
          : "hidden"
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

  const body = showImage ? (
    media
  ) : (
    <>
      {media}
      <Button
        type="button"
        variant="primary"
        size="md"
        tabIndex={href ? 0 : -1}
        title={href ? "פתח קישור" : undefined}
        className={href ? undefined : "cursor-default"}
        onClick={
          href
            ? () => {
                window.open(href, "_blank", "noopener,noreferrer");
              }
            : undefined
        }
      >
        {label}
      </Button>
    </>
  );

  return (
    <div className={`flex w-full ${justifyClass(align)}`} dir="ltr">
      {showImage && imageClickHref ? (
        <a
          href={imageClickHref}
          target="_blank"
          rel="noreferrer"
          title={mode === "implement" ? "פתח תמונה" : "פתח קישור"}
          className="inline-block max-w-full hover:opacity-90 transition-opacity duration-fast"
        >
          {body}
        </a>
      ) : showImage ? (
        <div className="inline-block max-w-full">{body}</div>
      ) : (
        body
      )}
    </div>
  );
}
