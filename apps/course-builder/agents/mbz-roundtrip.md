# MBZ preserve-and-patch roundtrip

Course Builder can import a Moodle `.mbz` as an editable course and later download a patched `.mbz` that keeps the original archive structure.

## Flow

1. **Import** (`CoursesPage` → ייבא גיבוי): detect `.mbz` / zip → `importCourseFromMbz` → parse → map → insert course + bindings + **metadata only** (`source_sha1`, filename, archive kind). The multi‑hundred‑MB archive is **not** uploaded to Supabase and **not** kept in IndexedDB.
2. **Edit** in Course Builder as usual (sections / pages / text / buttons). What lives in Supabase is normal course rows (small).
3. **Export** (`CourseShell` → הורד MBZ): file picker asks for the **same original `.mbz`**; SHA-1 must match import → patch in the browser → download. Zero File storage usage.

### Why not store the archive?

A single Moodle backup can be 200MB+. Storing it per course would burn the project's File storage quota quickly. Re-supply on export keeps preserve-and-patch fidelity without cloud (or disk) copies of the full package.

Migrations: `016` (tables), `017` (`storage_backend` column), `018` (allow `reupload` default).

JSON **שמירת גיבוי** / `.coursebuilder.json` remains a separate path.

## Editable Moodle types (MVP)

| Moodle | Course Builder |
|--------|----------------|
| `page` / `label` | Page HTML is **split** into ordered CB components via `mbzHtmlSplit.ts` (see below). |
| `resource` | Page: intro HTML split + `button` (file binary stays in archive) |
| `url` | Page: optional intro HTML split + `button` (`props.url`) |
| `hvp` | Normal page: H5P Column/QuestionSet → intro HTML split + `question` blocks (TrueFalse → `yes_no` with `__correct`/`__incorrect`, MultiChoice → single/multiple). DragText/DragQuestion → text (+ implementer note). H5P JSON is **not** rewritten on export (name/sequence only). |
| `board` | Normal page: intro HTML split + `notes_board` (columns from Moodle board) |

### Page HTML → components (`mbzHtmlSplit.ts`)

Moodle page content is tag-soup HTML (banner image, Panopto/YouTube iframes, Genially embeds, image CTAs, callout boxes). Import **does not** upload image binaries to Storage.

**Pluginfile preview:** `@@PLUGINFILE@@/filename` is rewritten at import to a live Moodle `{wwwroot}/pluginfile.php/{contextid}/{component}/{filearea}/{itemid}/…` URL (from `files.xml` + `original_wwwroot`). No bytes are stored — display only. Requires a Moodle login session in the same browser (same class of caveat as SharePoint embeds). When the same filename appears under both `user/draft` and `mod_*/content` (common for תמליל / Frame / הפניה thumbs), the map **prefers content/intro/section** so preview URLs stay stable; `draftfile.php` https srcs are rewritten the same way when the filename is known. A course-level binding (`moodle_id: __pluginfile_map__`) keeps the filename↔URL map for export. On export, known Moodle pluginfile URLs become `@@PLUGINFILE@@/…` again; user-replaced URLs (SharePoint / other) stay as-is.

**Layout unwrap + flatten:** Moodle often wraps a whole page in `max-width:100%` / `height:…` / centered shells, and nests videos under stacked `padding-bottom:56.25%` divs with transcript image-buttons beside them. The splitter peels those shells and recursively flattens mixed containers so banner / video / image-buttons become sibling components (not one giant `text` block).

| Moodle HTML pattern | CB component | Props |
|---------------------|--------------|-------|
| First / wide / `באנר`\|banner-labeled `<img>` (incl. `@@PLUGINFILE@@/…`) | `banner` | `imageUrl`, optional `title` from `alt` |
| Other lone `<img>` | `image` | `imageUrl` |
| Panopto / YouTube / SharePoint / Vimeo iframe | `video` | `url`, `provider`, optional `title` |
| Other iframe (Genially, Canva, ThingLink, Padlet, Miro, …) | `interactive_unit` | `fileUrl` = iframe src (iframe `title`/`alt` are **not** copied to `notes`) — CB preview embeds the iframe live |
| Compact `<a href><img></a>` CTA (תמליל, Frame, ≤400×120 chip) | `button` | `text` from `alt`, `url` from href, `align: center` |
| Linked image labeled הפניה / ציר זמן / אינטראקטיב | `interactive_unit` | `imageUrl` + `fileUrl` (clickable thumbnail; no notes from alt) |
| Larger linked preview image (PDF / resource thumb) | `text_unit` | `imageUrl`, `fileUrl` (href) |
| Linked image whose href is Genially/Canva/… | `interactive_unit` | `imageUrl` + `fileUrl` |
| Short text-only `<a>` | `button` (or `interactive_unit` if label is הפניה…) | `text`/`notes`, `url`/`fileUrl` |
| Remaining prose / callout boxes | `text` (consecutive segments merged) | `html` (links + colors kept; see `textHtml.ts`) |

