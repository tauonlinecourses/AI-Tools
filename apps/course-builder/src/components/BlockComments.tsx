import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@workspace/ui";
import type {
  CommentAuthorRole,
  CommentMention,
  CourseBuilderUser,
  CourseViewMode,
  ThreadComment,
} from "../lib/types";
import {
  COMMENT_AUTHOR_COLOR,
  COMMENT_AUTHOR_LABEL,
} from "../lib/types";
import {
  getMentionQueryAtCaret,
  insertMentionAtCaret,
  sanitizeMentions,
  splitCommentBody,
  threadHasOpenMentionForUser,
} from "../lib/commentMentions";
import { listCourseBuilderUsers } from "../lib/api";
import { getPlatformSession } from "@workspace/auth/client";
import {
  CommentIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "./icons";

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function unresolvedCount(comments: ThreadComment[]): number {
  return comments.filter((c) => !c.resolved_at).length;
}

export function resolvedCount(comments: ThreadComment[]): number {
  return comments.filter((c) => !!c.resolved_at).length;
}

export type CommentBadgeTone = "open" | "resolved" | "mention";

/** Small corner badge on the top-right of the comment icon. */
function CommentCountBadge({
  count,
  tone = "open",
}: {
  count: number;
  /** Open = blue; mention (you were @tagged in an open comment) = purple; resolved-only = grey. */
  tone?: CommentBadgeTone;
}) {
  if (count <= 0) return null;
  const toneClass =
    tone === "resolved"
      ? "bg-surface-400 text-white"
      : tone === "mention"
        ? "bg-[#7C3AED] text-white"
        : "bg-[#0F6CBF] text-white";
  return (
    <span
      className={`absolute -top-0.5 -right-1 min-w-[0.875rem] h-3.5 px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold leading-none tabular-nums pointer-events-none ${toneClass}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface BlockCommentsProps {
  comments: ThreadComment[];
  mode: CourseViewMode;
  open: boolean;
  onToggle: () => void;
  onAdd: (body: string, mentions: CommentMention[]) => Promise<void>;
  onSetResolved: (commentId: string, resolved: boolean) => Promise<void>;
  /** Only allowed when current mode matches the comment's author_role. */
  onEdit: (
    commentId: string,
    body: string,
    mentions: CommentMention[]
  ) => Promise<void>;
  /** Only allowed when current mode matches the comment's author_role. */
  onDelete: (commentId: string) => Promise<void>;
  /** Children = the block card / page header / preview content. */
  children: React.ReactNode;
  /** Optional dialog label override (default: block comments). */
  ariaLabel?: string;
  /** Override default bottom margin on the outer wrapper (e.g. `mb-0` in sticky headers). */
  className?: string;
  /** Raise stacking above later siblings (e.g. open header field popovers over the add box). */
  elevate?: boolean;
}

let mentionUsersCache: CourseBuilderUser[] | null = null;
let mentionUsersPromise: Promise<CourseBuilderUser[]> | null = null;
let currentUserIdCache: string | null | undefined;
let currentUserIdPromise: Promise<string | null> | null = null;

async function loadMentionUsers(): Promise<CourseBuilderUser[]> {
  if (mentionUsersCache) return mentionUsersCache;
  if (!mentionUsersPromise) {
    mentionUsersPromise = listCourseBuilderUsers()
      .then((users) => {
        mentionUsersCache = users;
        return users;
      })
      .catch((err) => {
        mentionUsersPromise = null;
        throw err;
      });
  }
  return mentionUsersPromise;
}

async function loadCurrentUserId(): Promise<string | null> {
  if (currentUserIdCache !== undefined) return currentUserIdCache;
  if (!currentUserIdPromise) {
    currentUserIdPromise = getPlatformSession()
      .then((session) => {
        currentUserIdCache = session?.user?.id ?? null;
        return currentUserIdCache;
      })
      .catch(() => {
        currentUserIdCache = null;
        currentUserIdPromise = null;
        return null;
      });
  }
  return currentUserIdPromise;
}

/**
 * Comment icon outside the block (visual right) + Word-style closable thread panel.
 * Used for component cards and the page header. The content stays full-width of the
 * page column. When closed, the icon sits in the start gutter; when open, the panel
 * aligns to the top and the icon moves into the panel header. Clicking outside closes it.
 */
export function BlockComments({
  comments,
  mode,
  open,
  onToggle,
  onAdd,
  onSetResolved,
  onEdit,
  onDelete,
  children,
  ariaLabel = "הערות לרכיב",
  className,
  elevate = false,
}: BlockCommentsProps) {
  const [draft, setDraft] = useState("");
  const [draftMentions, setDraftMentions] = useState<CommentMention[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<CourseBuilderUser[]>(
    () => mentionUsersCache ?? []
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    () => currentUserIdCache ?? null
  );
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unresolved = unresolvedCount(comments);
  const resolved = resolvedCount(comments);
  const hasAny = comments.length > 0;
  const badgeCount = unresolved > 0 ? unresolved : resolved;
  const mentionedOpen = threadHasOpenMentionForUser(comments, currentUserId);
  const badgeTone: CommentBadgeTone =
    unresolved > 0 ? (mentionedOpen ? "mention" : "open") : "resolved";

  // Full opacity when empty or when there are open comments; softer only for resolved-only.
  const iconOpacity =
    hasAny && unresolved === 0
      ? "opacity-70 hover:opacity-100"
      : "opacity-100";

  const iconTop = mode === "review" ? "top-0.5" : "top-2";

  const iconTitle =
    unresolved > 0
      ? mentionedOpen
        ? `${unresolved} הערות פתוחות (תויגת)`
        : `${unresolved} הערות פתוחות`
      : resolved > 0
        ? `${resolved} הערות שנפתרו`
        : "הוסף הערה";

  const marginClass =
    className ?? (mode === "review" ? "mb-6" : "mb-3");

  // Default to bottom so the latest comments (and composer) are in view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, comments.length]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onToggle();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open, onToggle]);

  useEffect(() => {
    let cancelled = false;
    loadCurrentUserId().then((id) => {
      if (!cancelled) setCurrentUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadMentionUsers()
      .then((users) => {
        if (!cancelled) setMentionUsers(users);
      })
      .catch(() => {
        /* autocomplete stays empty; commenting still works */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleAdd() {
    const body = draft.trim();
    if (!body || saving) return;
    const mentions = sanitizeMentions(body, draftMentions);
    setSaving(true);
    try {
      await onAdd(body, mentions);
      setDraft("");
      setDraftMentions([]);
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

  async function handleEdit(
    commentId: string,
    body: string,
    mentions: CommentMention[]
  ) {
    setSaving(true);
    try {
      await onEdit(commentId, body, mentions);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(commentId: string) {
    setSaving(true);
    try {
      await onDelete(commentId);
      if (editingId === commentId) setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`relative ${marginClass} ${
        open ? "z-[80]" : elevate ? "z-40" : "z-0"
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
          <CommentCountBadge count={badgeCount} tone={badgeTone} />
        </button>
      )}

      {/* Open: panel from block top; comment icon lives in the header */}
      {open && (
        <div
          ref={panelRef}
          className="absolute top-0 left-full ml-1.5 z-[90] w-64 bg-white border border-surface-200 shadow-md rounded-lg flex flex-col max-h-[min(28rem,70vh)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 shrink-0">
            <span className="relative shrink-0 text-surface-700 p-0.5" aria-hidden>
              <CommentIcon className="w-4 h-4" />
              <CommentCountBadge count={badgeCount} tone={badgeTone} />
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
                editing={editingId === c.id}
                mentionUsers={mentionUsers}
                onStartEdit={() => setEditingId(c.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(body, mentions) => handleEdit(c.id, body, mentions)}
                onSetResolved={handleResolve}
                onDelete={handleDelete}
              />
            ))}
          </div>

          <div className="border-t border-surface-200 px-3 py-2 flex flex-col gap-2 shrink-0">
            <MentionTextarea
              rows={2}
              value={draft}
              mentions={draftMentions}
              users={mentionUsers}
              placeholder={`כתבו הערה כ${COMMENT_AUTHOR_LABEL[mode as CommentAuthorRole]}...`}
              disabled={saving}
              onChange={(value, mentions) => {
                setDraft(value);
                setDraftMentions(mentions);
              }}
              onSubmit={handleAdd}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!draft.trim() || saving}
              onClick={handleAdd}
            >
              שליחה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentBody({
  body,
  mentions,
  resolved,
}: {
  body: string;
  mentions: CommentMention[];
  resolved: boolean;
}) {
  const parts = splitCommentBody(body, mentions);
  return (
    <p
      className={`text-sm whitespace-pre-wrap break-words ${
        resolved
          ? "text-surface-700 line-through decoration-black decoration-1"
          : "text-surface-800"
      }`}
    >
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span
            key={`${part.mention.user_id}-${i}`}
            className="font-semibold text-[#0F6CBF] no-underline"
            title={part.mention.display_name}
          >
            {part.text}
          </span>
        ) : (
          <span key={`t-${i}`}>{part.text}</span>
        )
      )}
    </p>
  );
}

