import { supabase } from "./supabase";
import type {
  BlockProps,
  ComponentType,
  Course,
  CourseListItem,
  CourseTree,
  ImplementationStatus,
  Page,
  PageComponent,
  Section,
  StatusRollup,
} from "./types";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

// ─── Courses ────────────────────────────────────────────────────────────────

export async function listCourses(): Promise<CourseListItem[]> {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) fail("Loading courses", error);

  const { data: sections, error: sErr } = await supabase
    .from("sections")
    .select("id, course_id");
  if (sErr) fail("Loading sections", sErr);

  const { data: pages, error: pErr } = await supabase
    .from("pages")
    .select("id, section_id, course_id");
  if (pErr) fail("Loading pages", pErr);

  const sectionToCourse = new Map<string, string>();
  const sectionCounts = new Map<string, number>();
  for (const s of sections ?? []) {
    sectionToCourse.set(s.id, s.course_id);
    sectionCounts.set(s.course_id, (sectionCounts.get(s.course_id) ?? 0) + 1);
  }
  const pageCounts = new Map<string, number>();
  for (const p of pages ?? []) {
    const courseId =
      p.course_id ?? (p.section_id ? sectionToCourse.get(p.section_id) : undefined);
    if (courseId) pageCounts.set(courseId, (pageCounts.get(courseId) ?? 0) + 1);
  }

  return (courses ?? []).map((c) => ({
    ...c,
    sectionCount: sectionCounts.get(c.id) ?? 0,
    pageCount: pageCounts.get(c.id) ?? 0,
  }));
}

export async function createCourse(title: string): Promise<Course> {
  const { data, error } = await supabase
    .from("courses")
    .insert({ title })
    .select()
    .single();
  if (error) fail("Creating course", error);
  await ensureHomePage(data.id);
  return data;
}

export async function updateCourse(
  id: string,
  fields: Partial<Pick<Course, "title" | "description">>
): Promise<void> {
  const { error } = await supabase.from("courses").update(fields).eq("id", id);
  if (error) fail("Updating course", error);
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) fail("Deleting course", error);
}

// ─── Course tree (sections + pages) ─────────────────────────────────────────

export async function getCourseTree(courseId: string): Promise<CourseTree> {
  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (error) fail("Loading course", error);

  const { data: sections, error: sErr } = await supabase
    .from("sections")
    .select("*")
    .eq("course_id", courseId)
    .order("position");
  if (sErr) fail("Loading sections", sErr);

  const sectionIds = (sections ?? []).map((s) => s.id);
  let sectionPages: Page[] = [];
  if (sectionIds.length > 0) {
    const { data, error: pErr } = await supabase
      .from("pages")
      .select("*")
      .in("section_id", sectionIds)
      .order("position");
    if (pErr) fail("Loading pages", pErr);
    sectionPages = data ?? [];
  }

  const homePage = await ensureHomePage(courseId);
  const pages = [homePage, ...sectionPages];

  return { course, sections: sections ?? [], pages };
}

// ─── Sections ───────────────────────────────────────────────────────────────

export async function addSection(
  courseId: string,
  title: string,
  position: number
): Promise<Section> {
  const { data, error } = await supabase
    .from("sections")
    .insert({ course_id: courseId, title, position })
    .select()
    .single();
  if (error) fail("Adding section", error);
  return data;
}

export async function updateSection(
  id: string,
  fields: Partial<Pick<Section, "title">>
): Promise<void> {
  const { error } = await supabase.from("sections").update(fields).eq("id", id);
  if (error) fail("Updating section", error);
}

export async function deleteSection(id: string): Promise<void> {
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) fail("Deleting section", error);
}

export async function reorderSections(orderedIds: string[]): Promise<void> {
  await renumber("sections", orderedIds);
}

// ─── Pages ──────────────────────────────────────────────────────────────────

/** Ensures every course has a single home page ("עמוד ראשי") above the lessons. */
export async function ensureHomePage(courseId: string): Promise<Page> {
  const { data: existing, error: findErr } = await supabase
    .from("pages")
    .select("*")
    .eq("course_id", courseId)
    .is("section_id", null)
    .maybeSingle();
  if (findErr) fail("Loading home page", findErr);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("pages")
    .insert({
      course_id: courseId,
      section_id: null,
      title: "עמוד ראשי",
      position: 0,
    })
    .select()
    .single();

  // Parallel loads (e.g. React Strict Mode) can race the unique home-page index.
  if (error) {
    const { data: raced, error: refetchErr } = await supabase
      .from("pages")
      .select("*")
      .eq("course_id", courseId)
      .is("section_id", null)
      .maybeSingle();
    if (refetchErr) fail("Creating home page", error);
    if (raced) return raced;
    fail("Creating home page", error);
  }
  return data;
}

export async function addPage(
  sectionId: string,
  title: string,
  position: number
): Promise<Page> {
  const { data, error } = await supabase
    .from("pages")
    .insert({ section_id: sectionId, course_id: null, title, position })
    .select()
    .single();
  if (error) fail("Adding page", error);
  return data;
}

