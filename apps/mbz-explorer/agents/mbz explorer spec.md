# MBZ Explorer — Project Spec & Build Instructions

**Audience:** This document is the single source of truth for Cursor agents implementing MBZ Explorer. Follow milestones sequentially.

---

## 1. Purpose

MBZ Explorer inspects Moodle course backup files (`.mbz`). A user drops in a `.mbz`; the app extracts it in the browser, parses XML into a normalized manifest, and shows a browsable tree (course → sections → activities) with a content viewer for decoded HTML / H5P and raw XML.

**Primary use case (v1):** Understand structure — sections, activities, what each contains — and compare structure across multiple `.mbz` files.

**Out of scope for v1:** Editing content, repacking `.mbz`, forum/assign/board decoders, AI chat UI, automatic TTL retention.

---

## 2. Background: what an .mbz file actually is

- An `.mbz` is usually a **gzip-compressed tar** (`tar.gz`). Older backups may be true zip. Detect by magic bytes; handle both.
- Extracted root contains:
  - `moodle_backup.xml` — course info, sections, activities, backup settings
  - `files.xml` + `files/` — content-addressed store (`files/<first2hex>/<sha1>`)
  - `course/` — course-level XML + blocks
  - `sections/section_<id>/` — `section.xml` + `inforef.xml` (uniform)
  - `activities/<modtype>_<cmid>/` — scaffold XML + payload `<modtype>.xml` (schema per module)
  - Root globals: `roles.xml`, `groups.xml`, `gradebook.xml`, `questions.xml`, etc.

### 2.1 Activity folders

Common scaffold: `module.xml`, `inforef.xml`, `roles.xml`, `grades.xml`, `grade_history.xml`, `calendar.xml`, `filters.xml`, `competencies.xml`. `grading.xml` is conditional. Payload is always `<modtype>.xml` with a type-specific schema.

### 2.2 `section.xml`

`<sequence>` is the authoritative activity order (cmids). Use it — not folder listing order.

### 2.3 Subsection pattern (Moodle 4.x+)

A `subsection` activity is a pointer. A separate section with `component === "mod_subsection"` and `itemid` matching the subsection module’s own id holds the real content. Resolve this linkage; clicking a subsection jumps to the delegated section.

### 2.4 Content encoding

HTML fields are XML-entity-escaped once. Then resolve:

- `@@PLUGINFILE@@/<urlencoded filename>` → file via `files.xml` → `blob:` URL
- `$@RESOURCEVIEWBYID*<id>@$` → flag as unresolved; do not invent destinations

**H5P triple-encoding:** (1) Extract `<json_content>` from raw XML (do not let the XML parser unescape it first — that breaks JSON when HTML `&quot;` becomes `"`), then XML-unescape once, (2) `JSON.parse`, (3) HTML-unescape string fields inside the object. `H5P.MultiChoice` / `QuestionSet` / `Column` get custom renderers; other types → pretty JSON + “no custom renderer yet”. Also decode Moodle `<intro>` HTML above the H5P.

---

## 3. Tech stack (Vite monorepo — locked)

Lives in `apps/mbz-explorer` (port **5177**), hub id `mbz-explorer`.

| Concern | Choice |
|---|---|
| App | Vite + React + TypeScript |
| Routing | `react-router-dom`: `/` dashboard, `/f/:sha1` explorer |
| UI | `@workspace/ui` `PageLayout` (`maxWidth="full"`, `padded={false}`), design tokens from workspace docs |
| Extract | Magic bytes → `fflate` (gzip + tar) / `jszip` (zip) → in-memory **VFS** `Map<path, Uint8Array>` |
| XML | `fast-xml-parser` |
| Raw XML | `shiki` |
| Persist | IndexedDB keyed by source **sha1** (manifest + referenced file blobs); manual delete |
| Pluginfiles | `blob:` URLs; materialize blobs only when a section is decoded |
| Server | No upload/files APIs; keep unused `api/chat.ts` |

