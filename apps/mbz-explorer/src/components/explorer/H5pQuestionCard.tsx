import { Badge } from "@workspace/ui";

interface MultiChoiceParsed {
  question?: string;
  answers?: Array<{
    text?: string;
    correct?: boolean | string | number;
    tipsAndFeedback?: { chosenFeedback?: string; notChosenFeedback?: string };
  }>;
  overallFeedback?: unknown;
}

interface TrueFalseParsed {
  question?: string;
  correct?: boolean | string | number;
  l10n?: {
    trueText?: string;
    falseText?: string;
    true?: string;
    false?: string;
  };
  behaviour?: {
    feedbackOnCorrect?: string;
    feedbackOnWrong?: string;
  };
}

interface QuestionSetParsed {
  intro?: string;
  progressType?: string;
  questions?: Array<{
    library?: string;
    params?: unknown;
    subContentId?: string;
  }>;
}

interface ColumnItem {
  content?: {
    library?: string;
    params?: unknown;
    subContentId?: string;
  };
}

interface ColumnParsed {
  content?: ColumnItem[];
}

interface H5pQuestionCardProps {
  machineName: string;
  version: string;
  parsed: unknown;
  renderer: "multichoice" | "truefalse" | "questionset" | "column" | "generic";
  introHtml: string | null;
  hydrateHtml: (html: string) => string;
}

function isCorrect(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "true";
}

function isFalseAnswer(val: unknown): boolean {
  return val === false || val === 0 || val === "0" || val === "false";
}

function libraryBase(library?: string): string {
  if (!library) return "";
  return library.split(" ")[0] ?? library;
}

function AnswerOption({
  correct,
  labelHtml,
  hydrateHtml,
}: {
  correct: boolean;
  labelHtml: string;
  hydrateHtml: (html: string) => string;
}) {
  return (
    <li
      className={[
        "border p-3",
        correct ? "border-emerald-600 bg-emerald-50" : "border-surface-200 bg-white",
      ].join(" ")}
    >
      <Badge variant={correct ? "success" : "default"} size="sm">
        {correct ? "Correct" : "Incorrect"}
      </Badge>
      <div
        className="mt-2 prose prose-sm max-w-none"
        dir="auto"
        dangerouslySetInnerHTML={{ __html: hydrateHtml(labelHtml) }}
      />
    </li>
  );
}

function MultiChoiceBlock({
  data,
  hydrateHtml,
  index,
}: {
  data: MultiChoiceParsed;
  hydrateHtml: (html: string) => string;
  index?: number;
}) {
  const answers = data.answers ?? [];
  return (
    <div className="flex flex-col gap-3 border border-surface-200 bg-white p-4">
      {typeof index === "number" && (
        <p className="text-2xs font-semibold text-surface-500 uppercase tracking-wide">
          Question {index + 1}
        </p>
      )}
      {data.question && (
        <div
          className="prose prose-sm max-w-none text-surface-900"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: hydrateHtml(data.question) }}
        />
      )}
      <ul className="flex flex-col gap-2">
        {answers.map((ans, i) => (
          <AnswerOption
            key={i}
            correct={isCorrect(ans.correct)}
            labelHtml={ans.text || ""}
            hydrateHtml={hydrateHtml}
          />
        ))}
      </ul>
    </div>
  );
}

function TrueFalseBlock({
  data,
  hydrateHtml,
  index,
}: {
  data: TrueFalseParsed;
  hydrateHtml: (html: string) => string;
  index?: number;
}) {
  // H5P stores correct as "true" | "false" (string select) or boolean
  const correctIsTrue = isCorrect(data.correct);
  const correctIsFalse = isFalseAnswer(data.correct);
  // If neither parsed, default to true being correct (H5P default)
  const trueIsCorrect = correctIsFalse ? false : correctIsTrue || !correctIsFalse;
  const falseIsCorrect = !trueIsCorrect;

  const trueLabel = data.l10n?.trueText || data.l10n?.true || "True";
  const falseLabel = data.l10n?.falseText || data.l10n?.false || "False";

  return (
    <div className="flex flex-col gap-3 border border-surface-200 bg-white p-4">
      {typeof index === "number" && (
        <p className="text-2xs font-semibold text-surface-500 uppercase tracking-wide">
          Question {index + 1}
        </p>
      )}
      {data.question && (
        <div
          className="prose prose-sm max-w-none text-surface-900"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: hydrateHtml(data.question) }}
        />
      )}
      <ul className="flex flex-col gap-2">
        <AnswerOption
          correct={trueIsCorrect}
          labelHtml={trueLabel}
          hydrateHtml={hydrateHtml}
        />
        <AnswerOption
          correct={falseIsCorrect}
          labelHtml={falseLabel}
          hydrateHtml={hydrateHtml}
        />
      </ul>
    </div>
  );
}

