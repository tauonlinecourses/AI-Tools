import type { VideoProps } from "../../lib/types";
import { ChevronDownIcon, PlayCircleIcon } from "../icons";
import { Field, SelectField, TextField } from "./fields";

interface Props {
  props: VideoProps;
  editable: boolean;
  onChange: (props: VideoProps) => void;
  /** Edit mode: whether the settings panel above the placeholder is open. */
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
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
  settingsOpen = false,
  onChevronClick,
}: {
  label: string;
  url?: string;
  settingsOpen?: boolean;
  onChevronClick?: () => void;
}) {
  const href = url?.trim() || undefined;
  const showStrip = Boolean(onChevronClick);

  const body = (
    <>
      <p className="text-white text-xl sm:text-2xl font-medium text-center max-w-2xl">{label}</p>
      <PlayCircleIcon className="w-20 h-20" />
      {!href && (
        <p className="text-sm sm:text-base text-white/70 font-medium">ללא קובץ</p>
      )}
    </>
  );

  const bodyClass = `absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 ${
    showStrip ? "pt-7" : ""
  }`;

  return (
    <div className="relative aspect-video w-full bg-black overflow-hidden select-none">
      {showStrip && (
        <div className="absolute top-0 inset-x-0 h-7 bg-[#2c2c2c] flex justify-center z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChevronClick?.();
            }}
            className="absolute -bottom-3.5 w-11 h-7 rounded-b-full bg-[#2c2c2c] flex items-center justify-center text-white"
            title="הגדרות וידאו"
            aria-label="פתח או סגור הגדרות וידאו"
            aria-expanded={settingsOpen}
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-fast ${
                settingsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      )}

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

function SettingsFields({
  props,
  onChange,
  defaultLabel,
}: {
  props: VideoProps;
  onChange: (props: VideoProps) => void;
  defaultLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 border-b border-surface-200">
      <Field label="שם הסרטון">
        <TextField
          value={props.title ?? ""}
          placeholder={defaultLabel}
          onChange={(e) => onChange({ ...props, title: e.target.value })}
        />
      </Field>
      <Field label="קישור לוידאו">
        <TextField
          dir="ltr"
          value={props.url ?? ""}
          placeholder="https://www.youtube.com/watch?v=..."
          onChange={(e) => onChange({ ...props, url: e.target.value })}
        />
      </Field>
      <Field label="פלטפורמה">
        <SelectField
          value={props.provider ?? "youtube"}
          onChange={(e) =>
            onChange({ ...props, provider: e.target.value as VideoProps["provider"] })
          }
        >
          <option value="youtube">YouTube</option>
          <option value="panopto">Panopto</option>
          <option value="other">אחר</option>
        </SelectField>
      </Field>
    </div>
  );
}

export function VideoBlock({
  props,
  editable,
  onChange,
  settingsOpen = false,
  onToggleSettings,
  pageTitle,
  videoNumber,
}: Props) {
  const defaultLabel = defaultVideoLabel(pageTitle, videoNumber);
  const label = props.title?.trim() || defaultLabel;

  if (!editable) {
    return <VideoPlaceholder label={label} url={props.url} />;
  }

  return (
    <div className="flex flex-col">
      {settingsOpen && (
        <SettingsFields props={props} onChange={onChange} defaultLabel={defaultLabel} />
      )}
      <VideoPlaceholder
        label={label}
        url={props.url}
        settingsOpen={settingsOpen}
        onChevronClick={onToggleSettings}
      />
    </div>
  );
}
