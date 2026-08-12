# MBZ File Structure — Structured vs Custom

Reference for the Moodle `.mbz` backup format and how **MBZ Explorer** parses and displays it. There is no sample `.mbz` in the repo; this document is derived from the project spec, parser code, and Moodle’s documented backup layout.

Related: [`mbz explorer spec.md`](./mbz%20explorer%20spec.md) (app behavior and milestones).

---

## Executive summary

An `.mbz` file is **mostly a standardized Moodle container** with **highly variable inner content**:

| Layer | How structured | Who defines it |
|-------|----------------|----------------|
| Archive wrapper | Fully standardized | Moodle (gzip+tar or zip) |
| Folder layout | Fully standardized | Moodle backup2 format |
| Root XML manifests | Standardized schema | Moodle core |
| Section / activity scaffold XML | Standardized scaffold | Moodle core |
| Activity payload (`page.xml`, `forum.xml`, …) | Semi-structured | Each Moodle module plugin |
| Embedded HTML / H5P JSON | Custom / author content | Teachers + H5P authors |
| Binary files in `files/` | Standard addressing, custom bytes | Uploaded assets |

**MBZ Explorer** treats structure as **fully parseable** (sections, activities, order, file index) but content decoding as **selective**: only `page`, `resource`, `label`, `book`, `url`, and `hvp` get rich renderers; everything else shows raw XML.

---

## 1. What an `.mbz` file is

```
┌─────────────────────────────────────┐
│  .mbz (Moodle course backup)        │
│  Usually: gzip-compressed tar       │
│  Older:   zip                       │
└─────────────────┬───────────────────┘
                  │ extract
                  ▼
┌─────────────────────────────────────┐
│  Virtual filesystem (flat paths)    │
│  moodle_backup.xml                  │
│  files.xml + files/xx/<sha1>        │
│  sections/section_N/                │
│  activities/<modtype>_<cmid>/       │
│  course/, roles.xml, gradebook…     │
└─────────────────────────────────────┘
```

Detection in the app (`src/lib/mbz-parser/extract.ts`):

- Magic `1F 8B` → gzip → tar
- Magic `PK` → zip
- Otherwise → plain tar

Paths are normalized to forward slashes in an in-memory `Map<path, Uint8Array>` (VFS).

---

## 2. Top-level folder structure (highly structured)

After extraction, Moodle backups follow a **predictable tree**:

```
/
├── moodle_backup.xml          ← master manifest (course + activity index)
├── files.xml                  ← file metadata index
├── files/
│   └── <first2hex>/<contenthash>   ← content-addressed blobs
├── sections/
│   └── section_<id>/
│       ├── section.xml        ← name, summary, activity sequence
│       └── inforef.xml        ← file references for this section
├── activities/
│   └── <modtype>_<cmid>/      ← e.g. page_42, hvp_17, forum_9
│       ├── module.xml         ← course-module metadata (name, id)
│       ├── inforef.xml        ← linked files
│       ├── roles.xml, grades.xml, …  ← scaffold (often uniform)
│       ├── grading.xml        ← optional
│       └── <modtype>.xml      ← payload (schema varies by module)
├── course/                    ← course-level blocks & settings
├── roles.xml, groups.xml
├── gradebook.xml, questions.xml
└── … other root globals
```

- **Structured:** folder naming (`activities/page_42/`), presence of `section.xml`, `files.xml` layout.
- **Custom:** what’s *inside* each `<modtype>.xml` and the actual bytes in `files/`.

---

## 3. File types — structured vs custom breakdown

### 3.1 Archive & transport (100% structured)

| File / layer | Role | Explorer usage |
|--------------|------|----------------|
| `.mbz` container | Compressed archive | `extract()` → VFS |
| Path normalization | Forward slashes, no `./` | All lookups |

### 3.2 Root manifests (standardized Moodle XML)

#### `moodle_backup.xml` — fully structured

Moodle’s master backup document. The parser reads:

- Course name, shortname, format, Moodle version
- Backup settings (`users`, `anonymize`, …)
- Activity index: `moduleid`, `modulename`, `title`

Used in `parseStructure.ts` for course metadata and activity name fallback.

#### `files.xml` — fully structured

Uniform list of file records:

```xml
<file>
  <filename>...</filename>
  <contenthash>abc123...</contenthash>
  <mimetype>...</mimetype>
</file>
```

Mapped to:

```ts
{ hash, originalFilename, mimetype, bucketPath: "files/xx/hash" }
```