function CommentItem({
  comment,
  mode,
  disabled,
  editing,
  mentionUsers,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onSetResolved,
  onDelete,
}: {
  comment: ThreadComment;
  mode: CourseViewMode;
  disabled: boolean;
  editing: boolean;
  mentionUsers: CourseBuilderUser[];
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (body: string, mentions: CommentMention[]) => Promise<void>;
  onSetResolved: (commentId: string, resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const resolved = !!comment.resolved_at;
  const role = comment.author_role as CommentAuthorRole;
  const canManage = mode === role;
  const authorLabel =
    comment.author_display_name?.trim() || COMMENT_AUTHOR_LABEL[role];
  const [editDraft, setEditDraft] = useState(comment.body);
  const [editMentions, setEditMentions] = useState<CommentMention[]>(
    comment.mentions ?? []
  );

  useEffect(() => {
    if (editing) {
      setEditDraft(comment.body);
      setEditMentions(comment.mentions ?? []);
    }
  }, [editing, comment.body, comment.mentions]);

  async function handleSave() {
    const body = editDraft.trim();
    if (!body || disabled) return;
    await onSaveEdit(body, sanitizeMentions(body, editMentions));
  }

  return (
    <div
      className={`px-2.5 py-1.5 flex flex-col gap-1 ${
        resolved ? "opacity-60" : "bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-semibold ${COMMENT_AUTHOR_COLOR[role]}`}
          title={COMMENT_AUTHOR_LABEL[role]}
        >
          {authorLabel}
        </span>
        {canManage && !editing && (
          <div className="flex items-center gap-0.5 ms-auto">
            <button
              type="button"
              disabled={disabled}
              className="p-0.5 text-surface-400 hover:text-surface-800 disabled:opacity-50 transition-colors duration-fast"
              title="ערוך הערה"
              aria-label="ערוך הערה"
              onClick={onStartEdit}
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              className="p-0.5 text-surface-400 hover:text-danger disabled:opacity-50 transition-colors duration-fast"
              title="מחק הערה"
              aria-label="מחק הערה"
              onClick={() => onDelete(comment.id)}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <MentionTextarea
            rows={3}
            value={editDraft}
            mentions={editMentions}
            users={mentionUsers}
            disabled={disabled}
            autoFocus
            onChange={(value, mentions) => {
              setEditDraft(value);
              setEditMentions(mentions);
            }}
            onSubmit={handleSave}
            onCancel={onCancelEdit}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!editDraft.trim() || disabled}
              onClick={handleSave}
            >
              שמור
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={onCancelEdit}
            >
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <CommentBody
          body={comment.body}
          mentions={comment.mentions ?? []}
          resolved={resolved}
        />
      )}
      {!editing && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-surface-400 shrink-0">
            {formatCommentTime(comment.created_at)}
          </span>
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
      )}
    </div>
  );
}

