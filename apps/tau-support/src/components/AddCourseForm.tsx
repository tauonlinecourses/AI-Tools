import { useState, type FormEvent } from "react";
import { Button, Input, Spinner } from "@workspace/ui";
import type { CourseEntry } from "../lib/courses";

/** Used when creating a course; server also tries the Hebrew tech-forum fallbacks. */
const DEFAULT_FORUM_CATEGORY = "בעיות טכניות";

/** Example pieces — not a real course; for the annotated URL only. */
const EXAMPLE_COURSE_ID = "course-v1:TAU+CourseKey+2024_1";
const EXAMPLE_TOPIC_ID = "f098c72b35f59492894139fc8cdd35358345fec8";

function UrlMark({
  children,
  tone,
}: {
  children: string;
  tone: "course" | "topic";
}) {
  const toneClass =
    tone === "course"
      ? "bg-sky-100 text-sky-900 ring-sky-300"
      : "bg-violet-100 text-violet-900 ring-violet-300";
  return (
    <mark
      className={`rounded px-0.5 py-0.5 font-semibold ring-1 ring-inset ${toneClass}`}
    >
      {children}
    </mark>
  );
}

function LegendChip({
  tone,
  label,
}: {
  tone: "course" | "topic";
  label: string;
}) {
  const toneClass =
    tone === "course"
      ? "bg-sky-100 text-sky-900 ring-sky-300"
      : "bg-violet-100 text-violet-900 ring-violet-300";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${toneClass}`}
    >
      {label}
    </span>
  );
}

function FieldLabel({
  htmlFor,
  tone,
  children,
}: {
  htmlFor: string;
  tone: "course" | "topic";
  children: string;
}) {
  const toneClass =
    tone === "course"
      ? "bg-sky-100 text-sky-900 ring-sky-300"
      : "bg-violet-100 text-violet-900 ring-violet-300";
  return (
    <label
      htmlFor={htmlFor}
      className={`inline-flex w-fit rounded-md px-2 py-0.5 text-sm font-semibold ring-1 ring-inset ${toneClass}`}
    >
      {children}
    </label>
  );
}

function CourseUrlExample() {
  return (
    <div className="rounded-control border border-surface-200 bg-surface-50 px-3 py-3 text-right">
      <p className="mb-1 text-sm font-semibold text-surface-900">
        איך למצוא את מזהה הקורס ואת מזהה נושא הפורום?
      </p>
      <p className="mb-2 text-xs text-surface-600">
        פתחו את פורום התמיכה ב־Campus IL והעתיקו את הערכים מהקישור לפי הסימונים
        בדוגמה הבאה:
      </p>
      <div className="mb-2 flex flex-wrap justify-end gap-1.5">
        <LegendChip tone="course" label="מזהה הקורס" />
        <LegendChip tone="topic" label="מזהה נושא (אופציונלי)" />
      </div>
      <div
        dir="ltr"
        className="overflow-x-auto rounded-md border border-surface-200 bg-white px-2.5 py-2 text-left font-mono text-[11px] leading-relaxed text-surface-700 sm:text-xs"
      >
        <p className="break-all">
          <span className="text-surface-500">
            https://courses.campus.gov.il/api/discussion/v1/threads/?course_id=
          </span>
          <UrlMark tone="course">{EXAMPLE_COURSE_ID}</UrlMark>
          <span className="text-surface-500">&amp;topic_id=</span>
          <UrlMark tone="topic">{EXAMPLE_TOPIC_ID}</UrlMark>
        </p>
      </div>
    </div>
  );
}

interface AddCourseFormProps {
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (course: {
    id: string;
    name: string;
    nameHe?: string;
    forumCategory: string;
    forumTopicId?: string;
  }) => void | Promise<void>;
}

export function AddCourseForm({
  busy,
  error,
  onCancel,
  onSave,
}: AddCourseFormProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [nameHe, setNameHe] = useState("");
  const [forumTopicId, setForumTopicId] = useState("");

  const canSave =
    id.trim().length > 0 && name.trim().length > 0 && !busy;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    void onSave({
      id: id.trim(),
      name: name.trim(),
      nameHe: nameHe.trim() || undefined,
      forumCategory: DEFAULT_FORUM_CATEGORY,
      forumTopicId: forumTopicId.trim() || undefined,
    });
  };

  return (
    <form
      dir="rtl"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 p-4 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-surface-900">הוספת קורס</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            ביטול
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                שומר…
              </span>
            ) : (
              "שמור קורס"
            )}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-control border border-danger bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <CourseUrlExample />

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="add-course-id" tone="course">
          מזהה הקורס
        </FieldLabel>
        <Input
          id="add-course-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder={EXAMPLE_COURSE_ID}
          disabled={busy}
          dir="ltr"
          className="text-left"
        />
      </div>
      <Input
        label="שם באנגלית"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        dir="ltr"
        className="text-left"
      />
      <Input
        label="שם בעברית"
        value={nameHe}
        onChange={(e) => setNameHe(e.target.value)}
        disabled={busy}
        hint="אופציונלי — מוצג בסרגל הצד כשיש"
      />
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="add-course-topic-id" tone="topic">
          מזהה נושא בפורום
        </FieldLabel>
        <Input
          id="add-course-topic-id"
          value={forumTopicId}
          onChange={(e) => setForumTopicId(e.target.value)}
          placeholder={EXAMPLE_TOPIC_ID}
          disabled={busy}
          dir="ltr"
          className="text-left"
          hint="אופציונלי"
        />
      </div>
    </form>
  );
}

/** Build a CourseEntry from a successful create response / form values. */
export function toCourseEntry(input: {
  id: string;
  name: string;
  nameHe?: string;
  forumCategory: string;
  forumTopicId?: string;
}): CourseEntry {
  return {
    id: input.id.trim(),
    name: input.name.trim(),
    nameHe: input.nameHe?.trim() || undefined,
    forumCategory: input.forumCategory.trim(),
    forumTopicId: input.forumTopicId?.trim() || undefined,
  };
}
