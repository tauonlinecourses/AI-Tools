import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@workspace/ui";
import type { Document, Folder } from "../lib/types";

/** OneNote-style section tab colors (cycled by folder index). */
const SECTION_COLORS = [
  "#1e3a5f",
  "#3b82f6",
  "#0d9488",
  "#64748b",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#15803d",
];

const UNFILED_KEY = "__unfiled__";

interface DocumentsSidebarProps {
  folders: Folder[];
  documents: Document[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAddDocument: (folderId: string | null) => void;
  onAddFolder: (name: string) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
}

export function DocumentsSidebar({
  folders,
  documents,
  selectedId,
  loading,
  onSelect,
  onAddDocument,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
}: DocumentsSidebarProps) {
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(
    null
  );
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const byFolder = useMemo(() => {
    const map = new Map<string | null, Document[]>();
    map.set(null, []);
    for (const f of folders) map.set(f.id, []);
    for (const d of documents) {
      const key = d.folderId && map.has(d.folderId) ? d.folderId : null;
      const list = map.get(key) ?? [];
      list.push(d);
    }
    return map;
  }, [folders, documents]);

  const sections = useMemo(() => {
    const list: Array<{
      key: string;
      folderId: string | null;
      name: string;
      color: string;
      docs: Document[];
    }> = folders.map((folder, i) => ({
      key: folder.id,
      folderId: folder.id,
      name: folder.name,
      color: SECTION_COLORS[i % SECTION_COLORS.length]!,
      docs: byFolder.get(folder.id) ?? [],
    }));
    list.push({
      key: UNFILED_KEY,
      folderId: null,
      name: "ללא תיקייה",
      color: "#94a3b8",
      docs: byFolder.get(null) ?? [],
    });
    return list;
  }, [folders, byFolder]);

  // Keep section in sync with the open document (e.g. chat citation).
  useEffect(() => {
    if (!selectedId) return;
    const doc = documents.find((d) => d.id === selectedId);
    if (!doc) return;
    const key =
      doc.folderId && folders.some((f) => f.id === doc.folderId)
        ? doc.folderId
        : UNFILED_KEY;
    setSelectedSectionKey(key);
  }, [selectedId, documents, folders]);

  // Default to first real folder, else unfiled.
  useEffect(() => {
    if (selectedSectionKey !== null) return;
    if (folders.length > 0) {
      setSelectedSectionKey(folders[0]!.id);
    } else {
      setSelectedSectionKey(UNFILED_KEY);
    }
  }, [folders, selectedSectionKey]);

  const activeSection =
    sections.find((s) => s.key === selectedSectionKey) ?? sections[0] ?? null;
  const pages = activeSection?.docs ?? [];

  function startRename(folder: Folder) {
    setEditingFolderId(folder.id);
    setEditName(folder.name);
  }

  function commitRename() {
    if (!editingFolderId) return;
    const name = editName.trim();
    if (name) onRenameFolder(editingFolderId, name);
    setEditingFolderId(null);
  }

  async function commitCreateFolder() {
    const name = newFolderName.trim();
    if (!name || creatingBusy) {
      if (!name) {
        setCreatingFolder(false);
        setNewFolderName("");
      }
      return;
    }
    setCreatingBusy(true);
    try {
      await onAddFolder(name);
      setCreatingFolder(false);
      setNewFolderName("");
    } catch {
      // Parent surfaces the error banner; keep the input open for retry.
    } finally {
      setCreatingBusy(false);
    }
  }

  return (
    <aside
      dir="rtl"
      className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-black/5 md:w-[26%] md:flex-none"
    >
      <header className="shrink-0 border-b border-surface-200 px-5 py-4">
        <h2 className="text-center text-base font-semibold text-surface-900">
          Virtual TAU מסמכים
        </h2>
      </header>

      {loading && folders.length === 0 && documents.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-surface-500">
          <Spinner size="sm" />
          טוען…
        </p>
      ) : (
        /* RTL: first child = right (folders), second = left (pages) */
        <div className="flex min-h-0 flex-1">
          {/* Sections (folders) — right */}
          <div className="flex w-1/2 min-w-0 flex-col border-e border-surface-200">
            {creatingFolder ? (
              <div className="shrink-0 px-3 py-2">
                <input
                  autoFocus
                  dir="rtl"
                  value={newFolderName}
                  disabled={creatingBusy}
                  placeholder="שם הנושא"
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={() => void commitCreateFolder()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitCreateFolder();
                    }
                    if (e.key === "Escape") {
                      setCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  className="w-full border-0 bg-white px-3 py-2 text-right text-sm outline-none ring-1 ring-sky-300 disabled:opacity-60"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCreatingFolder(true);
                  setNewFolderName("");
                  setEditingFolderId(null);
                }}
                className="flex shrink-0 items-center justify-start gap-1.5 px-5 py-3.5 text-sm font-medium text-[#80397B] hover:bg-black/[0.03]"
              >
                <span className="text-base leading-none">+</span>
                הוספת נושא
              </button>
            )}
            <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
              {sections.map((section) => {
                const selected = section.key === activeSection?.key;
                const folder =
                  section.folderId != null
                    ? folders.find((f) => f.id === section.folderId)
                    : null;
                const isEditing =
                  folder != null && editingFolderId === folder.id;

                return (
                  <li key={section.key} className="group relative">
                    <div
                      className={`flex items-stretch ${
                        selected ? "bg-[#e5e5e5]" : "hover:bg-[#ebebeb]"
                      }`}
                    >
                      {/* First in RTL = outer (right) edge tab */}
                      <span
                        className="my-1.5 me-2 w-1.5 shrink-0 self-stretch rounded-e-full"
                        style={{ backgroundColor: section.color }}
                        aria-hidden
                      />
                      {isEditing && folder ? (
                        <input
                          autoFocus
                          dir="rtl"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditingFolderId(null);
                          }}
                          className="min-w-0 flex-1 border-0 bg-white px-4 py-3 text-right text-sm outline-none ring-1 ring-sky-300"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedSectionKey(section.key)}
                          onDoubleClick={() => {
                            if (folder) startRename(folder);
                          }}
                          className="min-w-0 flex-1 truncate px-4 py-3 text-right text-sm text-surface-800"
                        >
                          {section.name}
                        </button>
                      )}
                      {folder ? (
                        <div className="flex shrink-0 items-center gap-0.5 ps-2 pe-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startRename(folder)}
                            className="rounded px-1 py-0.5 text-xs text-surface-500 hover:bg-white"
                            title="שינוי שם"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `למחוק את הנושא "${folder.name}"? המסמכים יועברו ללא תיקייה.`
                                )
                              ) {
                                onDeleteFolder(folder.id);
                                if (selectedSectionKey === folder.id) {
                                  setSelectedSectionKey(UNFILED_KEY);
                                }
                              }
                            }}
                            className="rounded px-1 py-0.5 text-xs text-surface-500 hover:bg-rose-50 hover:text-rose-800"
                            title="מחיקת נושא"
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Pages (documents) — left */}
          <div className="flex w-1/2 min-w-0 flex-col">
            <button
              type="button"
              onClick={() =>
                onAddDocument(activeSection?.folderId ?? null)
              }
              className="flex shrink-0 items-center justify-start gap-1.5 px-5 py-3.5 text-sm font-medium text-[#80397B] hover:bg-black/[0.03]"
            >
              <span className="text-base leading-none">+</span>
              הוספת עמוד
            </button>
            <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
              {pages.length === 0 ? (
                <li className="px-5 py-3 text-right text-sm text-surface-400">
                  אין עמודים בנושא זה
                </li>
              ) : (
                pages.map((doc) => {
                  const selected = selectedId === doc.id;
                  return (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(doc.id)}
                        className={`w-full truncate px-5 py-3 text-right text-sm transition-colors ${
                          selected
                            ? "bg-[#e5e5e5] font-medium text-surface-900"
                            : "text-surface-700 hover:bg-[#ebebeb]"
                        }`}
                      >
                        {doc.title || "ללא כותרת"}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
}
