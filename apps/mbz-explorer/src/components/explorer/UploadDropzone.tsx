import { Spinner } from "@workspace/ui";

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  loading?: boolean;
  error?: string | null;
}

export function UploadDropzone({ onFile, loading, error }: UploadDropzoneProps) {
  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    onFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        className={[
          "flex flex-col items-center justify-center gap-3 border border-dashed border-surface-300 bg-surface-50 px-6 py-12",
          "hover:border-surface-900 hover:bg-white transition-colors duration-fast cursor-pointer",
          loading ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <input
          type="file"
          accept=".mbz,.zip,application/gzip,application/zip"
          className="hidden"
          disabled={loading}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <Spinner size="sm" />
            Extracting and parsing…
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-surface-900">Drop a Moodle .mbz backup</p>
            <p className="text-xs text-surface-500">or click to choose a file</p>
            <span className="inline-flex h-8 px-3 items-center text-xs font-semibold rounded-control bg-white text-gray-900 border border-gray-900">
              Choose file
            </span>
          </>
        )}
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
