# Virtual Support

Hebrew hub/tool display name: **מדריכים - Virtual TAU**. English remains "Virtual Support".

Hebrew staff knowledge base for an organization technical-support department, plus grounded Ask (RAG) over those documents.

## Workspace (NotebookLM-style)

Single screen with three columns (RTL):

| Column | Width | Purpose |
|--------|-------|---------|
| **מקורות (right)** | ~26% | Floating rounded panel, RTL. Header **Virtual TAU מסמכים**, then OneNote-style split: **נושאים** (folders, right, colored tabs) + **עמודים** (documents in the selected topic, left). |
| **צ׳אט (middle)** | `flex-1` (~50% with both side panels) | Session Ask over the knowledge base. Answers cite numbered sources. |
| **מסמך (left)** | ~25%, hidden until open | Floating rounded panel matching sources height. Viewer / editor from sidebar or chat citations. Delete lives on the edit form (not the read-only viewer). |

Workspace height is locked to `calc(100vh - header)`; side panels share that height via the padded flex row (`px-5` / `md:px-6`, `py-3`, `gap-3`) so left/right read as floating cards inset from the screen edges.

**Rounding note:** shared `@workspace/config` sets Tailwind `rounded-*` (except `control` / `timeline` / `full`) to `0`. Side panels must use arbitrary radii (e.g. `rounded-[1.5rem]`), not `rounded-2xl` / `rounded-3xl`.

### מקורות interaction

- Click a topic → shows its pages in the pages column.
- Click a page → opens it in the left document viewer.
- Opening a doc from chat citations selects its topic automatically.
- `+ הוספת נושא` / `+ הוספת עמוד` (page goes into the active topic).
- Double-click or hover ✎ to rename a topic; hover × to delete (docs move to ללא תיקייה).

Out of scope for v1: nested folders, PDF/Word uploads, saved notebooks, durable chat history, source checkboxes / web research.

## Architecture

```
Browser (ToolAuthGate toolId=virtual-support)
  → POST /api/data   { action, payload }   → service_role CRUD + reindex
  → POST /api/ask    { question, history } → embed → match_doc_chunks → gpt-4o
  → POST /api/chat   (standard ai-client; Ask does not call this from the browser)
```

Platform identity lives in the **Course-Builder** Supabase project. Document data lives in a **dedicated Virtual Support** Supabase project. The browser never holds the data service role.

## Data model

Tables (see `supabase/migrations/001_init.sql`):

- `folders` — `name`, `position`
- `documents` — `folder_id` (nullable = unfiled), `title`, `body` (sanitized HTML), `position`, `content_hash`
- `doc_chunks` — `document_id`, `chunk_index`, plain `content`, `content_hash`, `embedding vector(1536)`
- RPC `match_doc_chunks(query_embedding, match_count, match_threshold)` — **service_role only**
- Storage bucket `doc-images` — public read; writes via BFF

Deleting a folder moves its documents to unfiled, then deletes the folder. Deleting a document cascades chunks.

## Indexing (on save)

1. Hash `title + body` (`sha256`).
2. Strip HTML → plain text; chunk ~1200 chars with ~200 overlap on paragraph boundaries.
3. Embed with OpenAI `text-embedding-3-small` (1536 dims).
4. Replace `doc_chunks` for that document. Skip re-embed when hash matches existing chunks.

## Ask flow

1. Embed the question.
2. `match_doc_chunks` (default 8 hits, threshold 0.3).
3. Keep best excerpt per document; hydrate titles / folder names.
4. If no hits → Hebrew “not in the knowledge base” message (no model call).
5. Else call `@workspace/ai-client/server` with a Hebrew system prompt that answers only from excerpts.
6. Return `{ answer, sources: [{ documentId, title, folderName, excerpt, similarity }] }`.
7. UI shows numbered citation chips on the answer; clicking a chip (or a row in מקורות) opens that document in the left viewer column.

## BFF actions (`/api/data`)

`listFolders`, `createFolder`, `renameFolder`, `deleteFolder`, `listDocuments`, `getDocument`, `createDocument`, `updateDocument`, `deleteDocument`, `uploadImage`.

## Env

See `.env.example`.

| Var | Role |
|-----|------|
| `VITE_PLATFORM_*` / `PLATFORM_*` | Course-Builder Platform Auth |
| `VITE_SUPABASE_URL` | Data project URL (config detection) |
| `VS_SUPABASE_URL` / `VS_SUPABASE_SERVICE_ROLE_KEY` | Server BFF |
| `OPENAI_API_KEY` | Embeddings + Ask |

## Local

```bash
pnpm --filter virtual-support dev   # http://localhost:5180
```

Vite middleware proxies `/api/data`, `/api/ask`, `/api/chat` with the same Platform JWT gate as production.

## Deploy

1. Create Supabase project; apply `supabase/migrations/001_init.sql`.
2. Apply Course-Builder migration `012_virtual_support_tool.sql` (tool allowlist + group grants).
3. Vercel project root `apps/virtual-support`; include source outside root; link shared `OPENAI_API_KEY` + Platform env + `VS_*`.
4. Set hub `tools.config.ts` `url` to the live hostname if it differs from the placeholder.
