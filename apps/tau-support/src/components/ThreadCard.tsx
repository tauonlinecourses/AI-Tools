import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Card, Button, Spinner } from "@workspace/ui";
import { ForumBody } from "./ForumBody";
import { sanitizeCommentForest } from "../lib/commentTree";
import { FORUM_RTL_CLASS } from "../lib/forumBody";
import { buildForumThreadUrl } from "../lib/forumUrls";
import {
  findSimilarQa,
  resolveSimilarHitDisplay,
  threadQuestionText,
  type SimilarQaHit,
} from "../lib/kbSearch";
import {
  DRAFT_REFUSAL_SENTENCE,
  draftAnswerForThread,
  type DraftSource,
} from "../lib/draftAnswer";
import { isSupabaseConfigured } from "../lib/supabase";
import { isStaffAuthor, threadNeedsAnswer } from "../lib/unanswered";
import type { ForumComment, ForumThread } from "../lib/types";

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function authorLine(comment: {
  author?: string;
  author_label?: string | null;
}): string {
  const name = comment.author || "Unknown author";
  return comment.author_label ? `${name} (${comment.author_label})` : name;
}

function CheckIcon({
  className,
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 3 : 2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12.5 10 18 20 6" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CopiedCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 13 9 17 19 7" />
    </svg>
  );
}

function draftSourceAsHit(source: DraftSource): SimilarQaHit {
  return {
    id: source.id,
    sourceId: source.id,
    content: source.content,
    questionSnippet: source.questionSnippet,
    questionTitle: source.questionTitle,
    questionBody: source.questionBody,
    answerSnippet: source.answerSnippet,
    metadata: source.threadId ? { thread_id: source.threadId } : {},
    lang: null,
    courseId: null,
    similarity: source.similarity,
  };
}

