# MBZ preserve-and-patch roundtrip

Course Builder can import a Moodle `.mbz` as an editable course and later download a patched `.mbz` that keeps the original archive structure.

## Flow

1. **Import** (`CoursesPage` → ייבא גיבוי): detect `.mbz` / zip → `importCourseFromMbz` → parse → map → insert course + bindings + **metadata only** (`source_sha1`, filename, archive kind). The multi‑hundred‑MB archive is **not** uploaded to Supabase and **not** kept in IndexedDB.
2. **Edit** in Course Builder as usual (sections / pages / text / buttons). What lives in Supabase is normal course rows (small).
3. **Export** (`CourseShell` → הורד MBZ): file picker asks for the **same original `.mbz`**; SHA-1 must match import → patch in the browser → download. Zero File storage usage.

### Why not store the archive?

A single Moodle backup can be 200MB+. Storing it per course would burn the project's File storage quota quickly. Re-supply on export keeps preserve-and-patch fidelity without cloud (or disk) copies of the full package.

Migrations: `016` (tables), `017` (`storage_backend` column), `018` (allow `reupload` default).

JSON **שמור גיבוי** / `.coursebuilder.json` remains a separate path.

## Editable Moodle types (MVP)

| Moodle | Course Builder |
|--------|----------------|
| `page` / `label` | Page HTML is **split** into ordered CB components via `mbzHtmlSplit.ts` (see below). |
| `resource` | Page: intro HTML split + `button` (file binary stays in archive) |
| `url` | Page: optional intro HTML split + `button` (`props.url`) |
| `hvp` | Normal page: H5P Column/QuestionSet → intro HTML split + `question` blocks (TrueFalse → `yes_no` with `__correct`/`__incorrect`, MultiChoice → single/multiple). DragText/DragQuestion → text (+ implementer note). H5P JSON is **not** rewritten on export (name/sequence only). |
| `board` | Normal page: intro HTML split + `notes_board` (columns from Moodle board) |

### Page HTML → components (`mbzHtmlSplit.ts`)

Moodle page content is tag-soup HTML (banner image, Panopto/YouTube iframes, Genially embeds, image CTAs, callout boxes). Import **does not** require the binary files to be present in the archive or uploaded to Storage.

**Layout unwrap + flatten:** Moodle often wraps a whole page in `max-width:100%` / `height:…` / centered shells, and nests videos under stacked `padding-bottom:56.25%` divs with transcript image-buttons beside them. The splitter peels those shells and recursively flattens mixed containers so banner / video / image-buttons become sibling components (not one giant `text` block).

| Moodle HTML pattern | CB component | Props |
|---------------------|--------------|-------|
| First / wide / `באנר`\|banner-labeled `<img>` (incl. `@@PLUGINFILE@@/…`) | `banner` | `imageUrl`, optional `title` from `alt` |
| Other lone `<img>` | `image` | `imageUrl` |
| Panopto / YouTube / SharePoint / Vimeo iframe | `video` | `url`, `provider`, optional `title` |
| Other iframe (e.g. Genially) | `interactive_unit` | `fileUrl` = iframe src |
| `<a href><img></a>` image button / CTA (תמליל, Frame, etc.) | `text_unit` | `imageUrl`, `fileUrl` (href), `notes` from alt |
| Short text-only `<a>` | `button` | `text`, `url` |
| Remaining prose / callout boxes | `text` (consecutive segments merged) | `html` |

Media-only blocks are never skipped as “empty.” Iframe wrappers that also contain image CTAs are flattened so both the video and each button are kept. First image on a page defaults to `banner` when dimensions/labels are ambiguous.
| Top-level section | CB section (title editable) |
| `subsection` | Expanded into parent CB section; pointer preserved in Moodle sequence |

Other unsupported activities (`forum`, …) stay in the archive and in `<sequence>`; they are not CB pages.

## Bindings

- `course_mbz_sources` — storage path, sha1, archive kind (`tgz`/`zip`/`tar`)
- `course_mbz_bindings` — section/activity ↔ Moodle ids, `payload_field`, `meta.originalSequence` / `preservedCmids`

## Export rules

- Patch only bound XML fields + section name/sequence; do not rewrite `files/`.
- Soft-omit deleted mapped pages from `<sequence>` (do not delete activity folders).
- CB-only pages added after import are skipped (Hebrew warning).
- Sequence rebuild keeps unsupported cmids in stable relative slots (`rebuildSequence`).

## Migration

Apply [`supabase/migrations/016_course_mbz_roundtrip.sql`](../supabase/migrations/016_course_mbz_roundtrip.sql) on the live project (tables + Storage bucket + open RLS policies matching current MVP).

## Manual Moodle restore checkpoint

After exporting a real fixture: restore into Moodle and confirm edited HTML/titles, preserved unsupported activities, `@@PLUGINFILE@@` images, and subsection nesting.
