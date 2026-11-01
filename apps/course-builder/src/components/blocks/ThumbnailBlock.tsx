import type { CourseViewMode, ImageProps } from "../../lib/types";
import { useEffect, useState } from "react";
import { MediaImage } from "./MediaImage";

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

function ImagePlaceholder({
  label,
  url,
}: {
  label: string;
  url?: string;
}) {
  const href = url?.trim() || undefined;

  const body = (
    <>
      <p className="text-surface-700 text-xl sm:text-2xl font-semibold text-center max-w-2xl">
        {label}
      </p>
      {!href && (
        <p className="text-sm sm:text-base text-surface-500 font-medium">ללא קובץ</p>
      )}
    </>
  );

  const bodyClass =
    "absolute inset-0 flex flex-col items-center justify-center gap-6 px-6";

  return (
    <div className="relative aspect-video w-full bg-[#E8EAED] overflow-hidden select-none">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${bodyClass} cursor-pointer hover:bg-black/10 transition-colors duration-fast`}
          title="פתח תמונה"
        >
          {body}
        </a>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
    </div>
  );
}

export function ImageBlock({ props, mode, pageTitle, imageNumber }: Props) {
  const [imgError, setImgError] = useState(false);
  const imageHref = props.imageUrl?.trim() || undefined;
  const label = defaultImageLabel(pageTitle, imageNumber);

  useEffect(() => {
    setImgError(false);
  }, [imageHref]);

  const hasImage = !!imageHref && !imgError;

  if (!hasImage) {
    return <ImagePlaceholder label={label} url={imageHref} />;
  }

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

  // Edit/implement: open the image URL on click. Preview: display only.
  if (mode !== "review") {
    return (
      <a
        href={imageHref}
        target="_blank"
        rel="noreferrer"
        className="block w-full cursor-pointer hover:opacity-90 transition-opacity"
        title="פתח תמונה"
      >
        {image}
      </a>
    );
  }

  return image;
}
