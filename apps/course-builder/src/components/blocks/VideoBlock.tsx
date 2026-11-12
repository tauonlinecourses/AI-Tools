import type { CourseViewMode, VideoProps } from "../../lib/types";
import { detectVideoProvider, resolveVideoEmbedSrc } from "../../lib/videoEmbed";
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

function VideoEmbed({
  src,
  title,
  openHref,
}: {
  src: string;
  title: string;
  /** When set, show an "Open in SharePoint" link under the iframe. */
  openHref?: string;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
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
      {openHref && (
        <a
          href={openHref}
          target="_blank"
          rel="noreferrer"
          className="self-start text-sm font-medium text-surface-600 hover:text-surface-900 underline-offset-2 hover:underline"
          dir="rtl"
        >
          פתח ב-SharePoint
        </a>
      )}
    </div>
  );
}

export function VideoBlock({
  props,
  pageTitle,
  videoNumber,
}: Props) {
  const defaultLabel = defaultVideoLabel(pageTitle, videoNumber);
  const label = props.title?.trim() || defaultLabel;

  const embedSrc = resolveVideoEmbedSrc(props.url);
  if (embedSrc) {
    const isSharePoint =
      detectVideoProvider(props.url) === "sharepoint" ||
      props.provider === "sharepoint";
    return (
      <VideoEmbed
        src={embedSrc}
        title={label}
        openHref={isSharePoint ? props.url?.trim() || undefined : undefined}
      />
    );
  }

  return <VideoPlaceholder label={label} url={props.url} />;
}
