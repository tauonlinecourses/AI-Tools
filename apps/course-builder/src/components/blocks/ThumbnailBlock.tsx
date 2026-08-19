import type { CourseViewMode, ImageProps } from "../../lib/types";
import { useState } from "react";

interface Props {
  props: ImageProps;
  mode: CourseViewMode;
  onChange: (props: ImageProps) => void;
}

export function ImageBlock({ props }: Props) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!props.imageUrl?.trim() && !imgError;
  const fileHref = props.fileUrl?.trim() || undefined;

  const placeholder = (
    <div className="w-full aspect-video bg-surface-100 border border-surface-200 flex items-center justify-center select-none">
      <span className="text-surface-400 text-sm">ללא תמונה</span>
    </div>
  );

  const image = hasImage ? (
    <img
      src={props.imageUrl!}
      alt=""
      className="w-full aspect-video object-cover"
      onError={() => setImgError(true)}
    />
  ) : null;

  if (fileHref) {
    return (
      <a
        href={fileHref}
        target="_blank"
        rel="noreferrer"
        className="block w-full cursor-pointer hover:opacity-90 transition-opacity"
        title="פתח קובץ"
      >
        {image || placeholder}
      </a>
    );
  }

  return image || placeholder;
}
