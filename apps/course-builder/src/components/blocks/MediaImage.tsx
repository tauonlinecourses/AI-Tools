import { useEffect, useRef, useState } from "react";
import {
  isSharePointUrl,
  sharePointEmbedUrl,
  sharePointImageSrc,
} from "../../lib/sharePoint";

export type MediaImageStatus = "loading" | "loaded" | "error";

interface Props {
  /** Original pasted URL (SharePoint copy link or direct image URL). */
  url: string;
  className?: string;
  alt?: string;
  onStatus?: (status: MediaImageStatus) => void;
}

type Phase = "img" | "iframe" | "error";

/**
 * Renders an image URL. For SharePoint `:i:` links, tries `download.aspx` in
 * an `<img>` first, then falls back to an `embed.aspx` iframe. Non-SharePoint
 * URLs use a plain `<img>`.
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
        onLoad={() => onStatusRef.current?.("loaded")}
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
      onLoad={() => onStatusRef.current?.("loaded")}
      onError={() => {
        if (embedSrc) setPhase("iframe");
        else setPhase("error");
      }}
      ref={(img) => {
        // Cached images may complete before onLoad is attached.
        if (img?.complete) {
          if (img.naturalWidth > 0) onStatusRef.current?.("loaded");
          else if (embedSrc) setPhase("iframe");
          else setPhase("error");
        }
      }}
    />
  );
}
