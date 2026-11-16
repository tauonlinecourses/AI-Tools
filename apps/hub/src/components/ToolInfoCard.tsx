import { forwardRef, useState } from "react";
import { Badge } from "@workspace/ui";
import type { Tool } from "../tools.config";
import { toolDetails } from "../toolDetails";
import { ui, localizeTool, type Locale } from "../i18n";
import { ToolIcon } from "./ToolIcon";

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Large white hover card with a tool's video, info, dates and teams. */
export const ToolInfoCard = forwardRef<
  HTMLDivElement,
  {
    id: string;
    tool: Tool;
    locale: Locale;
    allowed: boolean;
    teamNames: string[];
    style: React.CSSProperties;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  }
>(function ToolInfoCard(
  { id, tool, locale, allowed, teamNames, style, onMouseEnter, onMouseLeave },
  ref,
) {
  const t = ui[locale];
  const copy = localizeTool(locale, tool);
  const details = toolDetails[tool.id];
  const info = details?.copy[locale];
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = Boolean(details?.video) && !videoFailed;
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !showVideo && Boolean(details?.image) && !imageFailed;

  const isComingSoon = tool.status === "coming-soon";
  const accessText = isComingSoon
    ? t.comingSoon
    : allowed
      ? t.hasAccess
      : t.noPermission;

  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      dir={t.dir}
      lang={t.htmlLang}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 w-[400px] max-w-[calc(100vw-24px)] bg-white border border-surface-900 transition-opacity duration-normal"
    >
      {showVideo && (
        <div className="relative aspect-video w-full bg-surface-100 border-b border-surface-200 overflow-hidden">
          <video
            key={details!.video}
            src={details!.video}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={copy.name}
            onError={() => setVideoFailed(true)}
          />
        </div>
      )}

      {showImage && (
        <div className="w-full bg-surface-100 border-b border-surface-200 overflow-hidden">
          <img
            src={encodeURI(details!.image!)}
            alt={copy.name}
            className="block h-auto w-full"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </div>
      )}

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-lg font-semibold text-surface-900">{copy.name}</h3>
            {isComingSoon && <Badge variant="default" size="sm">{t.comingSoon}</Badge>}
          </div>
          <ToolIcon name={tool.icon} />
        </div>

        <p className="text-sm leading-relaxed text-surface-700">
          {info?.about ?? copy.description}
        </p>

        {info && info.features.length > 0 && (
          <div>
            <ul className="space-y-1 text-sm text-surface-600">
              {info.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden="true" className="mt-[0.55em] h-1 w-1 shrink-0 bg-surface-900" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {details && (
          <dl className="grid grid-cols-2 gap-3 border-t border-surface-200 pt-4">
            <div>
              <dt className="text-xs text-surface-500">{t.addedOn}</dt>
              <dd className="text-sm font-medium text-surface-900">
                {formatDate(details.addedAt, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-surface-500">{t.updatedOn}</dt>
              <dd className="text-sm font-medium text-surface-900">
                {formatDate(details.updatedAt, locale)}
              </dd>
            </div>
          </dl>
        )}

        <div className="border-t border-surface-200 pt-4">
          <h4 className="mb-2 text-xs text-surface-500">{t.teams}</h4>
          {teamNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {teamNames.map((name) => (
                <span
                  key={name}
                  className="rounded-control border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs text-surface-700"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-500">{t.noTeams}</p>
          )}
        </div>

        <p
          className={[
            "text-xs font-medium",
            allowed && !isComingSoon ? "text-surface-900" : "text-surface-500",
          ].join(" ")}
        >
          {accessText}
        </p>
      </div>
    </div>
  );
});