Binary content lives at `files/<first2hex>/<hash>` — **content-addressed**, not filename-based.

### 3.3 Sections (uniform scaffold, custom text)

#### `sections/section_<id>/section.xml` — structured schema, custom content

| Field | Structured? | Content |
|-------|-------------|---------|
| `number` | Yes | Section index |
| `name` | Yes | Label (often Hebrew/custom) |
| `sequence` | Yes | Comma-separated **cmids** — authoritative activity order |
| `summary` | Schema yes, body custom | HTML (XML-entity escaped) |
| `component` / `itemid` | Yes | Used for Moodle 4.x **subsection** delegation |

**Important:** Activity order comes from `<sequence>`, not folder listing order.

#### `inforef.xml` (sections & activities) — structured

Links file IDs → `files.xml`. MBZ Explorer resolves embedded files mainly via `@@PLUGINFILE@@` in HTML, not by walking `inforef.xml` directly.

### 3.4 Activities — scaffold vs payload

Each activity folder follows a **common scaffold** (Moodle-defined) plus a **type-specific payload**:

#### Scaffold files (highly structured, mostly ignored by Explorer v1)

| File | Purpose | Explorer |
|------|---------|----------|
| `module.xml` | CM metadata, display name | Name + subsection ID resolution |
| `inforef.xml` | File refs | Not directly walked |
| `roles.xml` | Role overrides | Ignored |
| `grades.xml`, `grade_history.xml` | Grading data | Ignored (except `grading.xml` presence → `hasGrading`) |
| `calendar.xml`, `filters.xml`, `competencies.xml` | Metadata | Ignored |

#### Payload: `<modtype>.xml` — semi-structured

Always named after the module type (`page.xml`, `hvp.xml`, `forum.xml`). Outer wrapper is often:

```xml
<activity id="..." moduleid="..." modulename="page">
  <page id="...">
    <!-- module-specific fields -->
  </page>
</activity>
```

- **Structured:** wrapper shape, common fields (`name`, `intro`, `@_id`).
- **Custom:** field names and semantics per Moodle plugin (50+ activity types possible).

---

## 4. Activity types — decoder support in MBZ Explorer

This is where **structure ends and custom handling begins**:

| Activity type (`modtype`) | Payload structure | Explorer decode | Rendered as |
|---------------------------|-------------------|-----------------|-------------|
| `page`, `resource`, `label`, `book`, `url` | Moodle XML + HTML fields | `decodeHtmlLike` | HTML (pluginfiles resolved) |
| `hvp` (H5P) | XML + embedded JSON in `<json_content>` | `decodeH5P` | Custom cards for MultiChoice, TrueFalse, QuestionSet, Column; else JSON |
| `subsection` | Pointer only | Raw note | “Open delegated section” |
| `forum`, `assign`, `quiz`, `glossary`, `board`, … | Plugin-specific XML | `decodeGeneric` | Raw XML tab only |

Decoder routing (`decodeSection.ts`):

```
activity.type === "hvp"     → decodeH5P
supportsHtmlLike(type)      → decodeHtmlLike  (page, resource, label, book, url)
type === "subsection"       → raw pointer message
else                        → decodeGeneric + warning
```

Between different activity types, the backup *folder* is uniform, but **content interpretation is highly custom** — only ~6 types get first-class decoders today.

---

## 5. Content encoding layers (structured tokens + custom payloads)

### 5.1 HTML fields (sections + many activities)

**Encoding pipeline (Moodle-standard, content-custom):**

1. Author writes HTML in Moodle editor
2. Stored XML-entity escaped in XML (`&lt;p&gt;…`)
3. May contain Moodle tokens:
   - `@@PLUGINFILE@@/filename` → resolved via `files.xml` → blob URL
   - `$@RESOURCEVIEWBYID*123@$` → internal Moodle token (left as “unresolved” badge)

### 5.2 H5P (`hvp`) — triple encoding (structured wrapper, custom JSON)

H5P is the most **custom** common case:

1. `<json_content>` in raw XML (must extract **before** XML parser unescapes — breaks JSON)
2. XML-unescape once → JSON string
3. `JSON.parse`
4. HTML-unescape string fields inside the object

Machine names like `H5P.MultiChoice` pick a renderer; everything else falls back to pretty JSON.

### 5.3 Binary files — structured addressing, custom content

- Path: always `files/<hash[0:2]>/<full_sha1_hash>`
- Metadata: `files.xml`
- Bytes: whatever was uploaded (PDF, PNG, video, …)

---