function MentionTextarea({
  value,
  mentions,
  users,
  onChange,
  onSubmit,
  onCancel,
  rows,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string;
  mentions: CommentMention[];
  users: CourseBuilderUser[];
  onChange: (value: string, mentions: CommentMention[]) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  rows: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [menuBox, setMenuBox] = useState<{
    left: number;
    width: number;
    bottom: number;
  } | null>(null);

  const mentionQuery = getMentionQueryAtCaret(value, caret);
  const filtered =
    mentionQuery && !menuDismissed
      ? users
          .filter((u) =>
            u.display_name
              .toLowerCase()
              .includes(mentionQuery.query.toLowerCase())
          )
          .slice(0, 8)
      : [];
  const menuOpen = filtered.length > 0;

  useEffect(() => {
    setActiveIndex(0);
    setMenuDismissed(false);
  }, [mentionQuery?.query, mentionQuery?.start]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuBox(null);
      return;
    }
    function updateMenuBox() {
      const el = textareaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuBox({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + 4,
      });
    }
    updateMenuBox();
    window.addEventListener("resize", updateMenuBox);
    window.addEventListener("scroll", updateMenuBox, true);
    return () => {
      window.removeEventListener("resize", updateMenuBox);
      window.removeEventListener("scroll", updateMenuBox, true);
    };
  }, [menuOpen, value, filtered.length]);

  function updateValue(next: string, nextMentions: CommentMention[], nextCaret: number) {
    onChange(next, nextMentions);
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function pickUser(user: CourseBuilderUser) {
    if (!mentionQuery) return;
    const inserted = insertMentionAtCaret(
      value,
      caret,
      mentionQuery.start,
      user.display_name
    );
    const nextMentions = sanitizeMentions(inserted.value, [
      ...mentions,
      { user_id: user.id, display_name: user.display_name },
    ]);
    // Keep mention even if sanitize later trims — body already has @name.
    const merged = [...nextMentions];
    if (!merged.some((m) => m.user_id === user.id)) {
      merged.push({ user_id: user.id, display_name: user.display_name });
    }
    updateValue(inserted.value, sanitizeMentions(inserted.value, merged), inserted.caret);
  }

  function syncCaretFromEvent(
    e: React.SyntheticEvent<HTMLTextAreaElement>
  ) {
    setCaret(e.currentTarget.selectionStart ?? 0);
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next, sanitizeMentions(next, mentions));
          setCaret(e.target.selectionStart ?? next.length);
        }}
        onClick={syncCaretFromEvent}
        onKeyUp={syncCaretFromEvent}
        onSelect={syncCaretFromEvent}
        onKeyDown={(e) => {
          if (menuOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % filtered.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pickUser(filtered[activeIndex] ?? filtered[0]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMenuDismissed(true);
              return;
            }
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="w-full px-2 py-1.5 text-sm leading-5 bg-surface-50 border border-surface-200 text-surface-900 placeholder:text-surface-400 outline-none resize-y"
      />
      {menuOpen &&
        menuBox &&
        createPortal(
          <ul
            className="fixed z-[200] max-h-40 overflow-y-auto rounded-md border border-surface-200 bg-white shadow-lg py-1"
            style={{
              left: menuBox.left,
              width: menuBox.width,
              bottom: menuBox.bottom,
            }}
            role="listbox"
            aria-label="תיוג משתמש"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {filtered.map((user, index) => (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`w-full text-start px-2.5 py-1.5 text-sm truncate ${
                    index === activeIndex
                      ? "bg-surface-100 text-surface-900"
                      : "text-surface-800 hover:bg-surface-50"
                  }`}
                  onMouseDown={(e) => {
                    // Keep focus in textarea; avoid blur-before-click.
                    e.preventDefault();
                    pickUser(user);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  @{user.display_name}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
