import { useMemo, useState } from "react";
import { Spinner } from "@workspace/ui";
import type { Document, Folder } from "../lib/types";

interface DocumentsSidebarProps {
  folders: Folder[];
  documents: Document[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAddDocument: (folderId: string | null) => void;
  onAddFolder: () => void;
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const byFolder = useMemo(() => {
    const map = new Map<string | null, Document[]>();
    map.set(null, []);
    for (const f of folders) map.set(f.id, []);
    for (const d of documents) {
      const key = d.folderId && map.has(d.folderId) ? d.folderId : null;
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [folders, documents]);

  const unfiled = byFolder.get(null) ?? [];

  function toggleFolder(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

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

  return (
    <aside
      dir="rtl"
      className="relative z-10 flex w-full shrink-0 flex-col border-surface-200 bg-white md:w-[34%] md:border-e md:shadow-[-3px_0_4px_-2px_rgba(0,0,0,0.12)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-200 px-3 py-2.5">
        <p className="text-sm font-semibold text-surface-900">מסמכים</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAddFolder}
            className="inline-flex h-8 items-center gap-1 rounded-control border border-surface-200 bg-white px-2.5 text-xs font-semibold text-surface-800 shadow-sm transition-colors hover:bg-sky-50 hover:text-sky-950"
            title="תיקייה חדשה"
          >
            + תיקייה
          </button>
          <button
            type="button"
            onClick={() => onAddDocument(null)}
            className="inline-flex h-8 items-center gap-1 rounded-control border border-surface-200 bg-white px-2.5 text-xs font-semibold text-surface-800 shadow-sm transition-colors hover:bg-sky-50 hover:text-sky-950"
            title="מסמך חדש"
          >
            + מסמך
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && folders.length === 0 && documents.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-surface-500">
            <Spinner size="sm" />
            טוען…
          </p>
        ) : null}

        {!loading && folders.length === 0 && documents.length === 0 ? (
          <p className="px-3 py-4 text-right text-sm text-surface-500">
            אין מסמכים עדיין. צרו תיקייה או מסמך חדש.
          </p>
        ) : null}

        <ul>
          {folders.map((folder) => {
            const docs = byFolder.get(folder.id) ?? [];
            const isCollapsed = collapsed[folder.id];
            return (
              <li
                key={folder.id}
                className="border-b border-surface-200 last:border-b-0"
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleFolder(folder.id)}
                    className="shrink-0 rounded px-1 text-xs text-surface-500 hover:bg-surface-50"
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? "◀" : "▼"}
                  </button>
                  {editingFolderId === folder.id ? (
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
                      className="min-w-0 flex-1 rounded-control border border-sky-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      className="min-w-0 flex-1 truncate text-start text-sm font-semibold text-surface-800"
                    >
                      {folder.name}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAddDocument(folder.id)}
                    className="shrink-0 rounded px-1.5 text-xs text-surface-500 hover:bg-sky-50 hover:text-sky-900"
                    title="מסמך בתיקייה"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(folder)}
                    className="shrink-0 rounded px-1.5 text-xs text-surface-500 hover:bg-surface-50"
                    title="שינוי שם"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `למחוק את התיקייה "${folder.name}"? המסמכים יועברו ללא תיקייה.`
                        )
                      ) {
                        onDeleteFolder(folder.id);
                      }
                    }}
                    className="shrink-0 rounded px-1.5 text-xs text-surface-500 hover:bg-rose-50 hover:text-rose-800"
                    title="מחיקת תיקייה"
                  >
                    ×
                  </button>
                </div>
                {!isCollapsed ? (
                  <ul className="pb-1">
                    {docs.length === 0 ? (
                      <li className="px-8 py-1 text-xs text-surface-400">
                        אין מסמכים
                      </li>
                    ) : (
                      docs.map((doc) => (
                        <DocRow
                          key={doc.id}
                          doc={doc}
                          selected={selectedId === doc.id}
                          onSelect={onSelect}
                        />
                      ))
                    )}
                  </ul>
                ) : null}
              </li>
            );
          })}

          {(unfiled.length > 0 || folders.length > 0) && (
            <li className="border-b border-surface-200 last:border-b-0">
              <p className="px-3 py-2 text-xs font-semibold text-surface-500">
                ללא תיקייה
              </p>
              <ul className="pb-1">
                {unfiled.length === 0 ? (
                  <li className="px-8 py-1 text-xs text-surface-400">
                    אין מסמכים
                  </li>
                ) : (
                  unfiled.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      selected={selectedId === doc.id}
                      onSelect={onSelect}
                    />
                  ))
                )}
              </ul>
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}

function DocRow({
  doc,
  selected,
  onSelect,
}: {
  doc: Document;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(doc.id)}
        className={`w-full truncate px-8 py-1.5 text-start text-sm transition-colors ${
          selected
            ? "bg-sky-50 font-semibold text-sky-950"
            : "text-surface-700 hover:bg-surface-50"
        }`}
      >
        {doc.title || "ללא כותרת"}
      </button>
    </li>
  );
}
