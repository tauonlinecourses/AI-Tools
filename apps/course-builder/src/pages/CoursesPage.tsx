import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout, Card, Button, Input, Spinner } from "@workspace/ui";
import { listCourses, createCourse, deleteCourse } from "../lib/api";
import type { CourseListItem } from "../lib/types";
import { PlusIcon, TrashIcon } from "../components/icons";
import { SaveStatusIndicator, useSaveStatus } from "../lib/saveStatus";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CoursesPage() {
  const navigate = useNavigate();
  const { trackSave } = useSaveStatus();
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCourses()
      .then(setCourses)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const course = await trackSave(createCourse(newTitle.trim()));
      navigate(`/courses/${course.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`למחוק את הקורס "${title}"? פעולה זו תמחק את כל התוכן שלו.`)) return;
    setError(null);
    try {
      await trackSave(deleteCourse(id));
      setCourses((prev) => prev?.filter((c) => c.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <PageLayout
      toolName="Course Builder"
      toolDescription="Author course structure and content for implementers"
    >
      <div className="fixed top-14 left-4 z-20 pointer-events-none">
        <SaveStatusIndicator />
      </div>
      <div dir="rtl" lang="he" className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-surface-900">הקורסים שלי</h1>
          {!creating && (
            <Button size="md" leftIcon={<PlusIcon />} onClick={() => setCreating(true)}>
              קורס חדש
            </Button>
          )}
        </div>

        {creating && (
          <Card>
            <div className="flex flex-col gap-3">
              <Input
                label="שם הקורס"
                placeholder="לדוגמה: מבוא לסטטיסטיקה"
                value={newTitle}
                autoFocus
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <div className="flex gap-2">
                <Button onClick={handleCreate} loading={saving} disabled={!newTitle.trim()}>
                  צור קורס
                </Button>
                <Button variant="ghost" onClick={() => { setCreating(false); setNewTitle(""); }}>
                  ביטול
                </Button>
              </div>
            </div>
          </Card>
        )}

        {error && (
          <Card className="border-danger bg-red-50">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        )}

        {courses === null && !error && (
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <Spinner size="sm" />
            טוען קורסים...
          </div>
        )}

        {courses !== null && courses.length === 0 && !creating && (
          <Card>
            <p className="text-sm text-surface-600">
              אין עדיין קורסים. לחצו על "קורס חדש" כדי להתחיל.
            </p>
          </Card>
        )}

        {courses !== null && courses.length > 0 && (
          <div className="flex flex-col gap-3">
            {courses.map((course) => (
              <Card key={course.id} hover onClick={() => navigate(`/courses/${course.id}/edit`)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-semibold text-surface-900 truncate">
                      {course.title}
                    </span>
                    <span className="text-xs text-surface-500">
                      {course.sectionCount} שיעורים · {course.pageCount} עמודים · עודכן {formatDate(course.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1.5 text-surface-400 hover:text-surface-900 transition-colors duration-fast"
                      title="תצוגה"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/courses/${course.id}/review`);
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button
                      className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast"
                      title="מחק קורס"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(course.id, course.title);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
