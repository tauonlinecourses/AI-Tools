import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, Input } from "@workspace/ui";
import {
  COMPONENT_BANK,
  renderComponentHtml,
  type ComponentBankFields,
  type ComponentBankItem,
} from "../data/componentBank";

/** Set true to show the raw HTML editor pane again. */
const SHOW_HTML_SCRIPT_SECTION = false;

export function ComponentBankPanel() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-surface-900">
          בנק רכיבים
        </h2>
        <p className="text-sm leading-relaxed text-surface-600">
          עדכנו את הקישור ואת הטקסט, בדקו בתצוגה המקדימה, ואז העתיקו את ה־HTML.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {COMPONENT_BANK.map((item) => (
          <li key={item.id}>
            <ComponentSection item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComponentSection({ item }: { item: ComponentBankItem }) {
  const [fields, setFields] = useState<ComponentBankFields>(item.fields);
  const [copied, setCopied] = useState(false);

  const html = useMemo(
    () => renderComponentHtml(item.html, fields),
    [item.html, fields],
  );
  const editables = [fields.href, fields.text];
  const highlightedCode = useMemo(
    () => highlightEditables(html, editables),
    [html, editables],
  );

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function updateField<K extends keyof ComponentBankFields>(
    key: K,
    value: ComponentBankFields[K],
  ) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="overflow-hidden rounded-control border border-surface-200 bg-surface-50">
      <header className="flex items-start justify-between gap-3 border-b border-surface-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-surface-900">
            {item.title}
          </h3>
          {item.description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-surface-500">
              {item.description}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant={copied ? "secondary" : "primary"}
          onClick={handleCopy}
          aria-label={copied ? "הועתק" : `העתק HTML של ${item.title}`}
        >
          {copied ? "הועתק" : "העתק HTML"}
        </Button>
      </header>

      <div
        className={`grid items-stretch ${
          SHOW_HTML_SCRIPT_SECTION ? "grid-cols-3" : "grid-cols-2"
        }`}
        dir="ltr"
      >
        <div
          className="flex min-w-0 flex-col gap-2 border-e border-surface-200 p-4"
          dir="rtl"
        >
          <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-surface-500">
            תצוגה מקדימה
          </p>
          <div
            className="flex min-h-[7.5rem] flex-1 items-center justify-center overflow-auto rounded-control border border-dashed border-surface-300 bg-white p-4"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 p-4" dir="rtl">
          <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-surface-500">
            הגדרות
          </p>
          <Input
            id={`${item.id}-href`}
            label="קישור הכפתור"
            dir="ltr"
            className="text-left"
            value={fields.href}
            onChange={(e) => updateField("href", e.target.value)}
            placeholder="/example_page"
          />
          <Input
            id={`${item.id}-text`}
            label="טקסט הכפתור"
            value={fields.text}
            onChange={(e) => updateField("text", e.target.value)}
            placeholder="להרשמה לסדנה"
          />
        </div>

        {/* Kept in the tree but hidden. Flip SHOW_HTML_SCRIPT_SECTION to restore. */}
        <div
          className={`min-w-0 flex-col gap-2 border-s border-surface-200 p-4 ${
            SHOW_HTML_SCRIPT_SECTION ? "flex" : "hidden"
          }`}
        >
          <p className="shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-surface-500">
            HTML (ניתן לעריכה)
          </p>
          <EditableHtmlCode
            html={html}
            highlighted={highlightedCode}
            onChange={(next) => {
              // Raw HTML edits are disabled while the pane is hidden; keep handler for restore.
              void next;
            }}
            ariaLabel={`עריכת HTML של ${item.title}`}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Highlighted read view by default; click to edit in a normal textarea.
 * Avoids stacking a transparent textarea over highlighted text (which caused
 * the smeared/doubled look).
 */
function EditableHtmlCode({
  html,
  highlighted,
  onChange,
  ariaLabel,
}: {
  html: string;
  highlighted: ReactNode;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const boxRef = useRef<HTMLPreElement>(null);
  const [editMinHeight, setEditMinHeight] = useState<number | undefined>();

  function startEditing() {
    setEditMinHeight(boxRef.current?.offsetHeight);
    setEditing(true);
  }

  const boxClass =
    "min-h-[7.5rem] w-full flex-1 rounded-control border bg-white p-3 text-left font-mono text-xs leading-relaxed text-surface-800";

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={html}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        spellCheck={false}
        aria-label={ariaLabel}
        style={editMinHeight ? { minHeight: editMinHeight } : undefined}
        className={`${boxClass} resize-none border-surface-400 outline-none`}
        dir="ltr"
      />
    );
  }

  return (
    <pre
      ref={boxRef}
      role="button"
      tabIndex={0}
      title="לחצו לעריכה"
      aria-label={ariaLabel}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEditing();
        }
      }}
      className={`${boxClass} cursor-text overflow-auto border-surface-200 hover:border-surface-400`}
      dir="ltr"
    >
      <code className="whitespace-pre-wrap break-all">{highlighted}</code>
    </pre>
  );
}

/** Wrap `editables` substrings in a light-blue mark for display only. */
function highlightEditables(html: string, editables: string[]): ReactNode {
  const needles = [...new Set(editables.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (needles.length === 0) return html;

  const parts: ReactNode[] = [];
  let remaining = html;
  let key = 0;

  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestNeedle = "";

    for (const needle of needles) {
      const index = remaining.indexOf(needle);
      if (index === -1) continue;
      if (
        bestIndex === -1 ||
        index < bestIndex ||
        (index === bestIndex && needle.length > bestNeedle.length)
      ) {
        bestIndex = index;
        bestNeedle = needle;
      }
    }

    if (bestIndex === -1 || !bestNeedle) {
      parts.push(<Fragment key={key++}>{remaining}</Fragment>);
      break;
    }

    if (bestIndex > 0) {
      parts.push(
        <Fragment key={key++}>{remaining.slice(0, bestIndex)}</Fragment>,
      );
    }

    parts.push(
      <mark
        key={key++}
        className="rounded-sm px-0.5 text-inherit"
        style={{ backgroundColor: "#b8e8ff", color: "inherit" }}
        title="ניתן לשינוי"
      >
        {bestNeedle}
      </mark>,
    );

    remaining = remaining.slice(bestIndex + bestNeedle.length);
  }

  return parts;
}
