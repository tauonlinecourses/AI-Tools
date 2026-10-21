import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@workspace/ui";
import { askQuestion, getDocument } from "../lib/dataClient";
import type { AskSource, ChatTurn, Document } from "../lib/types";

interface AskPageProps {
  onOpenDocument?: (doc: Document) => void;
}

export function AskPage({ onOpenDocument }: AskPageProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  const handleAsk = useCallback(async () => {
    const question = input.trim();
    if (!question || busy) return;

    setError(null);
    setBusy(true);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: question }]);

    try {
      const history = turns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const result = await askQuestion({ question, history });
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "השאלה נכשלה");
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "אירעה שגיאה בעיבוד השאלה. נסו שוב.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, input, turns]);

  const openSource = useCallback(
    async (source: AskSource) => {
      try {
        const doc = await getDocument(source.documentId);
        onOpenDocument?.(doc);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "טעינת המסמך נכשלה"
        );
      }
    },
    [onOpenDocument]
  );

  return (
    <div dir="rtl" className="relative flex h-full min-h-0 flex-col bg-[#f8f9fa]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-8">
        {turns.length === 0 && !busy ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-center">
            <div className="max-w-md space-y-2">
              <p className="text-lg font-medium text-surface-800">
                שאלו שאלה על מאגר הידע
              </p>
              <p className="text-sm text-surface-500">
                התשובה תתבסס על המסמכים. לחצו על מקור בתשובה או בתיקיות כדי
                לפתוח את המסמך.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {turns.map((turn, i) => (
            <div key={i} className="flex flex-col gap-2">
              {turn.role === "user" ? (
                <div className="self-start rounded-[1rem] bg-white px-4 py-3 text-sm leading-relaxed text-surface-900 ring-1 ring-black/5">
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
              ) : (
                <div className="rounded-[1rem] bg-white px-4 py-4 text-sm leading-relaxed text-surface-900 ring-1 ring-black/5">
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                  {turn.sources && turn.sources.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-surface-100 pt-3">
                      <span className="me-1 text-xs text-surface-500">
                        מקורות:
                      </span>
                      {turn.sources.map((s, idx) => (
                        <button
                          key={s.documentId}
                          type="button"
                          title={s.title}
                          onClick={() => void openSource(s)}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-100 px-2 text-[0.7rem] font-semibold text-surface-700 transition-colors hover:bg-sky-100 hover:text-sky-950"
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {busy ? (
            <div className="inline-flex items-center gap-2 text-sm text-surface-600">
              <Spinner size="sm" />
              מחפש במסמכים…
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#f8f9fa] via-[#f8f9fa] to-transparent px-4 pb-3 pt-10 sm:px-8">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          {error ? (
            <p className="mb-2 text-center text-xs text-danger">{error}</p>
          ) : null}
          <div className="flex items-end gap-2 rounded-full border border-surface-200 bg-white px-3 py-2 shadow-md shadow-black/5 ring-1 ring-black/[0.03]">
            <textarea
              dir="rtl"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleAsk();
                }
              }}
              placeholder="שאלו שאלה או בקשו משהו…"
              disabled={busy}
              className="max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-surface-900 outline-none placeholder:text-surface-400 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void handleAsk()}
              aria-label="שליחה"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-900 text-white transition-opacity disabled:opacity-30"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M10 16.5a.75.75 0 0 1-.75-.75V6.56L6.53 9.28a.75.75 0 1 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 1 1-1.06 1.06L10.75 6.56v9.19a.75.75 0 0 1-.75.75Z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[0.65rem] text-surface-400">
            התשובות מבוססות על המסמכים במאגר. מומלץ לוודא מול המקור.
          </p>
        </div>
      </div>
    </div>
  );
}
