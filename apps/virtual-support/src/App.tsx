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
import type { Document, Folder } from "./lib/types";

type EditMode = null | "new" | string;

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
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

  const showViewer = viewerOpen || editMode !== null;

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

  const openDocument = useCallback((id: string) => {
    setSelectedId(id);
    setViewerOpen(true);
    setEditMode(null);
    setError(null);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setEditMode(null);
    setNewFolderId(null);
    setError(null);
  }, []);

  const handleAddFolder = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const folder = await createFolder(trimmed);
      setFolders((prev) => [...prev, folder]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת תיקייה נכשלה");
      throw err;
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

  const handleDeleteFolder = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setDocuments((prev) =>
        prev.map((d) => (d.folderId === id ? { ...d, folderId: null } : d))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקת תיקייה נכשלה");
    }
  }, []);

  const handleAddDocument = useCallback((folderId: string | null) => {
    setNewFolderId(folderId);
    setEditMode("new");
    setSelectedId(null);
    setViewerOpen(true);
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
        setViewerOpen(true);
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
      setViewerOpen(false);
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
      toolNameHe="מדריכים - Virtual TAU"
      toolDescriptionHe="מאגר ידע ארגוני ושאלות מבוססות מסמכים"
      maxWidth="full"
      padded={false}
      locale="he"
    >
      <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-[#f8f9fa]">
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
        ) : (
          <div
            dir="rtl"
            className="flex h-full min-h-0 flex-col gap-2 px-5 py-3 md:px-6"
          >
            {error ? (
              <p className="shrink-0 rounded-[1rem] border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:items-stretch">
              <DocumentsSidebar
                folders={folders}
                documents={documents}
                selectedId={selectedId}
                loading={loading}
                onSelect={openDocument}
                onAddDocument={handleAddDocument}
                onAddFolder={handleAddFolder}
                onRenameFolder={(id, name) => void handleRenameFolder(id, name)}
                onDeleteFolder={(id) => void handleDeleteFolder(id)}
              />

              {/* flex-1 (not fixed 50%) so 25%+25%+gaps do not clip the outer left margin */}
              <main className="order-first h-full min-h-0 min-w-0 flex-1 overflow-hidden md:order-none">
                <AskPage
                  onOpenDocument={(doc: Document) => {
                    setDocuments((prev) => {
                      const exists = prev.some((d) => d.id === doc.id);
                      return exists
                        ? prev.map((d) => (d.id === doc.id ? doc : d))
                        : [...prev, doc];
                    });
                    openDocument(doc.id);
                  }}
                />
              </main>

              {showViewer ? (
                <section className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-black/5 md:w-[25%] md:max-w-[25%] md:flex-none">
                  <div className="min-h-0 flex-1 overflow-y-auto">
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
                        deleting={deleting}
                        error={error}
                        onSave={handleSave}
                        onDelete={
                          editMode !== "new"
                            ? () => void handleDelete()
                            : undefined
                        }
                        onCancel={() => {
                          setEditMode(null);
                          setNewFolderId(null);
                          setError(null);
                          if (!selectedId) setViewerOpen(false);
                        }}
                      />
                    ) : (
                      <DocView
                        doc={selected}
                        folder={selectedFolder}
                        loading={loading}
                        onClose={closeViewer}
                        onEdit={() => {
                          if (selectedId) setEditMode(selectedId);
                        }}
                      />
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
