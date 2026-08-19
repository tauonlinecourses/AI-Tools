import { useState } from "react";
import type { CourseViewMode, InteractiveVideoProps, QuestionProps, QuestionType } from "../../lib/types";
import { QUESTION_TYPE_LABEL } from "../../lib/types";
import { ChevronDownIcon, PlusIcon } from "../icons";
import { VideoBlock } from "./VideoBlock";
import { QuestionBlock } from "./QuestionBlock";

interface Props {
  props: InteractiveVideoProps;
  mode: CourseViewMode;
  onChange: (props: InteractiveVideoProps) => void;
  pageTitle: string;
  videoNumber: number;
  onCopyOption?: (text: string) => void;
}

function newQuestion(): QuestionProps {
  return {
    questionType: "single_choice",
    prompt: "",
    options: [
      { id: crypto.randomUUID(), text: "" },
      { id: crypto.randomUUID(), text: "" },
    ],
  };
}

export function InteractiveVideoBlock({
  props,
  mode,
  onChange,
  pageTitle,
  videoNumber,
  onCopyOption,
}: Props) {
  const editable = mode === "edit";
  const questions = props.questions ?? [];
  const [expanded, setExpanded] = useState(true);

  if (questions.length === 0 && editable) {
    onChange({ ...props, questions: [newQuestion()] });
    return null;
  }

  function updateQuestion(index: number, updated: QuestionProps) {
    const next = [...questions];
    next[index] = updated;
    onChange({ ...props, questions: next });
  }

  function removeQuestion(index: number) {
    const next = questions.filter((_, i) => i !== index);
    onChange({ ...props, questions: next.length > 0 ? next : [newQuestion()] });
  }

  function addQuestion() {
    onChange({ ...props, questions: [...questions, newQuestion()] });
  }

  return (
    <div className="flex flex-col gap-0">
      <VideoBlock
        props={props}
        mode={mode}
        onChange={(videoProps) => onChange({ ...props, ...videoProps })}
        pageTitle={pageTitle}
        videoNumber={videoNumber}
      />
      <div className="flex flex-col border-t border-surface-200 bg-surface-50">
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          שאלות אינטרקטיביות ({questions.length})
        </button>
        {expanded && <div className="flex flex-col gap-4 px-4 pb-4">
        {questions.map((q, i) => (
          <div key={i} className="relative flex flex-col gap-0 border border-surface-200 bg-white rounded overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-50 border-b border-surface-200">
              {editable ? (
                <select
                  className="bg-transparent outline-none cursor-pointer text-sm font-semibold text-surface-700"
                  value={q.questionType ?? "single_choice"}
                  onChange={(e) => updateQuestion(i, { ...q, questionType: e.target.value as QuestionType })}
                >
                  {(Object.entries(QUESTION_TYPE_LABEL) as [QuestionType, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    )
                  )}
                </select>
              ) : (
                <span className="text-sm font-semibold text-surface-700">
                  {QUESTION_TYPE_LABEL[(q.questionType as QuestionType) ?? "single_choice"]}
                </span>
              )}
              {editable && questions.length > 1 && (
                <button
                  type="button"
                  className="mr-auto text-xs text-surface-400 hover:text-danger transition-colors"
                  onClick={() => removeQuestion(i)}
                  title="הסר שאלה"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex gap-3 p-3 items-start">
              <div className="flex-1 min-w-0">
                <QuestionBlock
                  props={q}
                  mode={mode}
                  onChange={(updated) => updateQuestion(i, updated as QuestionProps)}
                  onCopyOption={onCopyOption}
                />
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 pt-0">
                <span className="text-sm font-semibold text-surface-700">תזמון</span>
                <input
                  type="text"
                  className="w-20 h-10 px-3 text-base text-center border border-surface-200 text-surface-700 placeholder:text-surface-400 outline-none transition-colors duration-fast"
                  placeholder="MM:SS"
                  dir="ltr"
                  value={q.timestamp ?? ""}
                  readOnly={!editable}
                  onChange={editable ? (e) => updateQuestion(i, { ...q, timestamp: e.target.value }) : undefined}
                />
              </div>
            </div>
          </div>
        ))}
        {editable && (
          <button
            type="button"
            className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors duration-fast py-1"
            onClick={addQuestion}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            הוסף שאלה
          </button>
        )}
        </div>}
      </div>
    </div>
  );
}