function SimilarHitCard({ hit }: { hit: SimilarQaHit }) {
  const { title, body, answer } = resolveSimilarHitDisplay(hit);
  return (
    <li
      dir="rtl"
      className={`rounded-control overflow-hidden border border-surface-100 bg-white p-3 shadow-[0_3px_4px_-3px_rgba(0,0,0,0.22)] text-right ${FORUM_RTL_CLASS}`}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-surface-500">
        <p className="min-w-0 text-right">שאלה דומה</p>
        <span className="shrink-0 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-semibold text-surface-800">
          דמיון {(hit.similarity * 100).toFixed(0)}%
        </span>
      </div>
      {title ? (
        <h3
          dir="rtl"
          lang="he"
          className="min-w-0 text-right text-base font-semibold text-surface-900"
        >
          {title}
        </h3>
      ) : null}
      {body ? (
        <p
          dir="rtl"
          className="mt-1 whitespace-pre-wrap text-right text-sm font-normal text-surface-800"
        >
          {body}
        </p>
      ) : null}
      {answer ? (
        <div
          dir="rtl"
          className={`mr-4 mt-3 overflow-hidden rounded-control border border-surface-100 border-r-2 bg-white p-3 pr-3 text-right ${FORUM_RTL_CLASS}`}
        >
          <div className="mb-1 flex flex-wrap items-center justify-start gap-2 text-right text-xs text-surface-500">
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              צוות
            </span>
            <p className="min-w-0">תשובה</p>
          </div>
          <p
            dir="rtl"
            className="whitespace-pre-wrap text-right text-sm font-normal text-surface-800"
          >
            {answer}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function CommentBlock({
  comment,
  depth = 0,
}: {
  comment: ForumComment;
  depth?: number;
}) {
  const isStaff = isStaffAuthor(comment.author_label);
  const nest =
    depth > 0 ? "mr-4 mt-3 border-r-2 pr-3 text-right" : "mt-3 text-right";
  const box = isStaff
    ? "rounded-control overflow-hidden border border-amber-200 bg-amber-100 p-3"
    : "rounded-control overflow-hidden border border-surface-100 bg-white p-3";

  return (
    <div dir="rtl" className={`${nest} ${box} ${FORUM_RTL_CLASS}`}>
      <div className="mb-1 flex flex-wrap items-center justify-start gap-2 text-right text-xs text-surface-500">
        {isStaff ? (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            צוות
          </span>
        ) : null}
        <p className="min-w-0">
          {authorLine(comment)}
          {" · "}
          {formatWhen(comment.created_at)}
          {comment.endorsed ? " · Endorsed" : ""}
        </p>
      </div>
      <ForumBody
        rendered_body={comment.rendered_body}
        raw_body={comment.raw_body}
      />
      {comment.children?.map((child) => (
        <CommentBlock key={child.id} comment={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ThreadCard({
  thread,
  courseId,
  forumUiOrigin,
  categoryName,
  courseLabel,
  isNew,
  isUpdated,
  noAnswerNeeded = false,
  onOpen,
  onToggleNoAnswerNeeded,
}: {
  thread: ForumThread;
  courseId: string;
  forumUiOrigin: string;
  categoryName?: string;
  /** Optional course title shown in the global inbox. */
  courseLabel?: string;
  isNew?: boolean;
  isUpdated?: boolean;
  noAnswerNeeded?: boolean;
  onOpen?: () => void;
  onToggleNoAnswerNeeded?: () => void;
}) {
  const comments = sanitizeCommentForest(thread.comments);
  const needsAnswer = threadNeedsAnswer(thread, noAnswerNeeded);
  const wouldNeedAnswerWithoutOverride = threadNeedsAnswer(thread, false);
  const isStaffThread = isStaffAuthor(thread.author_label);
  const forumUrl = buildForumThreadUrl(
    forumUiOrigin,
    courseId,
    thread.id,
    categoryName
  );
  const [similarBusy, setSimilarBusy] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [similarHits, setSimilarHits] = useState<SimilarQaHit[] | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftRefused, setDraftRefused] = useState(false);
  const [draftSources, setDraftSources] = useState<DraftSource[]>([]);
  const [draftSourcesOpen, setDraftSourcesOpen] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = draftTextareaRef.current;
    if (!el || draft == null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function handleFindSimilar(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleOpen();
    setSimilarBusy(true);
    setSimilarError(null);
    setSimilarHits(null);
    try {
      const question = threadQuestionText(thread);
      const res = await findSimilarQa(question, {
        courseId,
        matchCount: 3,
      });
      if (res.skipped) {
        setSimilarError("Supabase is not configured.");
        setSimilarHits(null);
        return;
      }
      if (!res.ok) {
        setSimilarError(res.message ?? "Search failed");
        setSimilarHits(null);
        return;
      }
      setSimilarHits(res.hits ?? []);
    } finally {
      setSimilarBusy(false);
    }
  }

  async function handleDraftAnswer(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleOpen();
    setDraftBusy(true);
    setDraftError(null);
    setDraft(null);
    setDraftRefused(false);
    setDraftSources([]);
    setDraftSourcesOpen(false);
    setDraftCopied(false);
    try {
      const res = await draftAnswerForThread(thread, courseId);
      if (res.skipped) {
        setDraftError("Supabase is not configured.");
        return;
      }
      if (!res.ok) {
        setDraftError(res.message ?? "Draft generation failed");
        return;
      }
      setDraftSources(res.sources ?? []);
      if (res.refused || !res.draft) {
        setDraftRefused(true);
        return;
      }
      setDraft(res.draft);
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleCopyDraft(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setDraftCopied(true);
      window.setTimeout(() => setDraftCopied(false), 2000);
    } catch {
      // Clipboard may be blocked — the textarea is still selectable.
    }
  }

  function handleOpen() {
    onOpen?.();
  }

  const cardTone = needsAnswer
    ? "!bg-red-100 !border-red-300"
    : isStaffThread
      ? "!bg-amber-100 !border-amber-300"
      : noAnswerNeeded
        ? "!bg-emerald-100 !border-emerald-300"
        : isNew || isUpdated
          ? "!bg-blue-100 !border-blue-300"
          : "!bg-white";

  return (
    <Card className={`rounded-control overflow-hidden shadow-[0_3px_4px_-3px_rgba(0,0,0,0.22)] ${cardTone}`}>
      <div
        dir="rtl"
        className={`flex flex-col gap-2 text-right ${FORUM_RTL_CLASS}`}
        onFocus={handleOpen}
        onClick={handleOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <a
            href={forumUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group min-w-0 flex-1 rounded-sm text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Open thread on campus IL forum"
            onClick={handleOpen}
          >
            <div
              dir="rtl"
              className="mb-1 flex w-full flex-wrap items-center justify-start gap-2 text-right"
            >
              <h3
                dir="rtl"
                lang="he"
                className="min-w-0 text-right text-base font-semibold text-surface-900 group-hover:text-blue-700 group-hover:underline"
              >
                {thread.title || "(untitled thread)"}
              </h3>
              {isNew ? (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  חדש
                </span>
              ) : null}
              {isUpdated && !isNew ? (
                <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                  עודכן
                </span>
              ) : null}
              {isStaffThread ? (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  צוות
                </span>
              ) : null}
              {noAnswerNeeded ? (
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                  אין צורך במענה
                </span>
              ) : null}
              {needsAnswer ? (
                <span className="rounded-full bg-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-900">
                  ללא מענה
                </span>
              ) : null}
            </div>
            {courseLabel ? (
              <p className="mb-1 text-xs font-medium text-surface-600">
                {courseLabel}
              </p>
            ) : null}
            <div className="mt-0.5 flex flex-wrap items-center justify-start gap-x-2 gap-y-1 text-xs text-surface-500">
              <p className="min-w-0 text-right">
                {authorLine(thread)}
                {" · "}
                {Math.max(0, (thread.comment_count ?? 0) - 1)} repl
                {Math.max(0, (thread.comment_count ?? 0) - 1) === 1
                  ? "y"
                  : "ies"}
                {" · "}
                {formatWhen(thread.created_at)}
              </p>
              <span className="shrink-0 text-blue-700 group-hover:underline">
                Open in forum ↗
              </span>
            </div>
          </a>
          {/* Visual top-left in RTL: action cluster opposite the title */}
          <div
            className="flex shrink-0 flex-wrap items-start justify-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {wouldNeedAnswerWithoutOverride && onToggleNoAnswerNeeded ? (
              <Button
                variant="secondary"
                size="sm"
                className="!px-2"
                title={noAnswerNeeded ? "בטל סימון" : "אין צורך במענה"}
                aria-label={noAnswerNeeded ? "בטל סימון" : "אין צורך במענה"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpen();
                  onToggleNoAnswerNeeded();
                }}
              >
                <CheckIcon
                  filled={noAnswerNeeded}
                  className={
                    noAnswerNeeded ? "text-emerald-700" : "text-surface-700"
                  }
                />
              </Button>
            ) : null}
            {needsAnswer && isSupabaseConfigured ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={similarBusy}
                  onClick={(e) => void handleFindSimilar(e)}
                >
                  {similarBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="sm" />
                      מחפש…
                    </span>
                  ) : (
                    "שאלות דומות"
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="!px-2"
                  disabled={draftBusy}
                  title="נסח טיוטת תשובה"
                  aria-label="נסח טיוטת תשובה"
                  onClick={(e) => void handleDraftAnswer(e)}
                >
                  {draftBusy ? (
                    <Spinner size="sm" />
                  ) : (
                    <img
                      src="/icons/AI%20icon.png"
                      alt=""
                      width={16}
                      height={16}
                      className="h-4 w-4 object-contain"
                      aria-hidden
                    />
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <ForumBody
          rendered_body={thread.rendered_body}
          raw_body={thread.raw_body}
        />

        {needsAnswer &&
        isSupabaseConfigured &&
        (draftError || draftRefused || draft) ? (
          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {draftError ? (
              <p className="text-xs text-danger">{draftError}</p>
            ) : null}
            {draftRefused ? (
              <p className="rounded-control border border-surface-200 bg-white p-2 text-right text-xs text-surface-600">
                {DRAFT_REFUSAL_SENTENCE} נסו <span className="font-semibold">שאלות דומות</span> לבדיקה ידנית.
              </p>
            ) : null}
            {draft ? (
              <div className="flex flex-col gap-1 rounded-control border border-surface-200 bg-white p-2">
                <p className="min-w-0 text-right text-sm font-semibold text-surface-800">
                  טיוטת תשובה
                </p>
                <div className="relative">
                  <textarea
                    ref={draftTextareaRef}
                    dir="rtl"
                    lang="he"
                    rows={1}
                    className="w-full resize-none overflow-hidden rounded-control border border-surface-200 p-2 pl-9 text-right text-base font-normal leading-relaxed text-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute left-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-control text-surface-600 hover:bg-surface-100 hover:text-surface-900"
                    title={draftCopied ? "הועתק" : "העתק"}
                    aria-label={draftCopied ? "הועתק" : "העתק"}
                    onClick={(e) => void handleCopyDraft(e)}
                  >
                    {draftCopied ? (
                      <CopiedCheckIcon className="text-emerald-700" />
                    ) : (
                      <CopyIcon />
                    )}
                  </button>
                </div>
                <p className="text-right text-xs leading-snug text-surface-600 font-bold">
                  שימו לב, זוהי הצעה בלבד. עליכם לוודא שהתשובה נכונה, מתאימה ומנוסחת
                  נכון. האחריות על תקינות התשובה היא עליכם ועליכם בלבד. 
                </p>
                {draftSources.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-1 text-[11px] text-surface-500">
                      <p>
                        מבוסס על {draftSources.length} שאלות דומות
                        {" · "}
                        {draftSources
                          .map((s) => `${(s.similarity * 100).toFixed(0)}%`)
                          .join(", ")}
                      </p>
                      <button
                        type="button"
                        className="shrink-0 font-semibold text-blue-700 hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraftSourcesOpen((open) => !open);
                        }}
                      >
                        {draftSourcesOpen ? "הסתר תשובות" : "הצג תשובות"}
                      </button>
                    </div>
                    {draftSourcesOpen ? (
                      <ul className="flex flex-col gap-3">
                        {draftSources.map((source) => (
                          <SimilarHitCard
                            key={source.id}
                            hit={draftSourceAsHit(source)}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {needsAnswer &&
        isSupabaseConfigured &&
        (similarError || similarHits) ? (
          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {similarError ? (
              <p className="text-xs text-danger">{similarError}</p>
            ) : null}
            {similarHits ? (
              similarHits.length === 0 ? (
                <p className="text-xs text-surface-600">
                  לא נמצאו שאלות דומות במאגר.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {similarHits.map((hit) => (
                    <SimilarHitCard key={hit.id} hit={hit} />
                  ))}
                </ul>
              )
            ) : null}
          </div>
        ) : null}

        {comments.length > 0 ? (
          <div className="flex flex-col text-right">
            <p className="text-right text-xs font-semibold uppercase tracking-wide text-surface-600">
              Replies ({comments.length})
            </p>
            {comments.map((comment) => (
              <CommentBlock key={comment.id} comment={comment} />
            ))}
          </div>
        ) : (thread.comment_count ?? 0) > 1 ? (
          <p className="border-t border-surface-100 pt-2 text-right text-xs text-surface-500">
            {thread.comments_error
              ? `Could not load replies: ${thread.comments_error}`
              : `This thread has ${thread.comment_count} repl${
                  (thread.comment_count ?? 0) === 1 ? "y" : "ies"
                }, but none were returned.`}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
