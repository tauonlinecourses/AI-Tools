import { useEffect, useRef, useState } from "react";
import {
  isSharePointUrl,
  sharePointEmbedUrl,
  sharePointImageSrc,
} from "../../lib/sharePoint";

export type MediaImageStatus = "loading" | "loaded" | "error";

export type MediaImagePaint = {
  via: "img" | "iframe";
};

interface Props {
  /** Original pasted URL (SharePoint copy link or direct image URL). */
  url: string;
  className?: string;
  alt?: string;
  onStatus?: (status: MediaImageStatus, paint?: MediaImagePaint) => void;
}

type Phase = "img" | "iframe" | "error";

function imgHasPaintSize(img: HTMLImageElement): boolean {
  return img.naturalWidth > 0 && img.naturalHeight > 0;
}

/**
 * Renders an image URL. For SharePoint `:i:` links, tries `download.aspx` in
 * an `<img>` first, then falls back to an `embed.aspx` iframe. Non-SharePoint
 * URLs use a plain `<img>`.
 *
 * `"loaded"` for `<img>` requires positive natural dimensions; zero-size /
 * broken images report `"error"` (or fall back to SharePoint iframe). Iframe
 * fallback reports `"loaded"` with `{ via: "iframe" }` so callers can keep a
 * fixed aspect frame instead of collapsing with `h-auto`.
 */
export function MediaImage({ url, className, alt = "", onStatus }: Props) {
  const trimmed = url.trim();
  const isSp = isSharePointUrl(trimmed);
  const downloadSrc = isSp ? sharePointImageSrc(trimmed) : null;
  const embedSrc = isSp ? sharePointEmbedUrl(trimmed) : null;
  const directImgSrc = isSp ? downloadSrc : trimmed;

  const [phase, setPhase] = useState<Phase>(() =>
    directImgSrc ? "img" : embedSrc ? "iframe" : "error"
  );

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    setPhase(directImgSrc ? "img" : embedSrc ? "iframe" : "error");
  }, [trimmed, directImgSrc, embedSrc]);

  useEffect(() => {
    if (phase === "img" || phase === "iframe") onStatusRef.current?.("loading");
    else onStatusRef.current?.("error");
  }, [phase]);

  const failOrFallback = () => {
    if (embedSrc) setPhase("iframe");
    else setPhase("error");
  };

  if (phase === "error" || (!directImgSrc && !embedSrc)) {
    return null;
  }

  if (phase === "iframe" && embedSrc) {
    return (
      <iframe
        src={embedSrc}
        title={alt || "SharePoint image"}
        className={className}
        style={{ border: 0 }}
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => onStatusRef.current?.("loaded", { via: "iframe" })}
      />
    );
  }

  if (!directImgSrc) return null;

  return (
    <img
      key={directImgSrc}
      src={directImgSrc}
      alt={alt}
      className={className}
      onLoad={(event) => {
        if (imgHasPaintSize(event.currentTarget)) {
          onStatusRef.current?.("loaded", { via: "img" });
        } else {
          failOrFallback();
        }
      }}
      onError={failOrFallback}
      ref={(img) => {
        // Cached images may complete before onLoad is attached.
        if (!img?.complete) return;
        if (imgHasPaintSize(img)) onStatusRef.current?.("loaded", { via: "img" });
        else failOrFallback();
      }}
    />
  );
}
