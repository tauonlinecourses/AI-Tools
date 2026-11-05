# Virtual Support

Hebrew hub/tool display name: **מדריכים - Virtual TAU**. English remains "Virtual Support".

Hebrew staff knowledge base for an organization technical-support department, plus grounded Ask (RAG) over those documents.

## Workspace (NotebookLM-style)

Single screen with three columns (RTL):

| Column | Width | Purpose |
|--------|-------|---------|
| **מקורות (right)** | ~26% | Floating rounded white panel (`bg-white`), RTL. Header **Virtual TAU מסמכים**, then OneNote-style split: **נושאים** (folders, right, colored tabs) + **עמודים** (documents in the selected topic, left). |
| **צ׳אט (middle)** | `flex-1` (~50% with both side panels) | Session Ask over the knowledge base. Answers cite numbered sources. |
| **מסמך (left)** | ~25%, hidden until open | Floating rounded panel matching sources height. Viewer / editor from sidebar or chat citations. Delete lives on the edit form (not the read-only viewer). |

Workspace height is locked to `calc(100vh - header)`; side panels share that height via the padded flex row (`px-5` / `md:px-6`, `py-3`, `gap-3`) so left/right read as floating cards inset from the screen edges.

**Rounding note:** shared `@workspace/config` sets Tailwind `rounded-*` (except `control` / `timeline` / `full`) to `0`. Side panels must use arbitrary radii (e.g. `rounded-[1.5rem]`), not `rounded-2xl` / `rounded-3xl`.

### מקורות interaction

- Click a topic → shows its pages in the pages column.
- Click a page → opens it in the left document viewer.
- Opening a doc from chat citations selects its topic automatically.
- `+ הוספת נושא` opens an inline name field (Enter to save); `+ הוספת עמוד` opens the editor for the active topic.
- Double-click or hover ✎ to rename a topic; hover × to delete (docs move to ללא תיקייה).
- Load/create API failures show a red banner above the workspace (not only inside the document viewer).

Out of scope for v1: nested folders, PDF/Word uploads, saved notebooks, durable chat history, source checkboxes / web research.

## Architecture

```
Browser (ToolAuthGate toolId=virtual-support)
  → POST /api/data   { action, payload }   → service_role CRUD + reindex
  → POST /api/ask    { question, history } → rewrite → embed → match_doc_chunks_hybrid → gpt-4o
  → POST /api/chat   (standard ai-client; Ask does not call this from the browser)
```

Platform identity lives in the **Course-Builder** Supabase project. Document data lives in a **dedicated Virtual Support** Supabase project. The browser never holds the data service role.

## Data model

Tables (see `supabase/migrations/001_init.sql`, `002_hybrid_search.sql`):

- `folders` — `name`, `position`
- `documents` — `folder_id` (nullable = unfiled), `title`, `body` (sanitized HTML), `position`, `content_hash`
- `doc_chunks` — `document_id`, `chunk_index`, plain `content`, `content_hash`, `embedding vector(1536)` (HNSW index), `content_tsv` (generated `to_tsvector('simple', content)`, GIN index)
- RPC `match_doc_chunks_hybrid(query_embedding, query_text, match_count, rrf_k)` — vector + keyword search fused with Reciprocal Rank Fusion; returns `similarity`, `keyword_rank`, `rrf_score` per chunk. **service_role only**. Used by Ask.
- RPC `match_doc_chunks(query_embedding, match_count, match_threshold)` — legacy vector-only search, kept for compatibility. **service_role only**
- Storage bucket `doc-images` — public read; writes via BFF

Deleting a folder moves its documents to unfiled, then deletes the folder. Deleting a document cascades chunks.

## Indexing (on save)

1. Hash `title + body` (`sha256`).
2. Strip HTML → plain text; chunk ~1200 chars with ~200 overlap on paragraph boundaries.
3. Embed with OpenAI `text-embedding-3-small` (1536 dims).
4. Replace `doc_chunks` for that document. Skip re-embed when hash matches existing chunks.

## Ask flow (Stage 1 — `server/askHandler.ts`, pure helpers in `server/askRetrieval.ts`)

Pages are short step-by-step guides, so chunks are used to **find** pages and the model is given **whole pages**.

1. **Rewrite follow-ups.** If there is chat history, `gpt-4o-mini` rewrites the latest question into a standalone Hebrew question (keeping exact terms). No history → no call; failure → original question.
2. **Keyword terms.** Tokenize the (rewritten) question, drop Hebrew/English stopwords and 1-char tokens, add Hebrew prefix-stripped variants (`והמדפסת` → `המדפסת`, `מדפסת`) and hyphen parts (`ל-VPN` → `vpn`). Postgres has no Hebrew dictionary, so SQL uses the `simple` config.
3. **Hybrid search.** Embed the question and call `match_doc_chunks_hybrid` (20 chunks, RRF k=60).
4. **Relevance gate + page ranking.** A chunk counts if cosine similarity > 0.3 **or** it is a strong keyword hit (contains a Latin/number term such as an error code, or ≥ 2 different query words). Relevant chunks are grouped by page; pages ranked by best RRF score; top **4** kept.
5. If no page passes → Hebrew “not in the knowledge base” message (no answer-model call).
6. **Context.** Full plain text of each page, numbered `[מסמך n: title (folder)]`, filled in rank order within ~15k chars (ai-client's 16k per-message limit). The page that overflows is truncated (if ≥ 400 chars fit) and lower-ranked pages are dropped.
7. Call `gpt-4o` via `@workspace/ai-client/server`; the system prompt answers only from the pages and quotes procedures step by step as written.
8. Return `{ answer, sources: [{ documentId, title, folderName, excerpt, similarity }] }` — `sources` are the pages actually sent, in context order; `excerpt` is the best chunk (≤ 400 chars) for the UI.
9. UI shows numbered citation chips on the answer; clicking a chip (or a row in מקורות) opens that document in the left viewer column.

Tuning constants live at the top of `server/askHandler.ts`.

### Roadmap

- **Stage 2:** inline citation per sentence (`[n]`, validated server-side); first cited page opens automatically in the left column — **not** while the user is in edit mode. Images stay in the opened page (answers link to pages, no inline screenshots).
- **Stage 3:** 👍/👎 per answer, stored with question, answer, cited pages and retrieval scores (no review UI yet).

### Tests

```bash
pnpm --filter virtual-support test    # unit tests (server/**/*.test.ts)
pnpm --filter virtual-support smoke   # real dev Supabase + OpenAI; reads .env; needs 002 migration
```

`SMOKE_ANSWER=1` additionally calls `gpt-4o` and prints a full answer.

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

1. Create Supabase project; apply `supabase/migrations/001_init.sql`, then `002_hybrid_search.sql`.
2. Apply Course-Builder migration `012_virtual_support_tool.sql` (tool allowlist + group grants).
3. Vercel project root `apps/virtual-support`; include source outside root; link shared `OPENAI_API_KEY` + Platform env + `VS_*`.
4. Set hub `tools.config.ts` `url` to the live hostname if it differs from the placeholder.
