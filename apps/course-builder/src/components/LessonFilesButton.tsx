import type { ReactNode } from "react";
import { FilmIcon, FolderIcon } from "./icons";

interface LessonFolderButtonProps {
  url?: string | null;
  label: string;
  missingLabel: string;
  icon: ReactNode;
  /** Smaller styling for the page header row beside the status badge. */
  compact?: boolean;
  /**
   * When true and `url` is empty, render a disabled icon button instead of
   * hiding the control (used on lesson page headers).
   */
  showDisabled?: boolean;
}

const enabledStyles =
  "inline-flex items-center justify-center rounded-control border border-black bg-white text-black transition-colors duration-fast hover:bg-gray-50 active:bg-gray-100";

const disabledStyles =
  "inline-flex items-center justify-center rounded-control border border-surface-200 bg-surface-50 text-surface-400 cursor-not-allowed opacity-60";

function LessonFolderButton({
  url,
  label,
  missingLabel,
  icon,
  compact = false,
  showDisabled = false,
}: LessonFolderButtonProps) {
  const href = url?.trim() ?? "";
  const sizeClass = compact ? "shrink-0 p-1.5" : "shrink-0 p-2.5";

  if (!href) {
    if (!showDisabled) return null;
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={missingLabel}
        title={missingLabel}
        className={`${disabledStyles} ${sizeClass}`}
      >
        {icon}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className={`${enabledStyles} ${sizeClass}`}
    >
      {icon}
    </a>
  );
}

interface LessonFolderLinkProps {
  url?: string | null;
  compact?: boolean;
  showDisabled?: boolean;
}

export function LessonFilesButton({
  url,
  compact = false,
  showDisabled = false,
}: LessonFolderLinkProps) {
  return (
    <LessonFolderButton
      url={url}
      compact={compact}
      showDisabled={showDisabled}
      label="קבצי השיעור"
      missingLabel="אין תיקיית קבצים לשיעור"
      icon={<FolderIcon className={compact ? "w-4 h-4" : "w-5 h-5"} />}
    />
  );
}

export function LessonVideosButton({
  url,
  compact = false,
  showDisabled = false,
}: LessonFolderLinkProps) {
  return (
    <LessonFolderButton
      url={url}
      compact={compact}
      showDisabled={showDisabled}
      label="סרטוני השיעור"
      missingLabel="אין תיקיית סרטונים לשיעור"
      icon={<FilmIcon className={compact ? "w-4 h-4" : "w-5 h-5"} />}
    />
  );
}
