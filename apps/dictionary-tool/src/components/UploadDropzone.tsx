import { useState, type DragEvent } from "react";
import { Spinner } from "@workspace/ui";

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  loading?: boolean;
  error?: string | null;
}

const ACCEPT =
  ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

export function UploadDropzone({ onFile, loading, error }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isExcelFile(file)) {
      setLocalError("יש להעלות קובץ אקסל בלבד (.xlsx או .xls)");
      return;
    }
    setLocalError(null);
    onFile(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (loading) return;
    handleFiles(e.dataTransfer.files);
  }

  const displayError = localError || error;

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-12",
          "transition-colors duration-fast cursor-pointer",
          dragging
            ? "border-surface-900 bg-white"
            : "border-surface-300 bg-surface-50 hover:border-surface-900 hover:bg-white",
          loading ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <input
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <Spinner size="sm" />
            קורא את הקובץ…
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-surface-900">
              {dragging
                ? "שחררו כאן את קובץ האקסל"
                : "גררו קובץ אקסל עם רשימת מושגים"}
            </p>
            <p className="text-xs text-surface-500">
              עמודות: מושג, הגדרה (יחידה אופציונלית) — או לחצו לבחירת קובץ
            </p>
            <span className="inline-flex h-8 px-3 items-center text-xs font-semibold rounded-control bg-white text-gray-900 border border-gray-900">
              בחירת קובץ
            </span>
          </>
        )}
      </label>
      {displayError && <p className="text-sm text-danger">{displayError}</p>}
    </div>
  );
}
