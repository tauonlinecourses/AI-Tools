import { Card, Button } from "@workspace/ui";
import { ForumBody } from "./ForumBody";
import { FORUM_RTL_CLASS } from "../lib/forumBody";
import { buildForumThreadUrl } from "../lib/forumUrls";
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
    ? "rounded-control overflow-hidden border border-amber-200 bg-amber-50/70 p-3 ring-1 ring-amber-100"
    : "rounded-control overflow-hidden border border-surface-100 bg-white p-3";

  return (
    <div dir="rtl" className={`${nest} ${box} ${FORUM_RTL_CLASS}`}>
      <div className="mb-1 flex flex-wrap items-center justify-start gap-2 text-right text-xs text-surface-500">
        {isStaff ? (
          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
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
  const comments = thread.comments ?? [];
  const needsAnswer = threadNeedsAnswer(thread, noAnswerNeeded);
  const wouldNeedAnswerWithoutOverride = threadNeedsAnswer(thread, false);
  const isStaffThread = isStaffAuthor(thread.author_label);
  const forumUrl = buildForumThreadUrl(
    forumUiOrigin,
    courseId,
    thread.id,
    categoryName
  );

  function handleOpen() {
    onOpen?.();
  }

  const cardTone = needsAnswer
    ? "!bg-red-50/70 border-red-300 ring-1 ring-red-200"
    : isStaffThread
      ? "!bg-amber-50/70 border-amber-300 ring-1 ring-amber-200"
      : noAnswerNeeded
        ? "!bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-100"
        : isNew || isUpdated
          ? "!bg-blue-50/50 border-blue-200 ring-1 ring-blue-100"
          : "!bg-white border-surface-200";

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
                className="min-w-0 text-right text-sm font-semibold text-surface-900 group-hover:text-blue-700 group-hover:underline"
              >
                {thread.title || "(untitled thread)"}
              </h3>
              {isNew ? (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  חדש
                </span>
              ) : null}
              {isUpdated && !isNew ? (
                <span className="rounded-full bg-sky-200/90 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                  עודכן
                </span>
              ) : null}
              {isStaffThread ? (
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  צוות
                </span>
              ) : null}
              {noAnswerNeeded ? (
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                  אין צורך במענה
                </span>
              ) : null}
              {needsAnswer ? (
                <span className="rounded-full bg-red-200/80 px-2 py-0.5 text-[11px] font-semibold text-red-900">
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
