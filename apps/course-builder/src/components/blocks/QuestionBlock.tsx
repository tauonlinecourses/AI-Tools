import { useEffect, useId, useRef, useState } from "react";
import type { CourseViewMode, QuestionOption, QuestionProps, QuestionType } from "../../lib/types";
import { CheckIcon, CopyIcon, PlusIcon, XIcon } from "../icons";
import { Field, TextField } from "./fields";

interface Props {
  props: QuestionProps;
  mode: CourseViewMode;
  onChange: (props: QuestionProps) => void;
  /** Implement mode: copy option text (and mark the component implemented upstream). */
  onCopyOption?: (text: string) => void;
}

function newOption(): QuestionOption {
  return { id: crypto.randomUUID(), text: "" };
}

const YES_NO_OPTIONS: QuestionOption[] = [
  { id: "__correct", text: "נכון" },
  { id: "__incorrect", text: "לא נכון" },
];

const COPIED_FEEDBACK_MS = 2000;

function QuestionCopyButton({
  copied,
  onCopy,
  title,
}: {
  copied: boolean;
  onCopy: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className="relative flex items-center justify-center shrink-0 w-11 h-5 text-surface-400 hover:text-surface-900 transition-colors duration-fast"
      title={title}
      aria-label={copied ? "הועתק" : title}
      onClick={onCopy}
    >
      <CopyIcon
        className={`w-3.5 h-3.5 transition-opacity duration-fast ${copied ? "opacity-0" : "opacity-100"}`}
      />
      <span
        className={`absolute inset-0 flex items-center justify-center text-[10px] leading-none text-surface-400 transition-opacity duration-fast pointer-events-none ${copied ? "opacity-100" : "opacity-0"}`}
        aria-hidden={!copied}
      >
        הועתק
      </span>
    </button>
  );
}

export function QuestionBlock({ props, mode, onChange, onCopyOption }: Props) {
  const radioGroup = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const questionType: QuestionType = props.questionType ?? "single_choice";
  const isYesNo = questionType === "yes_no";
  const isMultiple = questionType === "multiple_choice";
  const options = isYesNo ? YES_NO_OPTIONS : (props.options ?? []);
  const editable = mode === "edit";

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  function showCopiedFeedback(key: string) {
    setCopiedKey(key);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopiedKey(null), COPIED_FEEDBACK_MS);
  }

  function handleCopy(key: string, text: string) {
    onCopyOption?.(text);
    showCopiedFeedback(key);
  }

  const correctIds: Set<string> = new Set(
    isMultiple
      ? (props.correctOptionId?.split(",").filter(Boolean) ?? [])
      : props.correctOptionId ? [props.correctOptionId] : []
  );

  if (!editable) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-base font-semibold text-surface-900">
            {props.prompt || <span className="font-normal text-surface-400">ללא שאלה</span>}
          </p>
          {onCopyOption && (
            <QuestionCopyButton
              copied={copiedKey === "prompt"}
              title="העתק שאלה"
              onCopy={() => handleCopy("prompt", props.prompt ?? "")}
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => {
            const correct = correctIds.has(opt.id);
            return (
              <div
                key={opt.id}
                className={`flex items-center gap-2 px-3 py-2 border text-base ${
                  correct
                    ? "border-surface-900 bg-surface-50 text-surface-900 font-medium"
                    : "border-surface-200 text-surface-700"
                }`}
              >
                {correct && <CheckIcon className="w-3.5 h-3.5" />}
                <span className="flex-1 min-w-0">
                  {opt.text || <span className="text-surface-400">אפשרות ריקה</span>}
                </span>
                {onCopyOption && (
                  <QuestionCopyButton
                    copied={copiedKey === opt.id}
                    title="העתק אפשרות"
                    onCopy={() => handleCopy(opt.id, opt.text ?? "")}
                  />
                )}
              </div>
            );
          })}
          {options.length === 0 && (
            <p className="text-base text-surface-400">לא הוגדרו אפשרויות</p>
          )}
        </div>
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
        <TextField
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
          <div key={opt.id} className="flex items-center gap-2">
            <input
              type={isMultiple ? "checkbox" : "radio"}
              name={radioGroup}
              className="accent-black shrink-0"
              checked={correctIds.has(opt.id)}
              onChange={() => toggleCorrect(opt.id)}
              title="תשובה נכונה"
            />
            {isYesNo ? (
              <span className="flex-1 text-sm text-surface-700">{opt.text}</span>
            ) : (
              <TextField
                value={opt.text}
                placeholder="טקסט האפשרות"
                onChange={(e) => updateOption(opt.id, e.target.value)}
              />
            )}
            {!isYesNo && (
              <button
                className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast shrink-0"
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
    </div>
  );
}
