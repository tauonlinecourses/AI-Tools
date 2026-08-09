import { useId } from "react";
import type { QuestionOption, QuestionProps } from "../../lib/types";
import { CheckIcon, PlusIcon, XIcon } from "../icons";
import { Field, TextField } from "./fields";

interface Props {
  props: QuestionProps;
  editable: boolean;
  onChange: (props: QuestionProps) => void;
}

function newOption(): QuestionOption {
  return { id: crypto.randomUUID(), text: "" };
}

export function QuestionBlock({ props, editable, onChange }: Props) {
  const radioGroup = useId();
  const options = props.options ?? [];

  if (!editable) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold text-surface-900">
          {props.prompt || <span className="font-normal text-surface-400">ללא שאלה</span>}
        </p>
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => {
            const correct = opt.id === props.correctOptionId;
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
                <span>{opt.text || <span className="text-surface-400">אפשרות ריקה</span>}</span>
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
      options: options.map((o) => (o.id === id ? { ...o, text } : o)),
    });
  }

  function removeOption(id: string) {
    onChange({
      ...props,
      options: options.filter((o) => o.id !== id),
      correctOptionId: props.correctOptionId === id ? undefined : props.correctOptionId,
    });
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
          אפשרויות (סמנו את התשובה הנכונה)
        </span>
        {options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <input
              type="radio"
              name={radioGroup}
              className="accent-black shrink-0"
              checked={props.correctOptionId === opt.id}
              onChange={() => onChange({ ...props, correctOptionId: opt.id })}
              title="תשובה נכונה"
            />
            <TextField
              value={opt.text}
              placeholder="טקסט האפשרות"
              onChange={(e) => updateOption(opt.id, e.target.value)}
            />
            <button
              className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast shrink-0"
              title="הסר אפשרות"
              onClick={() => removeOption(opt.id)}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors duration-fast py-1"
          onClick={() => onChange({ ...props, options: [...options, newOption()] })}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          הוסף אפשרות
        </button>
      </div>
    </div>
  );
}
