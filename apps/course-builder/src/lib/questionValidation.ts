import type { PageComponent, QuestionProps, QuestionType } from "./types";

const YES_NO_OPTION_IDS = new Set(["__correct", "__incorrect"]);

/** Issues for a single question block / embedded interactive-video question. */
export function validateQuestionProps(props: QuestionProps): string[] {
  const issues: string[] = [];
  const questionType: QuestionType = props.questionType ?? "single_choice";
  const isYesNo = questionType === "yes_no";
  const isMultiple = questionType === "multiple_choice";

  const options = isYesNo
    ? [
        { id: "__correct", text: "נכון" },
        { id: "__incorrect", text: "לא נכון" },
      ]
    : (props.options ?? []);

  if (!isYesNo) {
    if (options.length === 0) {
      issues.push("אין אפשרויות תשובה");
    } else {
      const emptyIndexes: number[] = [];
      options.forEach((opt, i) => {
        if (!opt.text?.trim()) emptyIndexes.push(i + 1);
      });
      if (emptyIndexes.length === 1) {
        issues.push(`אפשרות ${emptyIndexes[0]} ריקה`);
      } else if (emptyIndexes.length > 1) {
        issues.push(`אפשרויות ריקות: ${emptyIndexes.join(", ")}`);
      }
    }
  }

  const correctIds = isMultiple
    ? (props.correctOptionId?.split(",").filter(Boolean) ?? [])
    : props.correctOptionId?.trim()
      ? [props.correctOptionId.trim()]
      : [];

  const optionIds = new Set(options.map((o) => o.id));
  // Ignore stale correct ids that no longer match an option (except yes/no fixed ids).
  const validCorrect = correctIds.filter(
    (id) => optionIds.has(id) || (isYesNo && YES_NO_OPTION_IDS.has(id))
  );
  if (validCorrect.length === 0) {
    issues.push("לא נבחרה תשובה נכונה");
  }

  return issues;
}

/** Issue lines for every question / interactive-video question on a page. */
export function collectQuestionIssues(
  components: PageComponent[] | null | undefined
): string[] {
  if (!components?.length) return [];

  const lines: string[] = [];
  let standaloneQuestionIndex = 0;

  for (const component of components) {
    if (component.type === "question") {
      standaloneQuestionIndex += 1;
      const issues = validateQuestionProps(component.props);
      if (issues.length > 0) {
        lines.push(`שאלה ${standaloneQuestionIndex}: ${issues.join("; ")}`);
      }
      continue;
    }

    if (component.type === "interactive_video") {
      const questions = component.props.questions ?? [];
      questions.forEach((q, i) => {
        const issues = validateQuestionProps(q);
        if (issues.length > 0) {
          lines.push(
            `וידאו אינטרקטיבי — שאלה ${i + 1}: ${issues.join("; ")}`
          );
        }
      });
    }
  }

  return lines;
}

/**
 * Validate all `question` and interactive-video embedded questions on a page.
 * Returns a Hebrew alert message, or null when everything is OK.
 */
export function validatePageQuestions(
  components: PageComponent[] | null | undefined
): string | null {
  const lines = collectQuestionIssues(components);
  if (lines.length === 0) return null;
  return `יש לתקן את השאלות לפני סימון העמוד כמוכן להטמעה:\n\n${lines.join("\n")}`;
}

/**
 * Validate questions across every page in a lesson.
 * Returns a Hebrew alert message grouped by page title, or null when OK.
 */
export function validateLessonQuestions(
  pages: Array<{ title: string; components: PageComponent[] }>
): string | null {
  if (pages.length === 0) return null;

  const blocks: string[] = [];
  for (const page of pages) {
    const lines = collectQuestionIssues(page.components);
    if (lines.length === 0) continue;
    const title = page.title.trim() || "ללא כותרת";
    blocks.push(
      `עמוד "${title}":\n${lines.map((line) => `  ${line}`).join("\n")}`
    );
  }

  if (blocks.length === 0) return null;
  return `יש לתקן את השאלות לפני סימון השיעור כמוכן להטמעה:\n\n${blocks.join("\n\n")}`;
}