export async function updatePage(
  id: string,
  fields: Partial<Pick<Page, "title" | "notes">>
): Promise<void> {
  const { error } = await supabase.from("pages").update(fields).eq("id", id);
  if (error) fail("Updating page", error);
}

export async function deletePage(id: string): Promise<void> {
  const { error } = await supabase.from("pages").delete().eq("id", id);
  if (error) fail("Deleting page", error);
}

export async function reorderPages(orderedIds: string[]): Promise<void> {
  await renumber("pages", orderedIds);
}

// ─── Components ─────────────────────────────────────────────────────────────

export async function listComponents(pageId: string): Promise<PageComponent[]> {
  const { data, error } = await supabase
    .from("components")
    .select("*")
    .eq("page_id", pageId)
    .order("position");
  if (error) fail("Loading components", error);
  return data ?? [];
}

export async function addComponent(
  pageId: string,
  type: ComponentType,
  position: number,
  props: BlockProps = {}
): Promise<PageComponent> {
  const { data, error } = await supabase
    .from("components")
    .insert({ page_id: pageId, type, position, props })
    .select()
    .single();
  if (error) fail("Adding component", error);
  return data;
}

export async function updateComponentProps(
  id: string,
  props: BlockProps
): Promise<PageComponent> {
  const { data, error } = await supabase
    .from("components")
    .update({ props })
    .eq("id", id)
    .select()
    .single();
  if (error) fail("Updating component", error);
  return data;
}

export async function deleteComponent(id: string): Promise<void> {
  const { error } = await supabase.from("components").delete().eq("id", id);
  if (error) fail("Deleting component", error);
}

export async function reorderComponents(orderedIds: string[]): Promise<void> {
  await renumber("components", orderedIds);
}

/** Sets implementation status by writing `implemented_at` relative to the `updated_at` trigger. */
export async function setComponentStatus(
  id: string,
  status: ImplementationStatus
): Promise<PageComponent> {
  if (status === "implemented") {
    return markImplemented(id);
  }

  const implemented_at =
    status === "not_implemented"
      ? null
      : // Must be strictly before the trigger's new updated_at.
        new Date(Date.now() - 60_000).toISOString();

  const { data, error } = await supabase
    .from("components")
    .update({ implemented_at })
    .eq("id", id)
    .select()
    .single();
  if (error) fail("Updating component status", error);
  return data;
}

/**
 * Marks implemented via DB `now()` so `implemented_at` matches the `updated_at`
 * trigger in the same statement (avoids client-clock skew → needs_update).
 * Falls back to a slightly-ahead client timestamp if the RPC is not deployed yet.
 */
export async function markImplemented(id: string): Promise<PageComponent> {
  const { data, error } = await supabase.rpc("mark_component_implemented", {
    component_id: id,
  });
  if (!error && data) return data as PageComponent;

  // Fallback: client clock can lag the DB trigger; pad ahead so status is הוטמע.
  const { data: row, error: fallbackError } = await supabase
    .from("components")
    .update({ implemented_at: new Date(Date.now() + 30_000).toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (fallbackError) {
    fail("Marking component implemented", error ?? fallbackError);
  }
  return row;
}

// ─── Status rollups (from DB views) ─────────────────────────────────────────

/**
 * Prefer summing status buckets over `total_count` from the view.
 * A LEFT JOIN + `count(*)` (instead of `count(cs.id)`) yields a phantom
 * total of 1 for pages with no components — which shows up as "0/1".
 */
function normalizeRollup(row: {
  implemented_count?: number | string | null;
  needs_update_count?: number | string | null;
  not_implemented_count?: number | string | null;
  total_count?: number | string | null;
}): StatusRollup {
  const implemented_count = Number(row.implemented_count ?? 0);
  const needs_update_count = Number(row.needs_update_count ?? 0);
  const not_implemented_count = Number(row.not_implemented_count ?? 0);
  return {
    implemented_count,
    needs_update_count,
    not_implemented_count,
    total_count: implemented_count + needs_update_count + not_implemented_count,
  };
}

export async function getStatusRollups(
  sectionIds: string[],
  pageIds: string[]
): Promise<{
  perPage: Map<string, StatusRollup>;
  perSection: Map<string, StatusRollup>;
}> {
  const perPage = new Map<string, StatusRollup>();
  const perSection = new Map<string, StatusRollup>();

  if (pageIds.length > 0) {
    const { data, error } = await supabase
      .from("page_status")
      .select("*")
      .in("page_id", pageIds);
    if (error) fail("Loading page status", error);
    for (const row of data ?? []) {
      perPage.set(row.page_id, normalizeRollup(row));
    }
  }

  if (sectionIds.length > 0) {
    const { data, error } = await supabase
      .from("section_status")
      .select("*")
      .in("section_id", sectionIds);
    if (error) fail("Loading section status", error);
    for (const row of data ?? []) {
      perSection.set(row.section_id, normalizeRollup(row));
    }
  }

  return { perPage, perSection };
}

// ─── Shared ─────────────────────────────────────────────────────────────────

/** Renumbers siblings to match the given order (position = array index). */
async function renumber(
  table: "sections" | "pages" | "components",
  orderedIds: string[]
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(table).update({ position: index }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) fail(`Reordering ${table}`, failed.error);
}