function renderNestedContent(
  library: string | undefined,
  params: unknown,
  hydrateHtml: (html: string) => string,
  index?: number
) {
  const base = libraryBase(library);

  if (base === "H5P.MultiChoice") {
    return (
      <MultiChoiceBlock
        key={index}
        data={(params ?? {}) as MultiChoiceParsed}
        hydrateHtml={hydrateHtml}
        index={index}
      />
    );
  }

  if (base === "H5P.TrueFalse") {
    return (
      <TrueFalseBlock
        key={index}
        data={(params ?? {}) as TrueFalseParsed}
        hydrateHtml={hydrateHtml}
        index={index}
      />
    );
  }

  if (base === "H5P.AdvancedText" || base === "H5P.Text") {
    const text =
      typeof params === "object" && params && "text" in params
        ? String((params as { text?: string }).text ?? "")
        : typeof params === "string"
          ? params
          : "";
    if (!text) return null;
    return (
      <div
        key={index}
        className="prose prose-sm max-w-none text-surface-900 mbz-rendered-content"
        dir="auto"
        dangerouslySetInnerHTML={{ __html: hydrateHtml(text) }}
      />
    );
  }

  // Nested unknown type — compact JSON
  return (
    <div key={index} className="border border-surface-200 bg-surface-50 p-3 space-y-2">
      <Badge variant="warning" size="sm">
        {base || "unknown"}
      </Badge>
      <pre className="text-2xs font-mono overflow-auto max-h-48 whitespace-pre-wrap" dir="auto">
        {JSON.stringify(params, null, 2)}
      </pre>
    </div>
  );
}

export function H5pQuestionCard({
  machineName,
  version,
  parsed,
  renderer,
  introHtml,
  hydrateHtml,
}: H5pQuestionCardProps) {
  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-6">
      {/* Moodle activity intro (HTML above the H5P) */}
      {introHtml && (
        <div
          className="prose prose-sm max-w-none text-surface-900 mbz-rendered-content"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: hydrateHtml(introHtml) }}
        />
      )}

      <div className="flex items-center gap-2">
        <Badge variant={renderer === "generic" ? "warning" : "info"} size="sm">
          {machineName}
        </Badge>
        {version && <span className="text-xs text-surface-500">v{version}</span>}
        {renderer === "generic" && (
          <span className="text-xs text-surface-500">no custom renderer yet</span>
        )}
      </div>

      {renderer === "multichoice" && (
        <MultiChoiceBlock data={(parsed ?? {}) as MultiChoiceParsed} hydrateHtml={hydrateHtml} />
      )}

      {renderer === "truefalse" && (
        <TrueFalseBlock data={(parsed ?? {}) as TrueFalseParsed} hydrateHtml={hydrateHtml} />
      )}

      {renderer === "questionset" && (() => {
        const qs = (parsed ?? {}) as QuestionSetParsed;
        return (
          <div className="flex flex-col gap-4">
            {qs.intro && (
              <div
                className="prose prose-sm max-w-none text-surface-900 mbz-rendered-content"
                dir="auto"
                dangerouslySetInnerHTML={{ __html: hydrateHtml(qs.intro) }}
              />
            )}
            <div className="flex flex-col gap-4">
              {(qs.questions ?? []).map((q, i) =>
                renderNestedContent(q.library, q.params, hydrateHtml, i)
              )}
            </div>
          </div>
        );
      })()}

      {renderer === "column" && (() => {
        const col = (parsed ?? {}) as ColumnParsed;
        return (
          <div className="flex flex-col gap-4">
            {(col.content ?? []).map((item, i) =>
              renderNestedContent(item.content?.library, item.content?.params, hydrateHtml, i)
            )}
          </div>
        );
      })()}

      {renderer === "generic" && parsed != null && (
        <pre
          className="text-xs font-mono bg-surface-50 border border-surface-200 p-3 overflow-auto max-h-[60vh] whitespace-pre-wrap"
          dir="auto"
        >
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}
