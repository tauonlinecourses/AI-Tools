import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@workspace/ui";
import {
  draftSourceAsHit,
  draftSourcesSummary,
  SimilarHitCard,
} from "./SimilarHitCard";
import {
  DRAFT_REFUSAL_SENTENCE,
  draftAnswerForQuestion,
  draftHasSigneePlaceholder,
  type DraftSource,
} from "../lib/draftAnswer";
import { isSupabaseConfigured } from "../lib/supabase";

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

export function EmailQuestionPage() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [sources, setSources] = useState<DraftSource[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = draftTextareaRef.current;
    if (!el || draft == null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const canGenerate =
    question.trim().length > 0 && !busy && isSupabaseConfigured;
  const copyBlocked = !draft || draftHasSigneePlaceholder(draft);

  async function handleGenerate() {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    setDraft(null);
    setRefused(false);
    setSources([]);
    setSourcesOpen(true);
    setCopied(false);
    try {
      const res = await draftAnswerForQuestion(question);
      if (res.skipped) {
        setError("Supabase לא מוגדר — לא ניתן לחפש במאגר.");
        return;
      }
      if (!res.ok) {
        setError(res.message ?? "ניסוח התשובה נכשל");
        return;
      }
      setSources(res.sources ?? []);
      if (res.refused || !res.draft) {
        setRefused(true);
        return;
      }
      setDraft(res.draft);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!draft || copyBlocked) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked — the textarea is still selectable.
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-surface-900 sm:text-2xl">
          הדבקת שאלה מהמייל
        </h2>
        <p className="text-sm text-surface-600">
          הדביקו את טקסט השאלה מהמייל — המערכת תחפש במסמכי מידע שימושי ובשאלות
          דומות מהפורומים ותנסח טיוטת תשובה.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <p className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          נדרש Supabase לחיפוש במאגר. הגדירו{" "}
          <span dir="ltr">VITE_SUPABASE_URL</span> ו-{" "}
          <span dir="ltr">VITE_SUPABASE_ANON_KEY</span>.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email-question-paste"
          className="text-sm font-medium text-surface-800"
        >
          טקסט השאלה
        </label>
        <textarea
          id="email-question-paste"
          dir="rtl"
          lang="he"
          rows={8}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
          placeholder="הדביקו כאן את שאלת הסטודנט מהמייל…"
          className="w-full resize-y rounded-control border border-surface-200 bg-white px-3 py-2 text-sm leading-relaxed text-surface-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                יוצרת תשובה…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <img
                  src="/icons/AI%20icon.png"
                  alt=""
                  width={16}
                  height={16}
                  className={`h-4 w-4 object-contain ${
                    canGenerate ? "brightness-0 invert" : ""
                  }`}
                  aria-hidden
                />
                יצירת תשובה
              </span>
            )}
          </Button>
          {question.trim() ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setQuestion("");
                setDraft(null);
                setRefused(false);
                setSources([]);
                setError(null);
                setCopied(false);
              }}
            >
              נקה
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {refused ? (
        <p className="rounded-control border border-surface-200 bg-surface-50 p-3 text-sm text-surface-600">
          {DRAFT_REFUSAL_SENTENCE}
        </p>
      ) : null}

      {busy && !draft ? (
        <div
          className="flex flex-col gap-1 rounded-control border border-surface-200 bg-white p-3"
          aria-busy="true"
          aria-label="טוען טיוטת תשובה"
        >
          <p className="text-sm font-semibold text-surface-800">טיוטת תשובה</p>
          <div className="flex flex-col gap-2.5 rounded-control border border-surface-200 p-3">
            <div className="h-3.5 w-[92%] animate-pulse rounded bg-surface-200" />
            <div className="h-3.5 w-[78%] animate-pulse rounded bg-surface-200" />
            <div className="h-3.5 w-[86%] animate-pulse rounded bg-surface-200" />
            <div className="h-3.5 w-[64%] animate-pulse rounded bg-surface-200" />
            <div className="h-3.5 w-[70%] animate-pulse rounded bg-surface-200" />
          </div>
          <p className="text-[11px] text-surface-500">יוצרת תשובה…</p>
        </div>
      ) : null}

      {draft ? (
        <div className="flex flex-col gap-2 rounded-control border border-surface-200 bg-white p-3">
          <p className="text-sm font-semibold text-surface-800">טיוטת תשובה</p>
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
              disabled={copyBlocked}
              className="absolute left-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-control text-surface-600 hover:bg-surface-100 hover:text-surface-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-surface-600"
              title={
                copyBlocked
                  ? "החליפו את [שם אחראי תמיכה] בשמכם לפני ההעתקה"
                  : copied
                    ? "הועתק"
                    : "העתק"
              }
              aria-label={
                copyBlocked
                  ? "העתקה חסומה — יש להחליף את שם אחראי התמיכה"
                  : copied
                    ? "הועתק"
                    : "העתק"
              }
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <CopiedCheckIcon className="text-emerald-700" />
              ) : (
                <CopyIcon />
              )}
            </button>
          </div>
          <p className="text-right text-xs font-bold leading-snug text-surface-600">
            שימו לב, זוהי הצעה בלבד. עליכם לוודא שהתשובה נכונה, מתאימה ומנוסחת
            נכון. האחריות על תקינות התשובה היא עליכם ועליכם בלבד.
          </p>
        </div>
      ) : null}

      {sources.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-1 text-sm text-surface-600">
            <p>
              {draftSourcesSummary(sources)}
              {" · "}
              {sources
                .map((s) => `${(s.similarity * 100).toFixed(0)}%`)
                .join(", ")}
            </p>
            <button
              type="button"
              className="shrink-0 font-semibold text-blue-700 hover:underline"
              onClick={() => setSourcesOpen((open) => !open)}
            >
              {sourcesOpen ? "הסתר מקורות" : "הצג מקורות"}
            </button>
          </div>
          {sourcesOpen ? (
            <ul className="flex flex-col gap-3">
              {sources.map((source) => (
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
  );
}
