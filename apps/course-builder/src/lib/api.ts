import { supabase } from "./supabase";
import type {
  BlockProps,
  CommentAuthorRole,
  ComponentComment,
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

/**
 * Clone a lesson immediately after the source.
 * Title becomes `העתק של {source.title}`. Each page is copied with the same
 * title/order; component types/order are copied with empty props except banners
 * (full props kept). Page notes are not copied.
 */
export async function duplicateSection(
  sourceId: string
): Promise<{ section: Section; pages: Page[] }> {
  const { data: source, error: sourceErr } = await supabase
    .from("sections")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (sourceErr) fail("Loading section to duplicate", sourceErr);

  const courseId = source.course_id as string;

  const { data: siblings, error: sibErr } = await supabase
    .from("sections")
    .select("id, position")
    .eq("course_id", courseId)
    .order("position");
  if (sibErr) fail("Loading course sections", sibErr);

  const siblingIds = (siblings ?? []).map((s) => s.id);
  const sourceIndex = siblingIds.indexOf(sourceId);
  if (sourceIndex < 0) {
    fail("Duplicating section", { message: "source section not in course" });
  }

  const { data: createdSection, error: createErr } = await supabase
    .from("sections")
    .insert({
      course_id: courseId,
      title: `העתק של ${source.title}`,
      position: siblingIds.length,
    })
    .select()
    .single();
  if (createErr) fail("Duplicating section", createErr);

  const orderedSectionIds = [
    ...siblingIds.slice(0, sourceIndex + 1),
    createdSection.id,
    ...siblingIds.slice(sourceIndex + 1),
  ];
  await renumber("sections", orderedSectionIds);

  const { data: sourcePages, error: pagesErr } = await supabase
    .from("pages")
    .select("*")
    .eq("section_id", sourceId)
    .order("position");
  if (pagesErr) {
    await supabase.from("sections").delete().eq("id", createdSection.id);
    fail("Loading section pages", pagesErr);
  }

  const createdPages: Page[] = [];
  try {
    for (const [index, sourcePage] of (sourcePages ?? []).entries()) {
      const page = await insertClonedPage({
        sourcePageId: sourcePage.id,
        sectionId: createdSection.id,
        title: sourcePage.title,
        position: index,
      });
      createdPages.push(page);
    }
  } catch (e) {
    await supabase.from("sections").delete().eq("id", createdSection.id);
    throw e;
  }

  await touchCourse(courseId);

  const { data: finalSection, error: finalErr } = await supabase
    .from("sections")
    .select("*")
    .eq("id", createdSection.id)
    .single();
  if (finalErr) fail("Loading duplicated section", finalErr);

  return { section: finalSection, pages: createdPages };
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

  // Every new lesson starts with one empty banner at position 0.
  // Insert directly so the course timestamp is touched only once for the
  // page-and-default-component operation.
  const { error: bannerError } = await supabase.from("components").insert({
    page_id: data.id,
    type: "banner",
    position: 0,
    props: { title: "" },
  });
  if (bannerError) {
    // Avoid leaving a partially-created empty page when the default fails.
    await supabase.from("pages").delete().eq("id", data.id);
    fail("Adding default banner", bannerError);
  }

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

/**
 * Clone a lesson page immediately after the source in its section.
 * Title becomes `העתק של {source.title}`. Component types/order are copied;
 * props are cleared except banners (full props kept). Page notes are not copied.
 * Home page ("עמוד ראשי") cannot be duplicated.
 */
export async function duplicatePage(sourceId: string): Promise<Page> {
  const { data: source, error: sourceErr } = await supabase
    .from("pages")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (sourceErr) fail("Loading page to duplicate", sourceErr);
  if (!source.section_id) {
    fail("Duplicating page", { message: "cannot duplicate the course home page" });
  }

  const sectionId = source.section_id as string;
  const courseId = await courseIdFromSection(sectionId);

  const { data: siblings, error: sibErr } = await supabase
    .from("pages")
    .select("id, position")
    .eq("section_id", sectionId)
    .order("position");
  if (sibErr) fail("Loading section pages", sibErr);

  const siblingIds = (siblings ?? []).map((p) => p.id);
  const sourceIndex = siblingIds.indexOf(sourceId);
  if (sourceIndex < 0) fail("Duplicating page", { message: "source page not in section" });

  const created = await insertClonedPage({
    sourcePageId: sourceId,
    sectionId,
    title: `העתק של ${source.title}`,
    position: siblingIds.length,
  });

  const orderedIds = [
    ...siblingIds.slice(0, sourceIndex + 1),
    created.id,
    ...siblingIds.slice(sourceIndex + 1),
  ];
  await renumber("pages", orderedIds);
  await touchCourse(courseId);

  const { data: finalPage, error: finalErr } = await supabase
    .from("pages")
    .select("*")
    .eq("id", created.id)
    .single();
  if (finalErr) fail("Loading duplicated page", finalErr);
  return finalPage;
}

/** Insert a page + cloned components. Does not touch course.updated_at. */
async function insertClonedPage({
  sourcePageId,
  sectionId,
  title,
  position,
}: {
  sourcePageId: string;
  sectionId: string;
  title: string;
  position: number;
}): Promise<Page> {
  const sourceComponents = await listComponents(sourcePageId);

  const { data: created, error: createErr } = await supabase
    .from("pages")
    .insert({
      section_id: sectionId,
      course_id: null,
      title,
      position,
      notes: null,
    })
    .select()
    .single();
  if (createErr) fail("Duplicating page", createErr);

  if (sourceComponents.length > 0) {
    const rows = sourceComponents.map((c, index) => ({
      page_id: created.id,
      type: c.type,
      position: index,
      props: propsForDuplicatedComponent(c),
    }));
    const { error: compsErr } = await supabase.from("components").insert(rows);
    if (compsErr) {
      await supabase.from("pages").delete().eq("id", created.id);
      fail("Duplicating page components", compsErr);
    }
  }

  return created;
}

/** Empty shell props for a duplicated block; banners keep their data. */
function propsForDuplicatedComponent(c: PageComponent): BlockProps {
  switch (c.type) {
    case "banner":
      return { ...c.props };
    case "video":
      return { url: "" };
    case "text":
      return { html: "" };
    case "question":
      return {
        questionType: "single_choice",
        prompt: "",
        options: [
          { id: crypto.randomUUID(), text: "" },
          { id: crypto.randomUUID(), text: "" },
        ],
      };
  }
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

/**
 * Clone a component immediately after the source on the same page.
 * Copies type + props (question option ids are regenerated). Comments are not copied.
 */
export async function duplicateComponent(sourceId: string): Promise<PageComponent> {
  const { data: source, error: sourceErr } = await supabase
    .from("components")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (sourceErr) fail("Loading component to duplicate", sourceErr);

  const pageId = source.page_id as string;
  const courseId = await courseIdFromPage(pageId);

  const { data: siblings, error: sibErr } = await supabase
    .from("components")
    .select("id, position")
    .eq("page_id", pageId)
    .order("position");
  if (sibErr) fail("Loading page components", sibErr);

  const siblingIds = (siblings ?? []).map((c) => c.id);
  const sourceIndex = siblingIds.indexOf(sourceId);
  if (sourceIndex < 0) {
    fail("Duplicating component", { message: "source component not on page" });
  }

  const { data: created, error: createErr } = await supabase
    .from("components")
    .insert({
      page_id: pageId,
      type: source.type,
      position: siblingIds.length,
      props: propsForDuplicatedBlock(source as PageComponent),
    })
    .select()
    .single();
  if (createErr) fail("Duplicating component", createErr);

  const orderedIds = [
    ...siblingIds.slice(0, sourceIndex + 1),
    created.id,
    ...siblingIds.slice(sourceIndex + 1),
  ];
  await renumber("components", orderedIds);
  await touchCourse(courseId);

  const { data: finalComponent, error: finalErr } = await supabase
    .from("components")
    .select("*")
    .eq("id", created.id)
    .single();
  if (finalErr) fail("Loading duplicated component", finalErr);
  return finalComponent as PageComponent;
}

/** Full props copy for block duplicate; regenerate question option ids. */
function propsForDuplicatedBlock(c: PageComponent): BlockProps {
  if (c.type !== "question") return { ...c.props };

  const options = c.props.options ?? [];
  const idMap = new Map<string, string>();
  const nextOptions = options.map((opt) => {
    const nextId = crypto.randomUUID();
    idMap.set(opt.id, nextId);
    return { ...opt, id: nextId };
  });
  const correctOptionId = c.props.correctOptionId
    ? idMap.get(c.props.correctOptionId)
    : undefined;

  return {
    ...c.props,
    options: nextOptions,
    correctOptionId,
  };
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

// ─── Component comments ─────────────────────────────────────────────────────

/**
 * All comments for components on a page (one query via inner join on components).
 * Ordered oldest-first for Word-style thread display.
 * Does not touch components.updated_at or course.updated_at.
 */
export async function listCommentsForPage(
  pageId: string
): Promise<ComponentComment[]> {
  const { data, error } = await supabase
    .from("component_comments")
    .select("id, component_id, author_role, body, resolved_at, created_at, components!inner(page_id)")
    .eq("components.page_id", pageId)
    .order("created_at", { ascending: true });
  if (error) fail("Loading comments", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    component_id: row.component_id,
    author_role: row.author_role,
    body: row.body,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
  })) as ComponentComment[];
}

export async function addComment(
  componentId: string,
  authorRole: CommentAuthorRole,
  body: string
): Promise<ComponentComment> {
  const trimmed = body.trim();
  if (!trimmed) fail("Adding comment", { message: "body is empty" });

  const { data, error } = await supabase
    .from("component_comments")
    .insert({
      component_id: componentId,
      author_role: authorRole,
      body: trimmed,
    })
    .select()
    .single();
  if (error) fail("Adding comment", error);
  return data as ComponentComment;
}

/** Resolve (resolved=true) or reopen (resolved=false). */
export async function setCommentResolved(
  commentId: string,
  resolved: boolean
): Promise<ComponentComment> {
  const { data, error } = await supabase
    .from("component_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", commentId)
    .select()
    .single();
  if (error) fail("Updating comment resolve", error);
  return data as ComponentComment;
}

/** Hard-delete a comment. Does not bump components.updated_at or course.updated_at. */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from("component_comments")
    .delete()
    .eq("id", commentId);
  if (error) fail("Deleting comment", error);
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
