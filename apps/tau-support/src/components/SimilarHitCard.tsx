import { ForumBody } from "./ForumBody";
import { FORUM_RTL_CLASS } from "../lib/forumBody";
import {
  resolveSimilarHitDisplay,
  type SimilarQaHit,
} from "../lib/kbSearch";
import type { DraftSource } from "../lib/draftAnswer";

/** Display answer date as DD.MM.YYYY. */
function formatHitDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function draftSourcesSummary(sources: DraftSource[]): string {
  const infoDocCount = sources.filter((s) => s.sourceType === "info_doc").length;
  const qaCount = sources.length - infoDocCount;
  const parts: string[] = [];
  if (infoDocCount > 0) {
    parts.push("מידע מקובץ מידע שימושי");
  }
  if (qaCount > 0) {
    parts.push(
      qaCount === 1 ? "1 שאלה דומה" : `${qaCount} שאלות דומות`
    );
  }
  return parts.length > 0
    ? `מבוסס על ${parts.join(" ו")}`
    : "מבוסס על מקורות מהמאגר";
}

export function draftSourceAsHit(source: DraftSource): SimilarQaHit {
  return {
    id: source.id,
    sourceId: source.id,
    sourceType: source.sourceType ?? "qa_pair",
    content: source.content,
    questionSnippet: source.questionSnippet,
    questionTitle: source.questionTitle,
    questionBody: source.questionBody,
    answerSnippet: source.answerSnippet,
    metadata: source.threadId ? { thread_id: source.threadId } : {},
    lang: null,
    courseId: null,
    courseName: source.courseName,
    similarity: source.similarity,
    answeredAt: source.answeredAt,
  };
}

export function SimilarHitCard({ hit }: { hit: SimilarQaHit }) {
  const { title, body, answer } = resolveSimilarHitDisplay(hit);
  const answeredDate = formatHitDate(hit.answeredAt);
  const isInfoDoc = hit.sourceType === "info_doc";
  return (
    <li
      dir="rtl"
      className={`rounded-control overflow-hidden border-2 border-surface-300 bg-white p-3 shadow-[0_3px_4px_-3px_rgba(0,0,0,0.22)] text-right ${FORUM_RTL_CLASS}`}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-surface-500">
        <p className="min-w-0 text-right">
          {isInfoDoc ? "מסמך מידע שימושי" : "שאלה דומה מהפורום"}
        </p>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {answeredDate ? (
            <span className="text-[11px] text-surface-500">{answeredDate}</span>
          ) : null}
          <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-semibold text-surface-800">
            {(hit.similarity * 100).toFixed(0)}% דמיון
          </span>
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
      {hit.courseName ? (
        <p className="mt-1 text-right text-xs font-medium text-surface-600">
          {hit.courseName}
        </p>
      ) : null}
      {isInfoDoc ? (
        answer ? (
          <div
            dir="rtl"
            className={`mr-0 mt-3 overflow-hidden rounded-control border border-surface-200 p-3 text-right ${FORUM_RTL_CLASS}`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-start gap-2 text-right text-xs text-surface-500">
              <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-semibold text-surface-800">
                מידע
              </span>
              <p className="min-w-0">תוכן המסמך</p>
            </div>
            <div className="text-base [&_.forum-body]:!text-base [&_h2]:!mt-2 [&_h2]:!mb-1 [&_h2]:!text-base [&_h2]:!font-semibold [&_h3]:!mt-2 [&_h3]:!mb-1 [&_h3]:!text-base [&_h3]:!font-semibold [&_h4]:!text-base [&_h4]:!font-semibold [&_p]:!text-base [&_li]:!text-base [&_span]:!text-base">
              <ForumBody raw_body={answer} />
            </div>
          </div>
        ) : null
      ) : (
        <>
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
              className={`mr-4 mt-3 overflow-hidden rounded-control border border-amber-200 border-r-2 bg-amber-100 p-3 pr-3 text-right ${FORUM_RTL_CLASS}`}
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
        </>
      )}
    </li>
  );
}