## 6. Moodle 4.x subsection pattern (structured linkage, nested custom content)

A special **structured pointer** pattern:

```
Parent section
  └── subsection activity (cmid 100)     ← folder in activities/subsection_100/
        └── points to hidden section     ← sections/section_X/ where
            component=mod_subsection       component + itemid link them
            itemid = subsection instance id
            └── real activities live here
```

MBZ Explorer:

- Hides delegated sections from course root
- Shows subsection as **nested folder** in the tree
- Decodes delegated section when subsection folder is expanded

Resolved in `parseStructure.ts` via `component`, `itemid`, and payload IDs.

---

## 7. Structured vs custom — comparison matrix

| Concern | Structured (Moodle-defined) | Custom (varies per course/plugin) |
|---------|----------------------------|-----------------------------------|
| Archive format | gzip+tar / zip | — |
| Directory layout | Yes | — |
| Section order | `<sequence>` cmids | Section names, summaries |
| Activity folder names | `<modtype>_<cmid>` | — |
| Scaffold XML files | Same set per activity | — |
| Payload XML schema | Outer wrapper | Inner fields per modtype |
| HTML body | Escaping rules | Actual teaching content |
| H5P JSON | Wrapper + machine_name | Question text, media, logic |
| Files bucket | Hash paths | File bytes |
| Root globals | `roles.xml`, `gradebook.xml`, … | Whether included depends on backup settings |

**Rule of thumb:** If Moodle core names the path or XML element, it’s structured. If a human or plugin author filled a field, it’s custom.

---

## 8. How MBZ Explorer maps the format to the app

### 8.1 Parser pipeline

```
Upload .mbz
    → extract()           VFS + sha1 cache key
    → buildManifest()     Structure only (all content "pending")
    → decodeFirstSections()  First 2 sections eager decode
    → decodeSection()     On expand / "Analyze full course"
```

**Manifest** (`types.ts`) is the normalized contract — Moodle’s many XML files collapsed into:

- `course` — metadata
- `sections[]` — order, names, delegation
- `activities[]` — type, name, cmid, decode status
- `files[]` — index only until blobs materialized

### 8.2 App folder map (`apps/mbz-explorer/`)

| Path | Role |
|------|------|
| `src/lib/mbz-parser/extract.ts` | Archive detection, tar/zip → VFS |
| `src/lib/mbz-parser/parseStructure.ts` | `moodle_backup.xml`, sections, activities, files, subsections |
| `src/lib/mbz-parser/decodeSection.ts` | Lazy decode orchestration |
| `src/lib/mbz-parser/decoders/htmlLike.ts` | page/resource/label/book/url |
| `src/lib/mbz-parser/decoders/h5p.ts` | H5P JSON + intro HTML |
| `src/lib/mbz-parser/decoders/generic.ts` | Fallback for unsupported types |
| `src/lib/mbz-parser/resolvePluginfiles.ts` | `@@PLUGINFILE@@` → blob URLs |
| `src/lib/mbz-parser/xml.ts` | fast-xml-parser config + entity unescape |
| `src/lib/courseTree.ts` | Top-level sections + nested subsection folders |
| `src/lib/session.ts` | Upload, IDB cache, decode orchestration |
| `src/lib/idb.ts` | Persist manifest + VFS by sha1 |
| `src/components/explorer/Tree.tsx` | Sidebar navigation |
| `src/components/explorer/ContentViewer.tsx` | Rendered / Raw XML / Metadata tabs |
| `src/components/explorer/StructureOverview.tsx` | Section/activity/file counts by type |
| `src/components/explorer/H5pQuestionCard.tsx` | H5P custom renderers |
| `src/components/explorer/UploadDropzone.tsx` | Dashboard upload |
| `src/pages/DashboardPage.tsx` | Saved analyses list |
| `src/pages/ExplorerPage.tsx` | `/f/:sha1` explorer route |
| `agents/mbz explorer spec.md` | Source of truth for app behavior |

### 8.3 UI components vs MBZ layers

| UI component | Shows |
|--------------|-------|
| Tree / Home structure | Structured layer: sections, activity order, subsections |
| Structure Overview | Counts by modtype (how “mixed” a course is) |
| ContentViewer → Rendered | Decoded custom content (HTML/H5P) |
| ContentViewer → Raw XML | Full semi-structured payload (always available) |
| ContentViewer → Metadata | cmid, type, paths, grading flag |
| Unresolved token badges | Moodle internal links the app doesn’t resolve |

---

## 9. What varies most between different `.mbz` files

