import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import type { CourseViewMode, TextProps } from "../../lib/types";
import {
  isTextHtmlEmpty,
  resolveTextHtml,
  sanitizeTextHtml,
  textProseClass,
} from "../../lib/textHtml";
import { LinkIcon, UnlinkIcon } from "../icons";
import "./textBlock.css";

interface Props {
  props: TextProps;
  mode: CourseViewMode;
  onChange: (props: TextProps) => void;
}

const toolbarBtn =
  "inline-flex items-center justify-center min-w-8 px-2 h-8 text-sm font-semibold rounded border border-transparent " +
  "text-surface-700 hover:bg-surface-100 disabled:opacity-40 disabled:pointer-events-none";

const toolbarBtnActive = "bg-surface-200 border-surface-300 text-surface-900";

function TextToolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("כתובת קישור", previous ?? "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mb-2 pb-2 border-b border-surface-200">
      <button
        type="button"
        title="מודגש"
        className={`${toolbarBtn} ${editor.isActive("bold") ? toolbarBtnActive : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </button>
      <button
        type="button"
        title="H1"
        className={`${toolbarBtn} ${editor.isActive("heading", { level: 1 }) ? toolbarBtnActive : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </button>
      <button
        type="button"
        title="H2"
        className={`${toolbarBtn} ${editor.isActive("heading", { level: 2 }) ? toolbarBtnActive : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        title="קישור"
        aria-label="קישור"
        className={`${toolbarBtn} ${editor.isActive("link") ? toolbarBtnActive : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={setLink}
      >
        <LinkIcon />
      </button>
      {editor.isActive("link") && (
        <button
          type="button"
          title="הסרת קישור"
          aria-label="הסרת קישור"
          className={toolbarBtn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <UnlinkIcon />
        </button>
      )}
    </div>
  );
}

function TextEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (props: TextProps) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        bold: {},
        paragraph: {},
        hardBreak: {},
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        // StarterKit v3 bundles Link — disable so our configured Link is the only one.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Placeholder.configure({
        placeholder: "כתבו כאן את תוכן הטקסט...",
      }),
    ],
    content: initialHtml || "",
    editorProps: {
      attributes: {
        class: `${textProseClass} min-h-[1.5rem] outline-none`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const raw = ed.getHTML();
      const html = isTextHtmlEmpty(raw) ? "" : sanitizeTextHtml(raw);
      onChange({ html });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = initialHtml || "";
    const current = editor.getHTML();
    if (sanitizeTextHtml(current) === sanitizeTextHtml(next)) return;
    if (isTextHtmlEmpty(current) && isTextHtmlEmpty(next)) return;
    // Avoid clobbering while the user is typing — only sync when external value differs meaningfully.
    if (document.activeElement?.closest(".ProseMirror") === editor.view.dom) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, initialHtml]);

  if (!editor) return null;

  return (
    <div className="text-block-editor">
      <TextToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function TextBlock({ props, mode, onChange }: Props) {
  const html = resolveTextHtml(props);

  if (mode !== "edit") {
    if (isTextHtmlEmpty(html)) {
      return <p className="text-base text-surface-400">אין תוכן</p>;
    }
    return (
    <div
      className={`${textProseClass}`}
      dangerouslySetInnerHTML={{ __html: sanitizeTextHtml(html) }}
    />
  );
  }

  return (
    <TextEditor
      initialHtml={sanitizeTextHtml(html)}
      onChange={onChange}
    />
  );
}
