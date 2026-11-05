import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { Button, Input, Spinner } from "@workspace/ui";
import {
  bodyToEditorHtml,
  DOC_BODY_CLASS,
  editorHtmlToBody,
  sanitizeDocHtml,
} from "../lib/docHtml";
import { uploadPastedImage } from "../lib/docImages";
import type { Document, Folder } from "../lib/types";

interface DocEditorProps {
  initial: Document | null;
  folders: Folder[];
  folderId: string | null;
  busy?: boolean;
  deleting?: boolean;
  error?: string | null;
  onSave: (input: {
    title: string;
    body: string;
    folderId: string | null;
  }) => void | Promise<void>;
  onCancel: () => void;
  /** Shown only when editing an existing document. */
  onDelete?: () => void;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  const mime = match[1]!.toLowerCase();
  const b64 = match[2]!;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function extractImageBlob(data: DataTransfer | null): Blob | null {
  if (!data) return null;

  if (data.files && data.files.length > 0) {
    for (let i = 0; i < data.files.length; i += 1) {
      const file = data.files[i]!;
      if (
        file.type.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp)$/i.test(file.name)
      ) {
        return file;
      }
    }
  }

  if (data.items) {
    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i]!;
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }

  return null;
}

async function replaceDataImagesWithUploads(html: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("data:image/")) continue;
    const blob = dataUrlToBlob(src);
    if (!blob) continue;
    const result = await uploadPastedImage(blob);
    if (result.ok && result.publicUrl) {
      img.setAttribute("src", result.publicUrl);
    } else {
      img.remove();
    }
  }
  return root.innerHTML;
}

export function DocEditor({
  initial,
  folders,
  folderId: initialFolderId,
  busy,
  deleting,
  error,
  onSave,
  onCancel,
  onDelete,
}: DocEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [folderId, setFolderId] = useState<string | null>(
    initial?.folderId ?? initialFolderId
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const id = initial?.id ?? null;
    if (initialIdRef.current === id && editorRef.current) return;
    initialIdRef.current = id;
    setTitle(initial?.title ?? "");
    setFolderId(initial?.folderId ?? initialFolderId);
    setUploadError(null);
    if (editorRef.current) {
      editorRef.current.innerHTML = bodyToEditorHtml(initial?.body ?? "");
    }
  }, [initial?.id, initial?.title, initial?.body, initial?.folderId, initialFolderId]);

  const insertHtmlAtCursor = useCallback((html: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const ok = document.execCommand("insertHTML", false, html);
    if (!ok) {
      el.innerHTML = `${el.innerHTML}${html}`;
    }
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const data = e.clipboardData;
      if (!data) return;

      const imageBlob = extractImageBlob(data);
      const html = data.getData("text/html");
      const plain = data.getData("text/plain");

      const htmlLooksLikeDocs =
        Boolean(html) &&
        (/<p[\s>]/i.test(html) ||
          /<li[\s>]/i.test(html) ||
          /<h[1-6][\s>]/i.test(html) ||
          /font-weight/i.test(html) ||
          /docs-internal/i.test(html) ||
          /urn:schemas-microsoft/i.test(html));

      if (imageBlob && !htmlLooksLikeDocs) {
        e.preventDefault();
        setUploading(true);
        setUploadError(null);
        void (async () => {
          try {
            const result = await uploadPastedImage(imageBlob);
            if (!result.ok || !result.publicUrl) {
              setUploadError(
                result.skipped
                  ? "Supabase לא מוגדר — לא ניתן להעלות תמונות."
                  : result.message ?? "העלאת התמונה נכשלה"
              );
              return;
            }
            insertHtmlAtCursor(
              `<img src="${result.publicUrl}" alt="" loading="lazy" />`
            );
          } finally {
            setUploading(false);
          }
        })();
        return;
      }

      if (htmlLooksLikeDocs && html) {
        e.preventDefault();
        setUploading(true);
        setUploadError(null);
        void (async () => {
          try {
            let cleaned = sanitizeDocHtml(html, { collapseWhitespace: true });
            cleaned = await replaceDataImagesWithUploads(cleaned);
            if (!cleaned.trim() && plain.trim()) {
              cleaned = sanitizeDocHtml(
                plain
                  .split(/\n{2,}/)
                  .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
                  .join("")
              );
            }
            insertHtmlAtCursor(cleaned);
          } finally {
            setUploading(false);
          }
        })();
        return;
      }

      if (plain && !htmlLooksLikeDocs) {
        e.preventDefault();
        const escaped = plain
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const asHtml = escaped
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join("");
        insertHtmlAtCursor(asHtml);
      }
    },
    [insertHtmlAtCursor]
  );

  const handleSave = useCallback(() => {
    const body = editorHtmlToBody(editorRef.current?.innerHTML ?? "");
    void onSave({ title, body, folderId });
  }, [onSave, title, folderId]);

  const onEditorInput = useCallback((_e: FormEvent<HTMLDivElement>) => {}, []);

  const canSave = title.trim().length > 0 && !busy && !uploading;

  const saveLabel = busy ? (
    <span className="inline-flex items-center gap-2">
      <Spinner size="sm" />
      שומר…
    </span>
  ) : (
    "שמירה"
  );

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-surface-900">
          {initial ? "עריכת מסמך" : "מסמך חדש"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {initial && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy || deleting}
              title="מחיקת מסמך"
              aria-label="מחיקת מסמך"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {deleting ? (
                <Spinner size="sm" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              )}
            </button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy || deleting}
          >
            ביטול
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave || deleting}
            onClick={handleSave}
          >
            {saveLabel}
          </Button>
        </div>
      </header>

      <Input
        label="כותרת"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="לדוגמה: איפוס סיסמה"
        disabled={busy}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-surface-800">תיקייה</label>
        <select
          dir="rtl"
          value={folderId ?? ""}
          onChange={(e) =>
            setFolderId(e.target.value ? e.target.value : null)
          }
          disabled={busy}
          className="rounded-control border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
        >
          <option value="">ללא תיקייה</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-surface-800">
          תוכן המסמך
        </label>
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline
          aria-label="תוכן המסמך"
          contentEditable={!busy && !uploading}
          suppressContentEditableWarning
          dir="rtl"
          onPaste={handlePaste}
          onInput={onEditorInput}
          className={`min-h-[16rem] w-full rounded-control border border-surface-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 overflow-x-hidden ${DOC_BODY_CLASS}`}
        />
        {uploading ? (
          <p className="inline-flex items-center gap-2 text-xs text-surface-600">
            <Spinner size="sm" />
            מעבד הדבקה…
          </p>
        ) : null}
        {uploadError ? (
          <p className="text-xs text-danger">{uploadError}</p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>

      <div className="flex justify-end border-t border-surface-200 pt-4">
        <Button
          variant="primary"
          size="sm"
          disabled={!canSave || deleting}
          onClick={handleSave}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
