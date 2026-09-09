import { useState, type MouseEvent } from "react";
import { Card, Button, Spinner } from "@workspace/ui";
import { ForumBody } from "./ForumBody";
import { sanitizeCommentForest } from "../lib/commentTree";
import { FORUM_RTL_CLASS } from "../lib/forumBody";
import { buildForumThreadUrl } from "../lib/forumUrls";
import {
  findSimilarQa,
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
  const [draftCopied, setDraftCopied] = useState(false);

  async function handleFindSimilar(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleOpen();
    setSimilarBusy(true);
    setSimilarError(null);
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
          {wouldNeedAnswerWithoutOverride && onToggleNoAnswerNeeded ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpen();
                onToggleNoAnswerNeeded();
              }}
            >
              {noAnswerNeeded ? "בטל סימון" : "אין צורך במענה"}
            </Button>
          ) : null}
        </div>

        {needsAnswer && isSupabaseConfigured ? (
          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2">
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
                disabled={draftBusy}
                onClick={(e) => void handleDraftAnswer(e)}
              >
                {draftBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size="sm" />
                    מנסח…
                  </span>
                ) : (
                  "נסח טיוטת תשובה"
                )}
              </Button>
            </div>
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-surface-800">
                    טיוטת תשובה (ניתן לעריכה)
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => void handleCopyDraft(e)}
                  >
                    {draftCopied ? "הועתק" : "העתק"}
                  </Button>
                </div>
                <textarea
                  dir="rtl"
                  lang="he"
                  className="min-h-[120px] w-full resize-y rounded-control border border-surface-200 p-2 text-right text-sm text-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                {draftSources.length > 0 ? (
                  <p className="text-[11px] text-surface-500">
                    מבוסס על {draftSources.length} שאלות דומות
                    {" · "}
                    {draftSources
                      .map((s) => `${(s.similarity * 100).toFixed(0)}%`)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
            {similarError ? (
              <p className="text-xs text-danger">{similarError}</p>
            ) : null}
            {similarHits ? (
              similarHits.length === 0 ? (
                <p className="text-xs text-surface-600">
                  לא נמצאו שאלות דומות במאגר.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {similarHits.map((hit) => (
                    <li
                      key={hit.id}
                      className="rounded-control border border-surface-200 bg-white p-2 text-right text-xs"
                    >
                      <p className="font-semibold text-surface-800">
                        דמיון {(hit.similarity * 100).toFixed(0)}%
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-surface-700">
                        {hit.questionSnippet.slice(0, 280)}
                        {hit.questionSnippet.length > 280 ? "…" : ""}
                      </p>
                      {hit.answerSnippet ? (
                        <p className="mt-1 whitespace-pre-wrap text-surface-600">
                          <span className="font-semibold">תשובה: </span>
                          {hit.answerSnippet.slice(0, 280)}
                          {hit.answerSnippet.length > 280 ? "…" : ""}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        ) : null}

        <ForumBody
          rendered_body={thread.rendered_body}
          raw_body={thread.raw_body}
        />

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