**Do not** use Next.js, `better-sqlite3`, or a durable `.mbz-data/` disk store.

Parser: `src/lib/mbz-parser/` — zero React / `@workspace/ui` imports.

---

## 4. The manifest — core data contract

```ts
interface MbzManifest {
  sourceFile: { name: string; sha1: string; sizeBytes: number };
  course: {
    fullname: string;
    shortname: string;
    format: string;
    moodleVersion: string;
    backupSettings: { includesUsers: boolean; anonymized: boolean };
  };
  sections: MbzSection[];
  activities: MbzActivity[];
  files: MbzFileRef[]; // index from files.xml (metadata only until blobs materialize)
  warnings: string[];
}

interface MbzSection {
  id: string;
  number: number;
  name: string;
  summaryHtml: string | null; // null until section decoded
  summaryStatus: "pending" | "decoded";
  activityRefs: string[]; // ordered cmids from <sequence>
  delegatedBy: string | null; // subsection cmid pointing here, if any
}

interface MbzActivity {
  cmid: string;
  type: string;
  name: string;
  hasGrading: boolean;
  contentStatus: "pending" | "decoded";
  content:
    | null
    | { kind: "html"; html: string; referencedFiles: MbzFileRef[]; unresolvedTokens: string[] }
    | { kind: "h5p"; machineName: string; version: string; parsed: unknown; renderer: "multichoice" | "generic" }
    | { kind: "raw"; note: string };
  rawXmlPath: string;
}

interface MbzFileRef {
  hash: string;
  originalFilename: string;
  mimetype: string;
  bucketPath: string; // files/xx/hash
}
```

---

## 5. Parser module (`src/lib/mbz-parser/`)

### 5.1 `extract(buffer: ArrayBuffer): Promise<{ vfs: MbzVfs; sha1: string }>`

Detect gzip vs zip by magic bytes. Extract into VFS (`Map<string, Uint8Array>`), normalize paths (forward slashes, strip leading `./`). Return SHA-1 of the original buffer (cache key). Prefer iterative tar entry reads; store binary as `Uint8Array`.

### 5.2 `parseStructure(vfs, sourceMeta): MbzManifest`

Structure-only — **does not** run content decoders.

- Parse `moodle_backup.xml` for course + settings + activity names/types when available
- Parse every `sections/*/section.xml`
- Index `activities/*` folders → `{ cmid, modtype, rawXmlPath, hasGrading }`
- Resolve subsection delegation (`mod_subsection` / `itemid`)
- Parse `files.xml` into `files: MbzFileRef[]` (metadata only)
- Every activity: `contentStatus: "pending"`, `content: null`
- Every section: `summaryStatus: "pending"`, `summaryHtml: null`

### 5.3 Decoder registry (`decoders/`)

```ts
type ActivityDecoder = (
  vfs: MbzVfs,
  activity: MbzActivity,
  fileIndex: Map<string, MbzFileRef>,
  resolveBlobUrl: (ref: MbzFileRef) => string
) => MbzActivity["content"];
```

- `decodeHtmlLike` — `page`, `resource`, `label`, `book`, `url`. Moodle wraps payloads as `<activity><page>…</page></activity>`; read fields from the nested module node (prefer `<content>`, then `<intro>`). Fall back to raw XML tag extraction if the object tree has no string field.
- `decodeH5P` — Multichoice + TrueFalse + QuestionSet + Column + generic. Also decodes Moodle `<intro>` HTML (shown above the H5P questions).
- `decodeGeneric` — `{ kind: "raw", note }` + warning

### 5.4 `resolvePluginfiles(html, fileIndex, resolveBlobUrl)`

Rewrite `@@PLUGINFILE@@/...` to blob URLs; collect refs; leave `$@...@$` for badges.

### 5.5 `decodeSection(manifest, vfs, sectionId, blobStore) → MbzManifest`