When comparing backups (the app’s primary v1 use case):

1. **Activity type mix** — e.g. mostly `page`+`hvp` vs heavy `forum`/`assign`/`quiz` (undecoded in v1)
2. **Moodle version** — subsection pattern (4.x+), backup settings
3. **Backup options** — `users`, `anonymize`, gradebook/questions included or not
4. **Language/content** — Hebrew section names, RTL HTML (UI uses `dir="auto"`)
5. **H5P types** — only 4 get custom cards; others show JSON
6. **Compression** — tar.gz vs zip (handled transparently)

---

## 10. Practical takeaway

**The `.mbz` format is a standardized filing system around custom teaching content.**

- **Same everywhere:** archive, paths, `moodle_backup.xml`, `section.xml` sequence, activity folder naming, `files.xml` + hash storage, activity scaffold XML.
- **Different per module:** `<modtype>.xml` inner schema (forum threads vs quiz questions vs page HTML).
- **Different per author:** HTML summaries, H5P JSON, uploaded files.
- **MBZ Explorer** fully leverages the structured shell for navigation and comparison, and selectively decodes the custom inner layers for the activity types it knows about.

---

## 11. Files: embedded in the backup vs references to Moodle

This section explains **where binary assets live** (images, PDFs, banners, etc.) and **what is only a pointer** that only works on a live Moodle server or after restore.

### 11.1 The three-way split

| Kind | Where it lives | Works offline in MBZ Explorer? |
|------|----------------|--------------------------------|
| **Embedded files** | `files/<2hex>/<sha1>` + indexed in `files.xml` | Yes — resolved to blob URLs |
| **Moodle internal link tokens** | `$@SOMETHING*id@$` in HTML/XML | No — needs restore to remap IDs |
| **External / absolute URLs** | Plain `https://…` in XML (e.g. URL activities) | Only if the URL is still reachable on the internet |

There is **no separate “Moodle server file”** inside an `.mbz` for course content. If Moodle included a file in the backup, the **bytes are inside the archive**. If it did not include them, you only get a token or URL.

### 11.2 How Moodle stores files (live server → backup)

On a running Moodle site:

```
Teacher uploads image into Page content
        ↓
Moodle File API stores bytes in moodledata/filedir/ab/abc123…
        ↓
HTML in DB uses placeholder:  src="@@PLUGINFILE@@/photo.png"
        ↓
Browser requests via pluginfile.php (served from moodledata)
```

During **course backup**, Moodle:

1. Walks each plugin’s backup code and calls **`annotate_files(component, filearea, …)`** — declares which file areas belong in this backup.
2. Copies those files into the archive as `files/<hash[0:2]>/<full_hash>`.
3. Lists metadata in **`files.xml`** (filename, contenthash, mimetype, context, component, filearea, …).
4. Records which files each section/activity uses in **`inforef.xml`** (file id cross-refs).
5. Keeps **`@@PLUGINFILE@@/filename`** placeholders in HTML/XML (does **not** rewrite them to absolute server URLs).

So in the `.mbz`, embedded assets are **self-contained**. The `@@PLUGINFILE@@` token is a **relative pointer into the backup’s own `files/` store**, not into the original server.

### 11.3 What typically gets embedded (actual bytes in `files/`)

Anything Moodle’s backup engine annotated for that course — common examples:

| Asset type | Typical source | How it appears in content |
|------------|----------------|---------------------------|
| Images in pages/labels | `<img src="@@PLUGINFILE@@/banner.jpg">` | Embedded |
| PDFs / docs (Resource activity) | `resource_content` file area + `inforef.xml` | Embedded |
| Section summary images | Section `summary` HTML | Embedded |
| H5P media (images, audio, video) | H5P libraries + content folders | Embedded (if H5P backup included them) |
| Book chapter attachments | Book module file areas | Embedded |
| Forum / assign attachments | User-generated (if **user data** included in backup) | Embedded when backed up |
| Course summary / block images | Course or block `annotate_files` | Embedded **if** that plugin backs them up |

**File type does not matter to the format** — PNG, JPG, PDF, MP4, ZIP, etc. are all stored the same way: hash-addressed blobs with a mimetype in `files.xml`.

**“Banners”** are not a special MBZ type. A banner is usually either:

- An **image embedded in HTML** (`@@PLUGINFILE@@/…`) → in `files/`, or
- A **theme/site setting** on the server → **not** in a standard course `.mbz`, or
- A **label/page** styled to look like a banner → HTML + maybe embedded image.