**Linked-image classification:** `הפניה` / `ציר זמן` / interactive labels → `interactive_unit` (thumbnail + link; never `button`). Compact chip CTAs (`looksLikeImageButton`: תמליל/כפתור/Frame, or width≤400 & height≤120 & wide aspect) → `button`. Interactive host href → `interactive_unit`. Otherwise → `text_unit`. Preview: thumbnail when `imageUrl` is set; iframe embed only for pure Genially/Canva iframe imports (no image).

**Text HTML:** imported Moodle markup stays HTML. `sanitizeTextHtml` keeps `<a href>`, any safe hex/rgb/named `color`, and `div` wrappers for callouts; TipTap Link accepts Moodle/relative/token hrefs. Toolbar color picks remain the fixed palette; imported colors outside the palette are still shown.

Media-only blocks are never skipped as “empty.” Iframe wrappers that also contain image CTAs are flattened so both the video and each button are kept. First image on a page defaults to `banner` when dimensions/labels are ambiguous.

| Top-level lesson section | CB section (title editable) |
| Moodle section 0 / name `עמוד ראשי` / `General` / `כללי` | **No CB lesson** — content merges onto the built-in course home page. Section binding uses `mapsToHome` + `cb_id` = home page id. |
| Home section `<summary>` HTML | Split into CB components first (banner / text / …); export patches `section.xml` `<summary>` via `summaryComponentStart/End` |
| Home `unilabel` grid | Buttons from tile title+url (one-way; Moodle XML kept) |
| Home `learningmap` | `interactive_unit` with background `@@PLUGINFILE@@` image (one-way) |
| Home `lti` | Button with tool URL when present (one-way) |
| Activity titled `עמוד ראשי` under a lesson | Also promoted onto the CB home page |
| `subsection` | Expanded into parent CB section (or home); pointer preserved in Moodle sequence |

**Home merge:** multiple Moodle labels/pages in the home section become one CB עמוד ראשי; each activity binding stores `componentStart`/`componentEnd` so export can patch each Moodle XML from its slice. Reordering home components after import can desync those ranges.

Other unsupported activities (`forum`, …) stay in the archive and in `<sequence>`; they are not CB pages.

## Bindings

- `course_mbz_sources` — storage path, sha1, archive kind (`tgz`/`zip`/`tar`)
- `course_mbz_bindings` — section/activity ↔ Moodle ids, `payload_field`, `meta.originalSequence` / `preservedCmids`
- Pluginfile preview map — binding `moodle_id: __pluginfile_map__` with `meta.pluginfileByFilename` / `pluginfileByUrl` (strings only)

## Export rules

- Patch only bound XML fields + section name/sequence; do not rewrite `files/`.
- Soft-omit deleted mapped pages from `<sequence>` (do not delete activity folders).
- CB-only pages added after import are skipped (Hebrew warning).
- Sequence rebuild keeps unsupported cmids in stable relative slots (`rebuildSequence`).

## Migration

Apply [`supabase/migrations/016_course_mbz_roundtrip.sql`](../supabase/migrations/016_course_mbz_roundtrip.sql) on the live project (tables + Storage bucket), then [`020_mbz_authenticated_only.sql`](../supabase/migrations/020_mbz_authenticated_only.sql), which limits them to logged-in users.

## Manual Moodle restore checkpoint

After exporting a real fixture: restore into Moodle and confirm edited HTML/titles, preserved unsupported activities, `@@PLUGINFILE@@` images, and subsection nesting.
