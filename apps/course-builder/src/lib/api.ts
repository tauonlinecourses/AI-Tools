import { supabase } from "./supabase";
import type {
  BlockProps,
  ComponentType,
  Course,
  CourseListItem,
  CourseTree,
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
    .select("id, section_id");
  if (pErr) fail("Loading pages", pErr);

  const sectionToCourse = new Map<string, string>();
  const sectionCounts = new Map<string, number>();
  for (const s of sections ?? []) {
    sectionToCourse.set(s.id, s.course_id);
    sectionCounts.set(s.course_id, (sectionCounts.get(s.course_id) ?? 0) + 1);
  }
  const pageCounts = new Map<string, number>();
  for (const p of pages ?? []) {
    const courseId = sectionToCourse.get(p.section_id);
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
  let pages: Page[] = [];
  if (sectionIds.length > 0) {
    const { data, error: pErr } = await supabase
      .from("pages")
      .select("*")
      .in("section_id", sectionIds)
      .order("position");
    if (pErr) fail("Loading pages", pErr);
    pages = data ?? [];
  }

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

export async function addPage(
  sectionId: string,
  title: string,
  position: number
): Promise<Page> {
  const { data, error } = await supabase
    .from("pages")
    .insert({ section_id: sectionId, title, position })
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

/** Marks implemented. The updated_at trigger fires in the same statement, so both timestamps get the same now() and status becomes 'implemented'. */
export async function markImplemented(id: string): Promise<PageComponent> {
  const { data, error } = await supabase
    .from("components")
    .update({ implemented_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) fail("Marking component implemented", error);
  return data;
}

// ─── Status rollups (from DB views) ─────────────────────────────────────────

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
      perPage.set(row.page_id, {
        implemented_count: Number(row.implemented_count ?? 0),
        needs_update_count: Number(row.needs_update_count ?? 0),
        not_implemented_count: Number(row.not_implemented_count ?? 0),
        total_count: Number(row.total_count ?? 0),
      });
    }
  }

  if (sectionIds.length > 0) {
    const { data, error } = await supabase
      .from("section_status")
      .select("*")
      .in("section_id", sectionIds);
    if (error) fail("Loading section status", error);
    for (const row of data ?? []) {
      perSection.set(row.section_id, {
        implemented_count: Number(row.implemented_count ?? 0),
        needs_update_count: Number(row.needs_update_count ?? 0),
        not_implemented_count: Number(row.not_implemented_count ?? 0),
        total_count: Number(row.total_count ?? 0),
      });
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
