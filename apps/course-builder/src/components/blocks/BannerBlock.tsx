import { useEffect, useState } from "react";
import type { BannerProps, CourseViewMode } from "../../lib/types";

interface Props {
  props: BannerProps;
  mode: CourseViewMode;
  onChange: (props: BannerProps) => void;
  /** Page title used for the default banner name (`באנר - {numbering} | {page}`). */
  pageTitle: string;
  /** Page numbering string (e.g. `1.1`) for the default banner name. */
  pageNumbering: string;
}

function defaultBannerLabel(pageTitle: string, pageNumbering: string): string {
  const num = pageNumbering.trim() || "?";
  const title = pageTitle.trim() || "ללא כותרת";
  return `באנר - ${num} | ${title}`;
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

  useEffect(() => {
    setImageStatus(src ? "loading" : "none");
  }, [src]);

  const imageShowing = imageStatus === "loaded";
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

  const bodyClass = "absolute inset-0 flex items-center justify-center px-6";

  return (
    <div className="relative aspect-[4/1] w-full overflow-hidden select-none bg-[#E8EAED]">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-contain ${
            imageShowing ? "" : "invisible"
          }`}
          onLoad={() => setImageStatus("loaded")}
          onError={() => setImageStatus("error")}
          ref={(img) => {
            // Cached images may complete before onLoad is attached.
            if (img?.complete) {
              if (img.naturalWidth > 0) setImageStatus("loaded");
              else setImageStatus("error");
            }
          }}
        />
      )}

      {src && openOnClick ? (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className={`${bodyClass} cursor-pointer hover:bg-black/10 transition-colors duration-fast`}
          title="פתח תמונת באנר"
        >
          {labelEl}
        </a>
      ) : (
        <div className={bodyClass}>{labelEl}</div>
      )}
    </div>
  );
}

export function BannerBlock({
  props,
  mode,
  pageTitle,
  pageNumbering,
}: Props) {
  // Always use the derived default name — no custom title field in the UI.
  const label = defaultBannerLabel(pageTitle, pageNumbering);
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
