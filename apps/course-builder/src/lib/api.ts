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
  PageType,
  Section,
  StatusRollup,
} from "./types";
import { derivePageType } from "./types";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/**
 * Bumps `courses.updated_at` so the list / sidebar "last updated" reflects
 * nested content edits (sections, pages, components). The row trigger sets `now()`.
 * Not used for implementer-only status changes (`implemented_at`).
 */
export async function touchCourse(courseId: string): Promise<string> {
  const { data, error } = await supabase
    .from("courses")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", courseId)
    .select("updated_at")
    .single();
  if (error) fail("Updating course timestamp", error);
  return data.updated_at;
}

async function courseIdFromSection(sectionId: string): Promise<string> {
  const { data, error } = await supabase
    .from("sections")
    .select("course_id")
    .eq("id", sectionId)
    .single();
  if (error) fail("Resolving course for section", error);
  return data.course_id;
}

async function courseIdFromPage(pageId: string): Promise<string> {
  const { data, error } = await supabase
    .from("pages")
    .select("course_id, section_id")
    .eq("id", pageId)
    .single();
  if (error) fail("Resolving course for page", error);
  if (data.course_id) return data.course_id;
  if (!data.section_id) {
    fail("Resolving course for page", { message: "page has no course or section" });
  }
  return courseIdFromSection(data.section_id);
}

async function courseIdFromComponent(componentId: string): Promise<string> {
  const { data, error } = await supabase
    .from("components")
    .select("page_id")
    .eq("id", componentId)
    .single();
  if (error) fail("Resolving course for component", error);
  return courseIdFromPage(data.page_id);
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
  await touchCourse(courseId);
  return data;
}

export async function updateSection(
  id: string,
  fields: Partial<Pick<Section, "title">>
): Promise<void> {
  const courseId = await courseIdFromSection(id);
  const { error } = await supabase.from("sections").update(fields).eq("id", id);
  if (error) fail("Updating section", error);
  await touchCourse(courseId);
}

export async function deleteSection(id: string): Promise<void> {
  const courseId = await courseIdFromSection(id);
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) fail("Deleting section", error);
  await touchCourse(courseId);
}

export async function reorderSections(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const courseId = await courseIdFromSection(orderedIds[0]);
  await renumber("sections", orderedIds);
  await touchCourse(courseId);
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
  const courseId = await courseIdFromSection(sectionId);
  const { data, error } = await supabase
    .from("pages")
    .insert({ section_id: sectionId, course_id: null, title, position })
    .select()
    .single();
  if (error) fail("Adding page", error);
  await touchCourse(courseId);
  return data;
}

export async function updatePage(
  id: string,
  fields: Partial<Pick<Page, "title" | "notes">>
): Promise<void> {
  const courseId = await courseIdFromPage(id);
  const { error } = await supabase.from("pages").update(fields).eq("id", id);
  if (error) fail("Updating page", error);
  await touchCourse(courseId);
}

export async function deletePage(id: string): Promise<void> {
  const courseId = await courseIdFromPage(id);
  const { error } = await supabase.from("pages").delete().eq("id", id);
  if (error) fail("Deleting page", error);
  await touchCourse(courseId);
}

export async function reorderPages(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const courseId = await courseIdFromPage(orderedIds[0]);
  await renumber("pages", orderedIds);
  await touchCourse(courseId);
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
  const courseId = await courseIdFromPage(pageId);
  const { data, error } = await supabase
    .from("components")
    .insert({ page_id: pageId, type, position, props })
    .select()
    .single();
  if (error) fail("Adding component", error);
  await touchCourse(courseId);
  return data;
}

export async function updateComponentProps(
  id: string,
  props: BlockProps
): Promise<PageComponent> {
  const courseId = await courseIdFromComponent(id);
  const { data, error } = await supabase
    .from("components")
    .update({ props })
    .eq("id", id)
    .select()
    .single();
  if (error) fail("Updating component", error);
  await touchCourse(courseId);
  return data;
}

export async function deleteComponent(id: string): Promise<void> {
  const courseId = await courseIdFromComponent(id);
  const { error } = await supabase.from("components").delete().eq("id", id);
  if (error) fail("Deleting component", error);
  await touchCourse(courseId);
}

export async function reorderComponents(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const courseId = await courseIdFromComponent(orderedIds[0]);
  await renumber("components", orderedIds);
  await touchCourse(courseId);
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

// ─── Page types (from component mix) ────────────────────────────────────────

/** Maps each page to a PageType derived from its component types (implement sidebar logos). */
export async function getPageTypes(
  pageIds: string[]
): Promise<Map<string, PageType>> {
  const result = new Map<string, PageType>();
  for (const id of pageIds) result.set(id, "page");
  if (pageIds.length === 0) return result;

  const { data, error } = await supabase
    .from("components")
    .select("page_id, type")
    .in("page_id", pageIds);
  if (error) fail("Loading page types", error);

  const typesByPage = new Map<string, ComponentType[]>();
  for (const row of data ?? []) {
    const list = typesByPage.get(row.page_id) ?? [];
    list.push(row.type as ComponentType);
    typesByPage.set(row.page_id, list);
  }
  for (const [pageId, types] of typesByPage) {
    result.set(pageId, derivePageType(types));
  }
  return result;
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
