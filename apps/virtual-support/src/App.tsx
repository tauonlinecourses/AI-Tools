import { useCallback, useEffect, useState } from "react";
import { PageLayout } from "@workspace/ui";
import { AskPage } from "./components/AskPage";
import { DocEditor } from "./components/DocEditor";
import { DocView } from "./components/DocView";
import { DocumentsSidebar } from "./components/DocumentsSidebar";
import { isDataConfigured } from "./lib/config";
import {
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  listDocuments,
  listFolders,
  renameFolder,
  updateDocument,
} from "./lib/dataClient";
import type { Document, Folder, Mode } from "./lib/types";

type EditMode = null | "new" | string;

export default function App() {
  const [mode, setMode] = useState<Mode>("documents");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const selectedFolder = selected?.folderId
    ? folders.find((f) => f.id === selected.folderId) ?? null
    : null;

  const refresh = useCallback(async () => {
    if (!isDataConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const [f, d] = await Promise.all([listFolders(), listDocuments()]);
      setFolders(f);
      setDocuments(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAddFolder = useCallback(async () => {
    const name = window.prompt("שם התיקייה החדשה:");
    if (!name?.trim()) return;
    setError(null);
    try {
      const folder = await createFolder(name.trim());
      setFolders((prev) => [...prev, folder]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת תיקייה נכשלה");
    }
  }, []);

  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    setError(null);
    try {
      const folder = await renameFolder(id, name);
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "שינוי שם נכשל");
    }
  }, []);

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteFolder(id);
        setFolders((prev) => prev.filter((f) => f.id !== id));
        setDocuments((prev) =>
          prev.map((d) =>
            d.folderId === id ? { ...d, folderId: null } : d
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "מחיקת תיקייה נכשלה");
      }
    },
    []
  );

  const handleAddDocument = useCallback((folderId: string | null) => {
    setNewFolderId(folderId);
    setEditMode("new");
    setSelectedId(null);
    setError(null);
  }, []);

  const handleSave = useCallback(
    async (input: {
      title: string;
      body: string;
      folderId: string | null;
    }) => {
      setSaving(true);
      setError(null);
      try {
        if (editMode === "new") {
          const doc = await createDocument(input);
          setDocuments((prev) => [...prev, doc]);
          setSelectedId(doc.id);
        } else if (typeof editMode === "string") {
          const doc = await updateDocument({ id: editMode, ...input });
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? doc : d))
          );
          setSelectedId(doc.id);
        }
        setEditMode(null);
        setNewFolderId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "שמירה נכשלה");
      } finally {
        setSaving(false);
      }
    },
    [editMode]
  );

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    if (!window.confirm("למחוק את המסמך?")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(selectedId);
      setDocuments((prev) => prev.filter((d) => d.id !== selectedId));
      setSelectedId(null);
      setEditMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setDeleting(false);
    }
  }, [selectedId]);

  const editingDoc =
    typeof editMode === "string"
      ? documents.find((d) => d.id === editMode) ?? null
      : null;

  return (
    <PageLayout
      toolName="Virtual Support"
      toolDescription="Organization knowledge base and grounded Q&A"
      toolNameHe="תמיכה וירטואלית"
      toolDescriptionHe="מאגר ידע ארגוני ושאלות מבוססות מסמכים"
      maxWidth="full"
      padded={false}
      locale="he"
    >
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
        <nav
          dir="rtl"
          className="flex shrink-0 items-center gap-1 border-b border-surface-200 bg-white px-3 py-2"
        >
          <ModeTab
            active={mode === "documents"}
            onClick={() => setMode("documents")}
            label="מסמכים"
          />
          <ModeTab
            active={mode === "ask"}
            onClick={() => setMode("ask")}
            label="שאל"
          />
        </nav>

        {!isDataConfigured ? (
          <div
            dir="rtl"
            className="flex flex-1 items-center justify-center p-6 text-center text-sm text-surface-600"
          >
            הגדירו{" "}
            <code className="mx-1 rounded bg-surface-100 px-1">
              VITE_SUPABASE_URL
            </code>{" "}
            ו־
            <code className="mx-1 rounded bg-surface-100 px-1">
              VS_SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            בקובץ{" "}
            <code className="mx-1 rounded bg-surface-100 px-1">.env</code>.
          </div>
        ) : mode === "ask" ? (
          <div className="min-h-0 flex-1">
            <AskPage />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <DocumentsSidebar
              folders={folders}
              documents={documents}
              selectedId={selectedId}
              loading={loading}
              onSelect={(id) => {
                setSelectedId(id);
                setEditMode(null);
                setError(null);
              }}
              onAddDocument={handleAddDocument}
              onAddFolder={() => void handleAddFolder()}
              onRenameFolder={(id, name) => void handleRenameFolder(id, name)}
              onDeleteFolder={(id) => void handleDeleteFolder(id)}
            />
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white">
              {error ? (
                <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-danger">
                  {error}
                </p>
              ) : null}
              {editMode !== null ? (
                <DocEditor
                  initial={editingDoc}
                  folders={folders}
                  folderId={
                    editMode === "new"
                      ? newFolderId
                      : editingDoc?.folderId ?? null
                  }
                  busy={saving}
                  error={error}
                  onSave={handleSave}
                  onCancel={() => {
                    setEditMode(null);
                    setNewFolderId(null);
                    setError(null);
                  }}
                />
              ) : (
                <DocView
                  doc={selected}
                  folder={selectedFolder}
                  loading={loading}
                  deleting={deleting}
                  onEdit={() => {
                    if (selectedId) setEditMode(selectedId);
                  }}
                  onDelete={() => void handleDelete()}
                />
              )}
            </main>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-control px-3 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-sky-50 text-sky-950"
          : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
      }`}
    >
      {label}
    </button>
  );
}
