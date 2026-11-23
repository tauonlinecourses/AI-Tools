import { useEffect, useId, useRef, useState } from "react";
import type { CourseViewMode, QuestionOption, QuestionProps, QuestionType } from "../../lib/types";
import { stripTrailingPeriod } from "../../lib/questionText";
import { CheckIcon, CopyIcon, PlusIcon, XIcon } from "../icons";
import { AutoGrowTextField, Field } from "./fields";

interface Props {
  props: QuestionProps;
  mode: CourseViewMode;
  onChange: (props: QuestionProps) => void;
  /** Implement mode: copy option / prompt text to the clipboard. */
  onCopyOption?: (text: string) => void;
  /** Edit mode: add another question component after this one. */
  onAddQuestion?: () => void;
}

function newOption(): QuestionOption {
  return { id: crypto.randomUUID(), text: "" };
}

const YES_NO_OPTIONS: QuestionOption[] = [
  { id: "__correct", text: "נכון" },
  { id: "__incorrect", text: "לא נכון" },
];

const COPIED_FEEDBACK_MS = 1000;

function QuestionCopyButton({
  active,
  flashing,
  onCopy,
  title,
}: {
  /** Last used copy control in this question — black; others stay grey. */
  active: boolean;
  /** Brief **הועתק** label after a copy. */
  flashing: boolean;
  onCopy: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`relative flex items-center justify-center shrink-0 w-11 h-5 transition-colors duration-fast ${
        active
          ? "text-surface-900"
          : "text-surface-400 hover:text-surface-900"
      }`}
      title={title}
      aria-label={flashing ? "הועתק" : title}
      aria-pressed={active}
      onClick={onCopy}
    >
      <CopyIcon
        strokeWidth={active ? 2.75 : 2}
        className={`w-3.5 h-3.5 transition-opacity duration-fast ${
          flashing ? "opacity-0" : "opacity-100"
        }`}
      />
      <span
        className={`absolute inset-0 flex items-center justify-center text-xs leading-none transition-opacity duration-fast pointer-events-none ${
          flashing ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={!flashing}
      >
        הועתק
      </span>
    </button>
  );
}

export function QuestionBlock({
  props,
  mode,
  onChange,
  onCopyOption,
  onAddQuestion,
}: Props) {
  const radioGroup = useId();
  /** Last in-body copy in this question — stays black until another item here is copied. */
  const [lastCopiedKey, setLastCopiedKey] = useState<string | null>(null);
  /** Brief **הועתק** flash key (~1s). */
  const [flashCopiedKey, setFlashCopiedKey] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const questionType: QuestionType = props.questionType ?? "single_choice";
  const isYesNo = questionType === "yes_no";
  const isMultiple = questionType === "multiple_choice";
  const options = isYesNo ? YES_NO_OPTIONS : (props.options ?? []);
  const editable = mode === "edit";
  const explanation = props.explanation ?? "";
  const [showExplanation, setShowExplanation] = useState(
    () => !!explanation.trim()
  );

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    if (explanation.trim()) setShowExplanation(true);
  }, [explanation]);

  function handleCopy(key: string, text: string) {
    onCopyOption?.(text);
    setLastCopiedKey(key);
    setFlashCopiedKey(key);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setFlashCopiedKey(null);
      flashTimer.current = null;
    }, COPIED_FEEDBACK_MS);
  }

  const correctIds: Set<string> = new Set(
    isMultiple
      ? (props.correctOptionId?.split(",").filter(Boolean) ?? [])
      : props.correctOptionId ? [props.correctOptionId] : []
  );

  if (!editable) {
    /** Implement only: drop trailing sentence periods on answers (not the prompt). */
    const forImplement = mode === "implement";
    const displayPrompt = props.prompt ?? "";

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <AutoGrowTextField
            readOnly
            value={displayPrompt}
            placeholder="ללא שאלה"
            className="flex-1 min-w-0 font-semibold border-transparent px-0"
          />
          {onCopyOption && (
            <QuestionCopyButton
              active={lastCopiedKey === "prompt"}
              flashing={flashCopiedKey === "prompt"}
              title="העתק שאלה"
              onCopy={() => handleCopy("prompt", displayPrompt)}
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => {
            const correct = correctIds.has(opt.id);
            const displayText = forImplement
              ? stripTrailingPeriod(opt.text ?? "")
              : (opt.text ?? "");
            return (
              <div
                key={opt.id}
                className={`flex items-center gap-2 px-3 py-1.5 border text-base ${
                  correct
                    ? "border-surface-900 bg-surface-50 text-surface-900 font-medium"
                    : "border-surface-200 text-surface-700"
                }`}
              >
                {correct && <CheckIcon className="w-3.5 h-3.5 shrink-0" />}
                <AutoGrowTextField
                  readOnly
                  value={displayText}
                  placeholder="אפשרות ריקה"
                  className={`flex-1 min-w-0 border-transparent bg-transparent px-0 ${
                    correct ? "font-medium" : ""
                  }`}
                />
                {onCopyOption && (
                  <QuestionCopyButton
                    active={lastCopiedKey === opt.id}
                    flashing={flashCopiedKey === opt.id}
                    title="העתק אפשרות"
                    onCopy={() => handleCopy(opt.id, displayText)}
                  />
                )}
              </div>
            );
          })}
          {options.length === 0 && (
            <p className="text-base text-surface-400">לא הוגדרו אפשרויות</p>
          )}
        </div>
        {explanation.trim() && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-surface-700">הסבר</span>
            <div className="flex items-start gap-2">
              <AutoGrowTextField
                readOnly
                value={explanation}
                className="flex-1 min-w-0 border-transparent px-0 text-surface-700"
              />
              {onCopyOption && (
                <QuestionCopyButton
                  active={lastCopiedKey === "explanation"}
                  flashing={flashCopiedKey === "explanation"}
                  title="העתק הסבר"
                  onCopy={() => handleCopy("explanation", explanation)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function updateOption(id: string, text: string) {
    onChange({
      ...props,
      options: (props.options ?? []).map((o) => (o.id === id ? { ...o, text } : o)),
    });
  }

  function removeOption(id: string) {
    const newCorrect = isMultiple
      ? [...correctIds].filter((cid) => cid !== id).join(",") || undefined
      : props.correctOptionId === id ? undefined : props.correctOptionId;
    onChange({
      ...props,
      options: (props.options ?? []).filter((o) => o.id !== id),
      correctOptionId: newCorrect,
    });
  }

  function toggleCorrect(id: string) {
    if (isMultiple) {
      const next = new Set(correctIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange({ ...props, correctOptionId: [...next].join(",") || undefined });
    } else {
      onChange({ ...props, correctOptionId: id });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="שאלה">
        <AutoGrowTextField
          value={props.prompt ?? ""}
          placeholder="נוסח השאלה"
          onChange={(e) => onChange({ ...props, prompt: e.target.value })}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-surface-700">
          {isYesNo ? "תשובה נכונה" : isMultiple ? "אפשרויות (סמנו את התשובות הנכונות)" : "אפשרויות (סמנו את התשובה הנכונה)"}
        </span>
        {options.map((opt) => (
          <div key={opt.id} className="flex items-start gap-2">
            <input
              type={isMultiple ? "checkbox" : "radio"}
              name={radioGroup}
              className="accent-black shrink-0 size-[1.125rem] cursor-pointer mt-2.5"
              checked={correctIds.has(opt.id)}
              onChange={() => toggleCorrect(opt.id)}
              title="תשובה נכונה"
            />
            {isYesNo ? (
              <span className="flex-1 text-sm text-surface-700 py-2">{opt.text}</span>
            ) : (
              <AutoGrowTextField
                value={opt.text}
                placeholder="טקסט האפשרות"
                onChange={(e) => updateOption(opt.id, e.target.value)}
              />
            )}
            {!isYesNo && (
              <button
                className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast shrink-0 mt-1.5"
                title="הסר אפשרות"
                onClick={() => removeOption(opt.id)}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {!isYesNo && (
          <button
            className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors duration-fast py-1"
            onClick={() => onChange({ ...props, options: [...(props.options ?? []), newOption()] })}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            הוסף אפשרות
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-surface-200 pt-3">
        {!showExplanation ? (
          <button
            type="button"
            className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors duration-fast py-1"
            onClick={() => setShowExplanation(true)}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            הוספת הסבר (אופציונלי)
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-surface-700">
                הסבר לתשובה הנכונה
              </span>
              <button
                type="button"
                className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast shrink-0"
                title="סגור הסבר"
                aria-label="סגור הסבר"
                onClick={() => {
                  setShowExplanation(false);
                  if (explanation.trim()) {
                    onChange({ ...props, explanation: "" });
                  }
                }}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <AutoGrowTextField
              value={explanation}
              placeholder="הסבר אופציונלי לתשובה הנכונה"
              onChange={(e) =>
                onChange({ ...props, explanation: e.target.value })
              }
            />
          </>
        )}
      </div>

      {onAddQuestion && (
        <button
          type="button"
          className="self-center inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors duration-fast py-1"
          onClick={onAddQuestion}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          הוספת שאלה
        </button>
      )}
    </div>
  );
}
