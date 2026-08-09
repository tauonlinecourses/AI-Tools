import type { BannerProps } from "../../lib/types";
import { ChevronDownIcon } from "../icons";
import { Field, TextField } from "./fields";

interface Props {
  props: BannerProps;
  editable: boolean;
  onChange: (props: BannerProps) => void;
  /** Edit mode: whether the settings panel above the placeholder is open. */
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
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
  settingsOpen = false,
  onChevronClick,
}: {
  label: string;
  imageUrl?: string;
  settingsOpen?: boolean;
  onChevronClick?: () => void;
}) {
  const src = imageUrl?.trim() || undefined;
  const showStrip = Boolean(onChevronClick);

  const labelEl = (
    <div className="flex flex-col items-center gap-2 max-w-2xl">
      <p
        className={`text-xl sm:text-2xl font-semibold text-center ${
          src ? "text-white drop-shadow" : "text-surface-700"
        }`}
      >
        {label}
      </p>
      {!src && (
        <p className="text-sm sm:text-base font-medium text-surface-500">ללא קובץ</p>
      )}
    </div>
  );

  const bodyClass = `absolute inset-0 flex items-center justify-center px-6 ${
    showStrip ? "pt-7" : ""
  }`;

  return (
    <div className="relative aspect-[4/1] w-full overflow-hidden select-none bg-[#E8EAED]">
      {src && (
        <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}

      {showStrip && (
        <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-10 bg-[#6B6B6B]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChevronClick?.();
            }}
            className="absolute -bottom-3.5 w-11 h-7 rounded-b-full bg-[#6B6B6B] flex items-center justify-center text-white"
            title="הגדרות באנר"
            aria-label="פתח או סגור הגדרות באנר"
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

      {src ? (
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

function SettingsFields({
  props,
  onChange,
  defaultLabel,
}: {
  props: BannerProps;
  onChange: (props: BannerProps) => void;
  defaultLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 border-b border-surface-200">
      <Field label="שם הבאנר">
        <TextField
          value={props.title ?? ""}
          placeholder={defaultLabel}
          onChange={(e) => onChange({ ...props, title: e.target.value })}
        />
      </Field>
      <Field label="קישור לתמונה">
        <TextField
          dir="ltr"
          value={props.imageUrl ?? ""}
          placeholder="https://..."
          onChange={(e) => onChange({ ...props, imageUrl: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function BannerBlock({
  props,
  editable,
  onChange,
  settingsOpen = false,
  onToggleSettings,
  pageTitle,
  pageNumbering,
}: Props) {
  const defaultLabel = defaultBannerLabel(pageTitle, pageNumbering);
  const label = props.title?.trim() || defaultLabel;

  if (!editable) {
    return <BannerPlaceholder label={label} imageUrl={props.imageUrl} />;
  }

  return (
    <div className="flex flex-col">
      {settingsOpen && (
        <SettingsFields props={props} onChange={onChange} defaultLabel={defaultLabel} />
      )}
      <BannerPlaceholder
        label={label}
        imageUrl={props.imageUrl}
        settingsOpen={settingsOpen}
        onChevronClick={onToggleSettings}
      />
    </div>
  );
}
