import type { CourseViewMode, ImageProps } from "../../lib/types";
import { useEffect, useState } from "react";
import { MediaImage } from "./MediaImage";

interface Props {
  props: ImageProps;
  mode: CourseViewMode;
  onChange: (props: ImageProps) => void;
}

export function ImageBlock({ props, mode }: Props) {
  const [imgError, setImgError] = useState(false);
  const imageHref = props.imageUrl?.trim() || undefined;

  useEffect(() => {
    setImgError(false);
  }, [imageHref]);

  const hasImage = !!imageHref && !imgError;

  const placeholder = (
    <div className="w-full aspect-video bg-surface-100 border border-surface-200 flex items-center justify-center select-none">
      <span className="text-surface-400 text-sm">ללא תמונה</span>
    </div>
  );

  const image = hasImage ? (
    <MediaImage
      url={imageHref}
      className="w-full aspect-video object-cover"
      onStatus={(status) => {
        if (status === "error") setImgError(true);
        else if (status === "loaded") setImgError(false);
      }}
    />
  ) : null;

  // Edit/implement: open the image URL on click. Preview: display only.
  if (hasImage && mode !== "review") {
    return (
      <a
        href={imageHref}
        target="_blank"
        rel="noreferrer"
        className="block w-full cursor-pointer hover:opacity-90 transition-opacity"
        title="פתח תמונה"
      >
        {image || placeholder}
      </a>
    );
  }

  return image || placeholder;
}
