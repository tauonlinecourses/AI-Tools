import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "@workspace/ui";
import { askQuestion, getDocument } from "../lib/dataClient";
import type { AskSource, ChatTurn, Document } from "../lib/types";
import { DocBody } from "./DocBody";

interface AskPageProps {
  onOpenDocument?: (doc: Document) => void;
}

export function AskPage({ onOpenDocument }: AskPageProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSources, setActiveSources] = useState<AskSource[]>([]);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
      setActiveSources(result.sources);
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
      setPreviewLoading(true);
      setPreviewDoc(null);
      try {
        const doc = await getDocument(source.documentId);
        setPreviewDoc(doc);
        onOpenDocument?.(doc);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "טעינת המסמך נכשלה"
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [onOpenDocument]
  );

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-0 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          {turns.length === 0 && !busy ? (
            <div className="flex h-full min-h-[200px] items-center justify-center text-center text-sm text-surface-600">
              שאלו שאלה על מאגר הידע. התשובה תתבסס על המסמכים ותציג מקורות.
            </div>
          ) : null}

          {turns.map((turn, i) => (
            <div
              key={i}
              className={`flex ${
                turn.role === "user" ? "justify-start" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded-control px-3 py-2 text-sm leading-relaxed ${
                  turn.role === "user"
                    ? "bg-sky-50 text-sky-950"
                    : "border border-surface-200 bg-white text-surface-900"
                }`}
              >
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-surface-500">
                  {turn.role === "user" ? "שאלה" : "תשובה"}
                </p>
                <p className="whitespace-pre-wrap">{turn.content}</p>
                {turn.sources && turn.sources.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-surface-100 pt-2">
                    {turn.sources.map((s) => (
                      <button
                        key={s.documentId}
                        type="button"
                        onClick={() => {
                          setActiveSources(turn.sources ?? []);
                          void openSource(s);
                        }}
                        className="rounded-control border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs font-medium text-surface-700 hover:bg-sky-50 hover:text-sky-950"
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
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

        {error ? (
          <p className="px-4 text-xs text-danger sm:px-6">{error}</p>
        ) : null}

        <div className="shrink-0 border-t border-surface-200 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              dir="rtl"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleAsk();
                }
              }}
              placeholder="כתבו שאלה על המסמכים…"
              disabled={busy}
              className="min-h-[2.75rem] w-full flex-1 resize-y rounded-control border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
            />
            <Button
              variant="primary"
              disabled={busy || !input.trim()}
              onClick={() => void handleAsk()}
            >
              שלח
            </Button>
          </div>
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t border-surface-200 bg-surface-50 lg:w-[36%] lg:border-t-0 lg:border-s">
        <div className="border-b border-surface-200 px-3 py-2.5">
          <p className="text-sm font-semibold text-surface-900">מקורות</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {activeSources.length === 0 && !previewDoc ? (
            <p className="text-sm text-surface-500">
              מקורות מהתשובה האחרונה יופיעו כאן. לחצו על מקור כדי לפתוח את
              המסמך כפי שהוא שמור.
            </p>
          ) : null}

          {activeSources.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {activeSources.map((s) => (
                <li key={s.documentId}>
                  <button
                    type="button"
                    onClick={() => void openSource(s)}
                    className="w-full rounded-control border border-surface-200 bg-white p-2.5 text-start transition-colors hover:border-sky-300 hover:bg-sky-50"
                  >
                    <p className="text-sm font-semibold text-surface-900">
                      {s.title}
                    </p>
                    {s.folderName ? (
                      <p className="text-xs text-surface-500">{s.folderName}</p>
                    ) : null}
                    <p className="mt-1 line-clamp-3 text-xs text-surface-600">
                      {s.excerpt}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-surface-600">
              <Spinner size="sm" />
              טוען מסמך…
            </div>
          ) : null}

          {previewDoc ? (
            <Card className="!p-3">
              <h3 className="mb-2 text-base font-semibold text-surface-900">
                {previewDoc.title}
              </h3>
              {previewDoc.body.trim() ? (
                <DocBody body={previewDoc.body} />
              ) : (
                <p className="text-sm text-surface-500">אין תוכן.</p>
              )}
            </Card>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
