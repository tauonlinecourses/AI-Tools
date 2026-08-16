import { useEffect, useRef, useState } from "react";
import { Button } from "@workspace/ui";
import type {
  CommentAuthorRole,
  ComponentComment,
  CourseViewMode,
} from "../lib/types";
import {
  COMMENT_AUTHOR_COLOR,
  COMMENT_AUTHOR_LABEL,
} from "../lib/types";
import { CommentIcon, CheckCircleIcon, TrashIcon, XIcon } from "./icons";

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function unresolvedCount(comments: ComponentComment[]): number {
  return comments.filter((c) => !c.resolved_at).length;
}

/** Small corner badge on the top-right of the comment icon. */
function CommentCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-0.5 -right-1 min-w-[0.875rem] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-[#0F6CBF] text-white text-[9px] font-bold leading-none tabular-nums pointer-events-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface BlockCommentsProps {
  componentId: string;
  comments: ComponentComment[];
  mode: CourseViewMode;
  open: boolean;
  onToggle: () => void;
  onAdd: (body: string) => Promise<void>;
  onSetResolved: (commentId: string, resolved: boolean) => Promise<void>;
  /** Only allowed when current mode matches the comment's author_role. */
  onDelete: (commentId: string) => Promise<void>;
  /** Children = the block card / preview content. */
  children: React.ReactNode;
}

/**
 * Comment icon outside the block (visual right) + Word-style closable thread panel.
 * The block stays full-width of the page column. When closed, the icon sits in the
 * start gutter; when open, the panel aligns to the block top and the icon moves
 * into the panel header.
 */
export function BlockComments({
  comments,
  mode,
  open,
  onToggle,
  onAdd,
  onSetResolved,
  onDelete,
  children,
}: BlockCommentsProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const unresolved = unresolvedCount(comments);
  const hasAny = comments.length > 0;

  const iconOpacity = !hasAny
    ? "opacity-25 hover:opacity-60"
    : unresolved > 0
      ? "opacity-100"
      : "opacity-70 hover:opacity-100";

  const iconTop = mode === "review" ? "top-0.5" : "top-2";

  const iconTitle =
    unresolved > 0
      ? `${unresolved} הערות פתוחות`
      : hasAny
        ? "הערות (כולן נפתרו)"
        : "הוסף הערה";

  // Default to bottom so the latest comments (and composer) are in view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, comments.length]);

  async function handleAdd() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      await onAdd(body);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(commentId: string, resolved: boolean) {
    setSaving(true);
    try {
      await onSetResolved(commentId, resolved);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(commentId: string) {
    setSaving(true);
    try {
      await onDelete(commentId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`relative ${mode === "review" ? "mb-6" : "mb-3"} ${
        open ? "z-40" : "z-0"
      }`}
    >
      {/* Full-width block — aligns with page header on both sides */}
      <div className="min-w-0 w-full">{children}</div>

      {/* Closed: icon in the gutter outside the page alignment (visual right) */}
      {!open && (
        <button
          type="button"
          className={`absolute ${iconTop} left-full ml-1.5 z-20 p-1 text-surface-600 transition-opacity duration-fast ${iconOpacity}`}
          title={iconTitle}
          aria-label={iconTitle}
          aria-expanded={false}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <CommentIcon className="w-4 h-4" />
          <CommentCountBadge count={unresolved} />
        </button>
      )}

      {/* Open: panel from block top; comment icon lives in the header */}
      {open && (
        <div
          className="absolute top-0 left-full ml-1.5 z-30 w-64 bg-white border border-surface-200 shadow-md rounded-lg flex flex-col max-h-[min(28rem,70vh)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="הערות לרכיב"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 shrink-0">
            <span className="relative shrink-0 text-surface-700 p-0.5" aria-hidden>
              <CommentIcon className="w-4 h-4" />
              <CommentCountBadge count={unresolved} />
            </span>
            <span className="text-sm font-semibold text-surface-800 flex-1">הערות</span>
            <button
              type="button"
              className="p-1 text-surface-400 hover:text-surface-900 transition-colors duration-fast"
              title="סגור"
              aria-label="סגור"
              onClick={onToggle}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 overflow-y-auto flex flex-col min-h-0 divide-y divide-surface-200"
          >
            {comments.length === 0 && (
              <p className="text-sm text-surface-400 px-3 py-2">אין עדיין הערות. הוסיפו הערה למטה.</p>
            )}
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                mode={mode}
                disabled={saving}
                onSetResolved={handleResolve}
                onDelete={handleDelete}
              />
            ))}
          </div>

          <div className="border-t border-surface-200 px-3 py-2 flex flex-col gap-2 shrink-0">
            <textarea
              rows={2}
              value={draft}
              placeholder={`כתבו הערה כ${COMMENT_AUTHOR_LABEL[mode as CommentAuthorRole]}...`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              className="w-full px-2 py-1.5 text-sm leading-5 bg-surface-50 border border-surface-200 text-surface-900 placeholder:text-surface-400 outline-none resize-y"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!draft.trim() || saving}
              onClick={handleAdd}
            >
              הוסף הערה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  mode,
  disabled,
  onSetResolved,
  onDelete,
}: {
  comment: ComponentComment;
  mode: CourseViewMode;
  disabled: boolean;
  onSetResolved: (commentId: string, resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const resolved = !!comment.resolved_at;
  const role = comment.author_role as CommentAuthorRole;
  const canDelete = mode === role;

  return (
    <div
      className={`px-2.5 py-1.5 flex flex-col gap-1 ${
        resolved ? "opacity-60" : "bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${COMMENT_AUTHOR_COLOR[role]}`}>
          {COMMENT_AUTHOR_LABEL[role]}
        </span>
        {canDelete && (
          <button
            type="button"
            disabled={disabled}
            className="p-0.5 text-surface-400 hover:text-danger disabled:opacity-50 transition-colors duration-fast ms-auto"
            title="מחק הערה"
            aria-label="מחק הערה"
            onClick={() => onDelete(comment.id)}
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p
        className={`text-sm whitespace-pre-wrap break-words ${
          resolved
            ? "text-surface-700 line-through decoration-black decoration-1"
            : "text-surface-800"
        }`}
      >
        {comment.body}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-surface-400 shrink-0">
          {formatCommentTime(comment.created_at)}
        </span>
        {resolved && (
          <span className="text-[11px] font-semibold text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">
            נפתר
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          className={`p-0.5 disabled:opacity-50 transition-colors duration-fast ms-auto ${
            resolved
              ? "text-emerald-600 hover:text-emerald-800"
              : "text-surface-400 hover:text-surface-700"
          }`}
          title={resolved ? "פתח מחדש" : "סמן כנפתר"}
          aria-label={resolved ? "פתח מחדש" : "סמן כנפתר"}
          onClick={() => onSetResolved(comment.id, !resolved)}
        >
          <CheckCircleIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
