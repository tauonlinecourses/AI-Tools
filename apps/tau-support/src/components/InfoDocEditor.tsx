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
  editorHtmlToBody,
  sanitizeInfoDocHtml,
} from "../lib/infoDocHtml";
import { uploadPastedImage } from "../lib/infoDocImages";
import type { InfoDoc } from "../lib/infoDocs";
import { FORUM_BODY_CLASS } from "../lib/forumBody";

interface InfoDocEditorProps {
  /** null = creating a new topic */
  initial: InfoDoc | null;
  busy?: boolean;
  error?: string | null;
  onSave: (input: {
    title: string;
    body: string;
    commonQuestions: string[];
  }) => void | Promise<void>;
  onCancel: () => void;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
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
        /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)
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

export function InfoDocEditor({
  initial,
  busy,
  error,
  onSave,
  onCancel,
}: InfoDocEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [commonQuestions, setCommonQuestions] = useState<string[]>(
    initial?.commonQuestions?.length ? [...initial.commonQuestions] : [""]
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialIdRef = useRef<string | null | undefined>(undefined);

  // Seed contenteditable only when switching topics (not on every keystroke).
  useEffect(() => {
    const id = initial?.id ?? null;
    if (initialIdRef.current === id && editorRef.current) return;
    initialIdRef.current = id;
    setTitle(initial?.title ?? "");
    setCommonQuestions(
      initial?.commonQuestions?.length ? [...initial.commonQuestions] : [""]
    );
    setUploadError(null);
    if (editorRef.current) {
      editorRef.current.innerHTML = bodyToEditorHtml(initial?.body ?? "");
    }
  }, [initial?.id, initial?.title, initial?.body, initial?.commonQuestions]);

  const updateCommonQuestion = useCallback((index: number, value: string) => {
    setCommonQuestions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addCommonQuestion = useCallback(() => {
    setCommonQuestions((prev) => [...prev, ""]);
  }, []);

  const removeCommonQuestion = useCallback((index: number) => {
    setCommonQuestions((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }, []);

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

      // Pure image paste (screenshot) — no meaningful Docs HTML.
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
            let cleaned = sanitizeInfoDocHtml(html);
            cleaned = await replaceDataImagesWithUploads(cleaned);
            if (!cleaned.trim() && plain.trim()) {
              cleaned = sanitizeInfoDocHtml(
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

      // Plain text: preserve newlines as paragraphs/breaks.
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
    void onSave({ title, body, commonQuestions });
  }, [onSave, title, commonQuestions]);

  // Prevent contenteditable from nesting in accidental form submits.
  const onEditorInput = useCallback((_e: FormEvent<HTMLDivElement>) => {
    // no-op: we read innerHTML on save
  }, []);

  const canSave = title.trim().length > 0 && !busy && !uploading;

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-surface-900">
          {initial ? "עריכת נושא" : "נושא חדש"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            ביטול
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={handleSave}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                שומר…
              </span>
            ) : (
              "שמור"
            )}
          </Button>
        </div>
      </header>

      <Input
        label="כותרת הנושא"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="לדוגמה: איפוס סיסמה"
        disabled={busy}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-surface-800">
          דוגמאות לשאלות
          <span className="ms-2 font-normal text-surface-500">
            חשוב למלא כדי שהמערכת תדע להתאים שאלה לתשובה
          </span>
        </label>
        <div className="flex flex-col gap-2">
          {commonQuestions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                dir="rtl"
                value={q}
                onChange={(e) => updateCommonQuestion(i, e.target.value)}
                placeholder={`לדוגמה: למה הסרטונים לא עובדים?`}
                disabled={busy}
                className="min-w-0 flex-1 rounded-control border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => removeCommonQuestion(i)}
                disabled={busy || (commonQuestions.length === 1 && !q.trim())}
                className="shrink-0 rounded-control border border-surface-200 px-2 py-2 text-xs text-surface-600 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-40"
                title="הסר שאלה"
              >
                הסר
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCommonQuestion}
            disabled={busy}
            className="self-start rounded-control border border-dashed border-surface-300 px-2.5 py-1.5 text-xs font-semibold text-surface-700 hover:bg-sky-50 hover:text-sky-950 disabled:opacity-40"
          >
            + הוסף שאלה נפוצה
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <label className="text-sm font-medium text-surface-800">
          תוכן
          <span className="ms-2 font-normal text-surface-500">
            (הדביקו מ־Docs / Word עם Ctrl+V — כולל כותרות, הדגשות ורשימות)
          </span>
        </label>
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline
          aria-label="תוכן הנושא"
          contentEditable={!busy && !uploading}
          suppressContentEditableWarning
          dir="rtl"
          onPaste={handlePaste}
          onInput={onEditorInput}
          className={`min-h-[16rem] w-full flex-1 overflow-y-auto rounded-control border border-surface-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60 ${FORUM_BODY_CLASS} [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mt-2 [&_h4]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pe-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pe-5 [&_li]:my-0.5 [&_strong]:font-bold [&_b]:font-bold`}
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
    </div>
  );
}
