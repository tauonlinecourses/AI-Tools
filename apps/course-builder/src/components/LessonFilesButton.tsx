import { FolderIcon } from "./icons";

interface LessonFilesButtonProps {
  url: string;
  /** Smaller styling for the page header row beside the status badge. */
  compact?: boolean;
}

const buttonStyles =
  "inline-flex items-center justify-center font-semibold rounded-control border border-black bg-white text-black transition-colors duration-fast hover:bg-gray-50 active:bg-gray-100";

export function LessonFilesButton({ url, compact = false }: LessonFilesButtonProps) {
  const href = url.trim();
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        compact
          ? `${buttonStyles} shrink-0 px-3 py-1.5 text-sm gap-1.5`
          : `${buttonStyles} h-10 px-4 text-base gap-2`
      }
    >
      <FolderIcon className={compact ? "w-4 h-4" : "w-5 h-5"} />
      קבצי השיעור
    </a>
  );
}