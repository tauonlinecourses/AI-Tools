import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Spinner } from "@workspace/ui";
import { UploadDropzone } from "../components/explorer/UploadDropzone";
import { StructureOverview } from "../components/explorer/StructureOverview";
import {
  ingestFile,
  listAnalyses,
  removeAnalysis,
  type AnalysisSummary,
} from "../lib/session";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function refresh() {
    setLoadingList(true);
    try {
      setItems(await listAnalyses());
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const session = await ingestFile(file);
      navigate(`/f/${session.manifest.sourceFile.sha1}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(sha1: string) {
    setDeleting(sha1);
    try {
      await removeAnalysis(sha1);
      await refresh();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-surface-900">MBZ Explorer</h1>
          <p className="text-sm text-surface-600 mt-1">
            Inspect Moodle course backup structure, activities, and decoded content.
          </p>
        </div>

        <UploadDropzone onFile={onFile} loading={uploading} error={error} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-surface-900">Previous analyses</h2>
          {loadingList ? (
            <div className="flex items-center gap-2 text-sm text-surface-500">
              <Spinner size="sm" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-surface-500">No analyses yet. Upload a .mbz file to begin.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.sha1}>
                  <Card padding="md" className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/f/${item.sha1}`}
                          className="text-sm font-semibold text-surface-900 hover:underline"
                        >
                          {item.name}
                        </Link>
                        <p className="text-xs text-surface-500 mt-0.5 truncate">
                          {item.courseName} · {formatBytes(item.sizeBytes)} ·{" "}
                          {new Date(item.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/f/${item.sha1}`)}>
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={deleting === item.sha1}
                          onClick={() => onDelete(item.sha1)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <StructureOverview
                      compact
                      stats={{
                        sectionCount: item.sectionCount,
                        activityCount: item.activityCount,
                        fileCount: item.fileCount,
                        activityTypeCounts: item.activityTypeCounts,
                      }}
                    />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
