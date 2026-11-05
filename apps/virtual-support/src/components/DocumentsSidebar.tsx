import { useEffect, useMemo, useRef, useState } from "react";
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

function MoreVerticalIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

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
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFolderId) return;
    function onDocPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFolderId(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuFolderId(null);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuFolderId]);

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
                  setMenuFolderId(null);
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
                        <div
                          className={`relative flex shrink-0 items-center ps-1 pe-2 ${
                            menuFolderId === folder.id
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                          }`}
                          ref={menuFolderId === folder.id ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            aria-label="תפריט נושא"
                            aria-haspopup="menu"
                            aria-expanded={menuFolderId === folder.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuFolderId((id) =>
                                id === folder.id ? null : folder.id
                              );
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-surface-500 hover:bg-white hover:text-surface-800"
                          >
                            <MoreVerticalIcon />
                          </button>
                          {menuFolderId === folder.id ? (
                            <div
                              role="menu"
                              className="absolute end-1 top-full z-20 mt-1 min-w-[9.5rem] rounded-lg border border-surface-200 bg-white p-1 shadow-md shadow-black/10"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMenuFolderId(null);
                                  startRename(folder);
                                }}
                                className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-right text-xs font-medium text-surface-700 hover:bg-surface-50"
                              >
                                <PencilIcon className="h-3.5 w-3.5 shrink-0" />
                                שינוי שם
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMenuFolderId(null);
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
                                className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-right text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                <TrashIcon className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                                מחיקה
                              </button>
                            </div>
                          ) : null}
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