**Single decode entry point.** Decodes one section’s summary + every activity in its `activityRefs` (skip already `decoded`). Materializes only referenced file blobs into `blobStore`. Returns updated manifest.

**“Analyze full course”** = loop `decodeSection` over all sections — no second path.

**Default after upload:** call `decodeSection` for the **first 2** sections by `number` order.

---

## 6. App structure

```
apps/mbz-explorer/
  api/chat.ts                 — unused pass-through (keep)
  src/
    App.tsx                   — BrowserRouter + routes
    pages/DashboardPage.tsx
    pages/ExplorerPage.tsx
    components/
      icons.tsx                 — chevron (Course Builder–matched chrome)
      explorer/
        Tree.tsx                — sidebar (look/feel matched to Course Builder)
        ContentViewer.tsx
        H5pQuestionCard.tsx
        StructureOverview.tsx
        UploadDropzone.tsx
    lib/
      mbz-parser/             — §5
      idb.ts                  — IndexedDB cache
      blobUrls.ts             — blob URL cache + revoke
      session.ts              — load/upload/decode orchestration
```

### 6.1 Sidebar / Tree

Matches Course Builder chrome (LTR English): fixed `w-80` pane `bg-[#F8F9FA]`, independent scroll from the main canvas, no divider border toward content.

- **Header:** `.mbz` filename as title (`text-xl`), Moodle course fullname as muted subtitle, “Back to dashboard”, collapsible Structure Overview, **Analyze full course**
- Dashboard list titles use the `.mbz` filename; Moodle fullname stays in the meta line
- **Nav:** sections (`number` order) with chevron collapse; activities as inset pills `type | name` (e.g. `page | Intro`, `h5p | Quiz`). Type display: `hvp` → `h5p`; `label` → no type prefix (name only)
- Selected activity: `rounded-lg bg-[#0F6CBF]` white text (same pill as Course Builder)
- Pending sections/activities muted; expand pending → `decodeSection` (spinner)
- First 2 sections open by default; rest collapsed
- Subsection node → expand + jump to delegated section
- Fixed split: `h-[calc(100vh-3rem)]`; sidebar `nav` and main pane scroll independently

### 6.2 Content viewer

- Tabs: Rendered / Raw XML / Metadata
- Pending activity: prompt to decode section (Raw XML still available from VFS)
- HTML: `dir="auto"`, unresolved tokens as badges
- Tool chrome: English LTR fixed

### 6.3 Persistence

IndexedDB by sha1: manifest (+ decoded patches), referenced blobs, optional full VFS for reopen without re-upload. Delete removes IDB row + revokes blob URLs.

---

## 7. Milestones

**Milestone 1 — Extraction + raw structure**  
Full tree, all `pending`, Raw XML tab. Accept: sequence order, subsection links, every activity visible without content decode.

**Milestone 2 — HTML + lazy pipeline**  
`decodeSection`, `decodeHtmlLike`, blob URLs, first-2 auto, expand, full-course loop. Accept both: (1) first 2 sections decode on upload; (2) later sections via same `decodeSection`.

**Milestone 3 — H5P**  
MultiChoice + generic via `decodeSection` only. Accept both eager first-2 and on-demand/full-course for `hvp`.

**Milestone 4 — Persistence + comparison**  
IDB cache, dashboard list + structure overview, delete, restore pending/decoded on reopen.

---

## 8. Decisions

- **Retention:** Manual delete only; no TTL in v1.
- **Language/direction:** Tool UI English/LTR; content `dir="auto"`.
- **Stack:** Vite + IndexedDB + blob URLs (not Next.js / sqlite).
- **XML arrays:** Do not force the root `<section>` of `section.xml` into an array in `fast-xml-parser` — only list nodes under `contents.sections` / `activities` / `files`. Otherwise every section becomes `0. Section 0` with an empty sequence.
