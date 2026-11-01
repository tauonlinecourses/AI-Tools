import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import type { CourseViewMode, TextProps } from "../../lib/types";
import {
  isTextHtmlEmpty,
  resolveTextHtml,
  sanitizeTextHtml,
  TEXT_COLORS,
  textProseClass,
} from "../../lib/textHtml";
import { TextDirection } from "../../lib/textDirection";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BulletListIcon,
  LinkIcon,
  OrderedListIcon,
  UnlinkIcon,
} from "../icons";
import "./textBlock.css";

interface Props {
  props: TextProps;
  mode: CourseViewMode;
  onChange: (props: TextProps) => void;
}

const toolbarBtn =
  "inline-flex shrink-0 items-center justify-center w-9 h-9 text-base font-semibold rounded border border-transparent " +
  "text-surface-700 hover:bg-surface-100 disabled:opacity-40 disabled:pointer-events-none";

const toolbarBtnActive = "bg-surface-200 border-surface-300 text-surface-900";

const toolbarSep = "w-px h-6 bg-surface-200 mx-0.5 shrink-0 self-center";

function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
  className = "",
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`${toolbarBtn} ${active ? toolbarBtnActive : ""} ${className}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TextToolbar({ editor }: { editor: Editor }) {
  const [colorOpen, setColorOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement>(null);
  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) ?? "";

  useEffect(() => {
    if (!colorOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!colorWrapRef.current?.contains(e.target as Node)) setColorOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [colorOpen]);

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
    <div className="w-full flex flex-col gap-1 mb-0 pb-1.5 border-b border-surface-200" dir="rtl">
      <div className="w-full flex flex-wrap items-center gap-0.5">
        <ToolbarButton
          title="בטל"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          title="בצע שוב"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </ToolbarButton>
        <span className={toolbarSep} aria-hidden />
        <ToolbarButton
          title="מודגש"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="נטוי"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic font-serif">I</span>
        </ToolbarButton>
        <ToolbarButton
          title="קו תחתון"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <div className="relative shrink-0" ref={colorWrapRef}>
          <ToolbarButton
            title="צבע טקסט"
            active={Boolean(currentColor) || colorOpen}
            onClick={() => setColorOpen((o) => !o)}
          >
            <span className="flex flex-col items-center leading-none gap-0.5">
              <span className="text-sm font-bold">A</span>
              <span
                className="block w-4 h-0.5 rounded-sm"
                style={{ backgroundColor: currentColor || "#111827" }}
              />
            </span>
          </ToolbarButton>
          {colorOpen && (
            <div className="text-color-popover" role="listbox" aria-label="צבע טקסט">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  className={`w-7 h-7 rounded border ${
                    currentColor.toLowerCase() === c.value.toLowerCase()
                      ? "border-surface-900 ring-1 ring-surface-400"
                      : "border-surface-200"
                  }`}
                  style={{ backgroundColor: c.value }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c.value).run();
                    setColorOpen(false);
                  }}
                />
              ))}
              <button
                type="button"
                title="נקה צבע"
                className="inline-flex items-center justify-center w-full mt-0.5 h-8 text-sm font-semibold rounded border border-transparent text-surface-700 hover:bg-surface-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setColorOpen(false);
                }}
              >
                נקה
              </button>
            </div>
          )}
        </div>
        <span className={toolbarSep} aria-hidden />
        <ToolbarButton
          title="H1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="H2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton title="קישור" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton
            title="הסרת קישור"
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <UnlinkIcon />
          </ToolbarButton>
        )}
        <span className={toolbarSep} aria-hidden />
        <ToolbarButton
          title="יישור לימין"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRightIcon className="w-5 h-5" />
        </ToolbarButton>
        <ToolbarButton
          title="יישור למרכז"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenterIcon className="w-5 h-5" />
        </ToolbarButton>
        <ToolbarButton
          title="יישור לשמאל"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeftIcon className="w-5 h-5" />
        </ToolbarButton>
        <span className={toolbarSep} aria-hidden />
        <ToolbarButton
          title="כיוון מימין לשמאל"
          active={editor.isActive({ dir: "rtl" })}
          onClick={() => editor.chain().focus().setTextDirection("rtl").run()}
        >
          ¶‹
        </ToolbarButton>
        <ToolbarButton
          title="כיוון משמאל לימין"
          active={editor.isActive({ dir: "ltr" })}
          onClick={() => editor.chain().focus().setTextDirection("ltr").run()}
        >
          ›¶
        </ToolbarButton>
        <span className={toolbarSep} aria-hidden />
        <ToolbarButton
          title="רשימת תבליטים"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <BulletListIcon className="w-5 h-5" />
        </ToolbarButton>
        <ToolbarButton
          title="רשימה ממוספרת"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <OrderedListIcon className="w-5 h-5" />
        </ToolbarButton>
      </div>
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
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        bold: {},
        italic: {},
        paragraph: {},
        hardBreak: {},
        bulletList: {},
        orderedList: {},
        listItem: {},
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        // StarterKit v3 bundles Link — disable so our configured Link is the only one.
        link: false,
      }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
      }),
      TextDirection,
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
    <div className="text-block-editor w-full">
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

  return <TextEditor initialHtml={sanitizeTextHtml(html)} onChange={onChange} />;
}
