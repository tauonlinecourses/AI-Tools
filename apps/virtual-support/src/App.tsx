import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PageLayout } from "@workspace/ui";
import { AskPage } from "./components/AskPage";
// Lazy: only admins open it, so recharts is not in everyone's bundle.
const DashboardPage = lazy(() =>
  import("./components/dashboard/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  }))
);
import { useIsAdmin } from "./lib/metricsClient";
import { DocEditor } from "./components/DocEditor";
import { DocView } from "./components/DocView";
import { DocumentsSidebar } from "./components/DocumentsSidebar";
import { isDataConfigured } from "./lib/config";
import {
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  getDocument,
  indexDocument,
  listDocuments,
  listFolders,
  renameFolder,
  updateDocument,
} from "./lib/dataClient";
import type { Document, Folder, IndexStatus } from "./lib/types";

type EditMode = null | "new" | string;

const SAVED_NOTICE_MS = 3000;

const LEAVE_EDIT_CONFIRM = "לצאת מהעריכה? שינויים שלא נשמרו יאבדו.";

export default function App() {
  const isAdmin = useIsAdmin();
  const [view, setView] = useState<"workspace" | "dashboard">("workspace");
  const showDashboard = isAdmin && view === "dashboard";
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
  const [indexStatus, setIndexStatus] = useState<Record<string, IndexStatus>>(
    {}
  );
  const [savedNoticeId, setSavedNoticeId] = useState<string | null>(null);
  const savedNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One indexing run per page at a time; a save during a run queues one more.
  const indexingRef = useRef(new Set<string>());
  const reindexQueuedRef = useRef(new Set<string>());

  const runIndexing = useCallback(async (id: string) => {
    if (indexingRef.current.has(id)) {
      reindexQueuedRef.current.add(id);
      return;
    }
    indexingRef.current.add(id);
    setIndexStatus((prev) => ({ ...prev, [id]: "indexing" }));
    let failed = false;
    try {
      do {
        reindexQueuedRef.current.delete(id);
        try {
          await indexDocument(id);
          failed = false;
        } catch {
          failed = true;
        }
      } while (reindexQueuedRef.current.has(id));
    } finally {
      indexingRef.current.delete(id);
      setIndexStatus((prev) => {
        const next = { ...prev };
        if (failed) next[id] = "failed";
        else delete next[id];
        return next;
      });
    }
  }, []);

  const showSavedNotice = useCallback((id: string) => {
    setSavedNoticeId(id);
    if (savedNoticeTimer.current) clearTimeout(savedNoticeTimer.current);
    savedNoticeTimer.current = setTimeout(
      () => setSavedNoticeId(null),
      SAVED_NOTICE_MS
    );
  }, []);

  useEffect(
    () => () => {
      if (savedNoticeTimer.current) clearTimeout(savedNoticeTimer.current);
    },
    []
  );

  // Closing the tab mid-indexing would leave search on the old version.
  const anyIndexing = Object.values(indexStatus).includes("indexing");
  useEffect(() => {
    if (!anyIndexing) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyIndexing]);

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const selectedFolder = selected?.folderId
    ? folders.find((f) => f.id === selected.folderId) ?? null
    : null;

  const showViewer = viewerOpen || editMode !== null;

  // Read the latest edit mode inside async callbacks (e.g. an answer that
  // arrives after the user started editing).
  const editModeRef = useRef<EditMode>(editMode);
  editModeRef.current = editMode;

  /** true when it is OK to leave the editor (not editing, or user confirmed). */
  const confirmLeaveEdit = useCallback(
    () =>
      editModeRef.current === null || window.confirm(LEAVE_EDIT_CONFIRM),
    []
  );

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
    if (!confirmLeaveEdit()) return;
    setSelectedId(id);
    setViewerOpen(true);
    setEditMode(null);
    setError(null);
  }, [confirmLeaveEdit]);

  // Latest page list for async callbacks.
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  /**
   * Open a page from a chat citation. Uses the already-loaded page list
   * (instant); only fetches when the page is not loaded yet, e.g. created by
   * someone else after this app loaded.
   */
  const openFromChat = useCallback(
    async (id: string, { auto }: { auto: boolean }) => {
      // Never interrupt editing for an automatic open.
      if (auto && editModeRef.current !== null) return;
      if (documentsRef.current.some((d) => d.id === id)) {
        openDocument(id);
        return;
      }
      try {
        const doc = await getDocument(id);
        setDocuments((prev) =>
          prev.some((d) => d.id === doc.id)
            ? prev.map((d) => (d.id === doc.id ? doc : d))
            : [...prev, doc]
        );
        if (auto && editModeRef.current !== null) return;
        openDocument(doc.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "טעינת המסמך נכשלה");
      }
    },
    [openDocument]
  );

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
    if (!confirmLeaveEdit()) return;
    setNewFolderId(folderId);
    setEditMode("new");
    setSelectedId(null);
    setViewerOpen(true);
    setError(null);
  }, [confirmLeaveEdit]);

  const handleSave = useCallback(
    async (input: {
      title: string;
      body: string;
      folderId: string | null;
    }) => {
      setSaving(true);
      setError(null);
      try {
        let savedId: string | null = null;
        if (editMode === "new") {
          const doc = await createDocument(input);
          setDocuments((prev) => [...prev, doc]);
          savedId = doc.id;
        } else if (typeof editMode === "string") {
          const doc = await updateDocument({ id: editMode, ...input });
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? doc : d))
          );
          savedId = doc.id;
        }
        setEditMode(null);
        setNewFolderId(null);
        setViewerOpen(true);
        if (savedId) {
          setSelectedId(savedId);
          showSavedNotice(savedId);
          // Saved in the DB; search indexing continues in the background.
          void runIndexing(savedId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "שמירה נכשלה");
      } finally {
        setSaving(false);
      }
    },
    [editMode, runIndexing, showSavedNotice]
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
      toolDescriptionHe="צ׳אט-בוט המבוסס על מאגר הידע הארגוני לתמיכה טכנית"
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
            {isAdmin ? (
              <nav className="flex shrink-0 gap-1" aria-label="תצוגה">
                {(
                  [
                    ["workspace", "מסמכים וצ׳אט"],
                    ["dashboard", "דשבורד"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    aria-pressed={view === key}
                    className={`rounded-full px-3 py-1 text-xs ${
                      view === key
                        ? "bg-surface-900 text-white"
                        : "text-surface-600 hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            ) : null}

            {error && !showDashboard ? (
              <p className="shrink-0 rounded-[1rem] border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            {showDashboard ? (
              <div className="min-h-0 flex-1">
                <Suspense
                  fallback={
                    <p className="py-20 text-center text-sm text-surface-500">
                      טוען דשבורד…
                    </p>
                  }
                >
                  <DashboardPage />
                </Suspense>
              </div>
            ) : null}

            {/* Kept mounted while the dashboard is open so the chat is not lost. */}
            <div
              className={`min-h-0 flex-1 flex-col gap-3 md:flex-row md:items-stretch ${
                showDashboard ? "hidden" : "flex"
              }`}
            >
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
                  onOpenDocument={(id, opts) => void openFromChat(id, opts)}
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
                        justSaved={selectedId !== null && savedNoticeId === selectedId}
                        indexStatus={selectedId ? indexStatus[selectedId] : undefined}
                        onRetryIndex={() => {
                          if (selectedId) void runIndexing(selectedId);
                        }}
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