### 11.4 What is NOT embedded (references only)

#### `$@…@$` tokens — Moodle course-structure links

During backup, Moodle **replaces live site URLs** with opaque tokens so restore can remap IDs:

| Token example | Meaning on live Moodle | In `.mbz` / Explorer |
|---------------|------------------------|----------------------|
| `$@RESOURCEVIEWBYID*42@$` | Link to resource activity cmid 42 | **Not a file** — internal link placeholder |
| `$@PAGEVIEWBYID*17@$` | Link to page activity | Same |
| `$@FILEPHP*…@$` | Legacy file.php link (older backups) | Same |

These are **not filenames** and **not server paths**. On restore, Moodle decodes them into new `/mod/…/view.php?id=…` URLs for the **new** course.

MBZ Explorer leaves them as **“unresolved” badges** (`resolvePluginfiles.ts`) — it cannot know the target without running Moodle restore logic.

#### External URLs — not in `files/`

| Source | Example | Embedded? |
|--------|---------|-------------|
| **URL activity** | `<externalurl>https://youtube.com/…</externalurl>` | No — just a string |
| **Raw links in HTML** | `<a href="https://example.com">` | No |
| **Absolute Moodle URLs** (if not encoded) | `https://moodle.school.edu/mod/page/view.php?id=99` | No — dead outside that server |

#### Backup settings can omit data

From `moodle_backup.xml` settings (see `parseStructure.ts`):

- **`users` off** → student uploads, submissions, avatars may be **absent** from `files/` even though activities exist.
- **User data / certain plugins** → some file areas never annotated → content may reference `@@PLUGINFILE@@/…` but the hash is missing from `files.xml` / `files/`.

#### Site / theme assets

- Global theme logos, favicons, CSS, JavaScript from `/theme/…`
- Site-wide repositories linked but not copied
- Content from other courses (shared question banks without full file migration)

These live **outside** a normal course backup unless explicitly included by custom plugins.

### 11.5 How the pieces connect inside an `.mbz`

```
  section.xml / page.xml / resource.xml
         │
         │  HTML contains @@PLUGINFILE@@/myfile.pdf
         │
         ▼
  resolve by filename ──────────►  files.xml  ◄──── inforef.xml (file ids)
         │                              │
         │                              │ contenthash
         ▼                              ▼
  files/ab/abc123…def     ← actual PDF bytes (embedded)
```

**`inforef.xml`** (per section/activity) lists `<fileref><id>123</id></fileref>` → lookup id `123` in `files.xml` → read bytes at `files/xx/hash`.

**`@@PLUGINFILE@@`** (in HTML) skips id lookup and matches **`filename`** in `files.xml` directly (how MBZ Explorer resolves today).

Both paths should point at the **same** `files/` blob when the backup is complete.

### 11.6 How MBZ Explorer resolves embedded files

1. **`parseStructure()`** — reads all of `files.xml` into `manifest.files[]` (metadata only).
2. **`decodeSection()`** — when decoding HTML/H5P intro, runs `resolvePluginfiles()`:
   - Finds `@@PLUGINFILE@@/encoded-name`
   - Looks up `originalFilename` in file index
   - Loads bytes from `files/<2hex>/<hash>` in the VFS
   - Creates a browser `blob:` URL (lazy — only referenced files are materialized)
3. **`$@…@$` tokens** — collected as `unresolvedTokens`, shown as amber badges; **not** fetched from anywhere.
4. **Missing file** — if filename not in `files.xml` or hash missing from `files/`, placeholder stays broken (`@@PLUGINFILE@@/…` unchanged or empty blob).

### 11.7 Quick decision guide

**“Is this image/PDF inside the `.mbz`?”**

- Content has `@@PLUGINFILE@@/something.png` **and** `something.png` appears in `files.xml` with a matching hash file → **yes, embedded**.
- Content has `$@RESOURCEVIEWBYID*…@$` → **no file**; it’s a link to another activity.
- URL activity or plain `https://` → **external reference**.
- Resource activity → main file almost always **embedded** via `inforef.xml` + `files/` (check `activities/resource_<id>/inforef.xml` in Raw XML).
- H5P → JSON + media files in `files/` when H5P backup worked; JSON alone is not the video/image.

**“Does it need the original Moodle server?”**

- Embedded `@@PLUGINFILE@@` assets → **no** (self-contained backup).
- `$@…@$` activity links → **yes** (or a restore step) to become clickable.
- External URLs → **needs the external site** (or archive.org, etc.), not Moodle.
