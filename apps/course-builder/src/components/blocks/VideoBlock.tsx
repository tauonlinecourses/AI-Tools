import type { CourseViewMode, VideoProps } from "../../lib/types";
import { resolveVideoEmbedSrc } from "../../lib/videoEmbed";
import { PlayCircleIcon } from "../icons";

interface Props {
  props: VideoProps;
  mode: CourseViewMode;
  onChange: (props: VideoProps) => void;
  /** Page title used for the default placeholder label. */
  pageTitle: string;
  /** 1-based index among video components on this page (by current order). */
  videoNumber: number;
}

function defaultVideoLabel(pageTitle: string, videoNumber: number): string {
  return `${pageTitle.trim() || "ללא כותרת"} | סרטון מספר ${videoNumber}`;
}

function VideoPlaceholder({
  label,
  url,
}: {
  label: string;
  url?: string;
}) {
  const href = url?.trim() || undefined;

  const body = (
    <>
      <p className="text-white text-xl sm:text-2xl font-medium text-center max-w-2xl">{label}</p>
      <PlayCircleIcon className="w-24 h-24" />
      {!href && (
        <p className="text-sm sm:text-base text-white/70 font-medium">ללא קובץ</p>
      )}
    </>
  );

  const bodyClass =
    "absolute inset-0 flex flex-col items-center justify-center gap-6 px-6";

  return (
    <div className="relative aspect-video w-full bg-black overflow-hidden select-none">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${bodyClass} cursor-pointer hover:bg-white/15 transition-colors duration-fast`}
          title="פתח וידאו"
        >
          {body}
        </a>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
    </div>
  );
}

function VideoEmbed({ src, title }: { src: string; title: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <iframe
        src={src}
        title={title}
        className="absolute inset-0 w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export function VideoBlock({
  props,
  mode,
  pageTitle,
  videoNumber,
}: Props) {
  const defaultLabel = defaultVideoLabel(pageTitle, videoNumber);
  const label = props.title?.trim() || defaultLabel;
  const editable = mode === "edit";

  if (mode === "review") {
    const embedSrc = resolveVideoEmbedSrc(props.url);
    if (embedSrc) {
      return <VideoEmbed src={embedSrc} title={label} />;
    }
    return <VideoPlaceholder label={label} url={props.url} />;
  }

  if (!editable) {
    return <VideoPlaceholder label={label} url={props.url} />;
  }

  return <VideoPlaceholder label={label} url={props.url} />;
}
