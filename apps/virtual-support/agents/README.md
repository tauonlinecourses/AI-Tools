# Virtual Support

Hebrew hub/tool display name: **מדריכים - Virtual TAU**. English remains "Virtual Support".

Hebrew staff knowledge base for an organization technical-support department, plus grounded Ask (RAG) over those documents.

## Workspace (NotebookLM-style)

Single screen with three columns (RTL):

| Column | Width | Purpose |
|--------|-------|---------|
| **מקורות (right)** | ~26% | Floating rounded white panel (`bg-white`), RTL. Header **Virtual TAU מסמכים**, then OneNote-style split: **נושאים** (folders, right, colored tabs) + **עמודים** (documents in the selected topic, left). |
| **צ׳אט (middle)** | `flex-1` (~50% with both side panels) | Page-grey Ask canvas (`#f8f9fa`, NotebookLM-style messages): user turns in a `#e8eaed` pill (`rounded-[2rem]`, `text-sm`, `px-5 py-3.5`); assistant answers flush on the canvas with larger type (`~1.05rem`), no card/blob. Inline numbered citation chips + source chips under the answer. |
| **מסמך (left)** | ~25%, hidden until open | Floating rounded panel matching sources height. Viewer / editor from sidebar or chat citations. Delete lives on the edit form (not the read-only viewer). |

Workspace height is locked to `calc(100vh - header)`; side panels share that height via the padded flex row (`px-5` / `md:px-6`, `py-3`, `gap-3`) so left/right read as floating cards inset from the screen edges.

**Rounding note:** shared `@workspace/config` sets Tailwind `rounded-*` (except `control` / `timeline` / `full`) to `0`. Side panels must use arbitrary radii (e.g. `rounded-[1.5rem]`), not `rounded-2xl` / `rounded-3xl`.

### מקורות interaction

- Click a topic → shows its pages in the pages column.
- Click a page → opens it in the left document viewer.
- Opening a doc from chat citations selects its topic automatically.
- While the editor is open (edit or new page), opening another page from מקורות, a citation, or `+ הוספת עמוד` asks to confirm discarding unsaved changes.
- `+ הוספת נושא` opens an inline name field (Enter to save); `+ הוספת עמוד` opens the editor for the active topic.
- Topic ⋮ menu: שינוי שם (inline rename) and מחיקה (red trash icon; docs move to ללא תיקייה). Double-click a topic name also renames.
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

Tables (see `supabase/migrations/001_init.sql`, `002_hybrid_search.sql`, `003_ask_log.sql`):

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

## Ask flow (`server/askHandler.ts`; pure helpers in `server/askRetrieval.ts`, `server/askCitations.ts`)

Pages are short step-by-step guides, so chunks are used to **find** pages and the model is given **whole pages**.

1. **Rewrite follow-ups.** If there is chat history, `gpt-4o-mini` rewrites the latest question into a standalone Hebrew question (keeping exact terms). No history → no call; failure → original question.
2. **Keyword terms.** Tokenize the (rewritten) question, drop Hebrew/English stopwords and 1-char tokens, add Hebrew prefix-stripped variants (`והמדפסת` → `המדפסת`, `מדפסת`) and hyphen parts (`ל-VPN` → `vpn`). Postgres has no Hebrew dictionary, so SQL uses the `simple` config.
3. **Hybrid search.** Embed the question and call `match_doc_chunks_hybrid` (20 chunks, RRF k=60).
4. **Relevance gate + page ranking.** A chunk counts if cosine similarity > 0.3 **or** it is a strong keyword hit (contains a Latin/number term such as an error code, or ≥ 2 different query words). Relevant chunks are grouped by page; pages ranked by best RRF score; top **4** kept.
5. If no page passes → Hebrew “not in the knowledge base” message (no answer-model call).
6. **Context.** Full plain text of each page, numbered `[מסמך n: title (folder)]`, filled in rank order within ~15k chars (ai-client's 16k per-message limit). The page that overflows is truncated (if ≥ 400 chars fit) and lower-ranked pages are dropped.
7. Call `gpt-4o` via `@workspace/ai-client/server` (temperature 0.1; rewrite uses 0, so the same question gets the same answer/refusal). The system prompt answers only from the pages, quotes procedures step by step as written, and ends **every sentence/step with `[n]`** (the page number). Answer vs. refuse:
   - **Answering is the default** when a page explains the question's main action in the same system — even with different wording, synonyms, or an extra detail the page does not mention (e.g. "קבוצה אחרת").
   - If the user asks about a detail the page does not cover, answer the covered part and add one closing sentence naming exactly what is missing (only for details the user asked about).
   - A **different system** than the page's (e.g. Zoom vs. Panopto) is not a small detail — no transferring procedures between systems.
   - Refuse with the fixed `REFUSAL_SENTENCE` only when no page explains the action/topic. `isRefusal` treats an answer as a refusal only when it is essentially that sentence alone, so partial answers keep their sources.
8. **Citations** (`askCitations.ts`): normalize variants (`[1, 2]`, `[מסמך 1]`, `[מסמך 1: title]` → `[1][2]`), drop markers for pages not sent, renumber cited pages by first appearance, collapse repeats. Assistant messages in the history have markers stripped before reuse.
9. Return `{ answer, sources, cited }`:
   - `cited: true` → `sources` are **only the cited pages**, `[n]` = `sources[n-1]`, so `[1]` is the first cited page.
   - Refusal sentence → `sources: []`, `cited: false`.
   - Model answered without any valid marker → `sources` = all pages sent (fallback), `cited: false`, logged as `vs_answer_uncited`.
   - Each source: `{ documentId, title, folderName, excerpt (best chunk, ≤ 400 chars), similarity }`.
10. **UI** (`AskPage.tsx`, `src/lib/citations.ts`): `[n]` markers render as small inline chips; the source row under the answer shows `n · title`. Clicking either opens the page in the left column instantly from the page list already loaded in `App.tsx` (fetched via `getDocument` only if the page is not loaded yet). When `cited` is true, the **first cited page opens automatically** — skipped if the editor is open at the moment the answer arrives (`App.tsx`, `editModeRef`). Images stay in the opened page (answers link to pages, no inline screenshots).

Tuning constants live at the top of `server/askHandler.ts`.

### Roadmap

- **Stage 1 (done):** hybrid search, full-page context, follow-up rewrite.
- **Stage 2 (done):** inline citation per sentence, cited-only sources, auto-open of the first cited page (not while editing), confirm before discarding edits.
- **Stage 3 (done):** anonymous Ask log, 👍/👎 with optional comment, re-test (eval) script.

## Ask log & feedback (Stage 3)

**What is stored.** Every question asked in the app writes one row to `ask_log` (rated or not): question, rewritten search query, answer, `outcome` (`answered` / `refused` / `no_match` / `uncited`), pages sent with scores (`pages_sent`), cited page ids, best chunk similarity, `pipeline_version` (constant `PIPELINE_VERSION` in `server/askHandler.ts` — bump it whenever the prompt, models or retrieval settings change), and the vote.

**Anonymous.** No user id or email. `session_id` is a random id generated in the browser per page load, only to group one chat's questions. Kept indefinitely for now; nothing references `ask_log`, so `truncate public.ask_log;` is safe later.

**Feedback UI** (`AskPage.tsx`). 👍/👎 under each logged answer, saved immediately via `/api/data` → `rateAnswer { logId, vote, comment? }`; clicking the active vote clears it. 👎 opens an optional one-line “מה לא היה תקין?” field (≤ 500 chars). Logging failures never block the answer (`vs_ask_log_failed` warning; the answer then has no 👍/👎).

**Reviewing.** In the Supabase table editor open the `ask_log_review` view and filter:
- `vote = down` — read `vote_comment`, `pages_sent`, `answer`.
- `refused = true` — content gaps (pages to write).
- `uncited`, `weak_match` (best similarity < 0.35), `rephrased` (next question in the same chat within 2 min) — answers worth checking even without a vote.

Diagnosing a bad row: expected page **not** in `pages_sent` → search problem; page sent but answer refused/missed → prompt problem; no page covers it → write content; page used but wrong → fix the page.

**Re-test set** (`ask_eval_cases`): `question`, `expected_outcome` (`answer` / `refuse`), `expected_document_ids` (uuid[]; the page(s) that should be found and cited — page ids are in the `documents` table), `note`, `active`. Add cases by copying real questions from the log in the table editor.

```bash
pnpm --filter virtual-support eval
```

Runs every active case through the real pipeline (no `ask_log` rows written) and checks **search** (expected page among pages sent), **outcome** (answered vs refused as expected) and **citation** (expected page cited). Prints a line per case, a summary such as `passed 4/5 · search 3/3 · outcome 5/5 · citation 2/3`, failure details, and writes a JSON report to `eval-results/` (git-ignored). Run it before and after any prompt/retrieval change.

### Tests

```bash
pnpm --filter virtual-support test    # unit tests (server/**/*.test.ts, src/**/*.test.ts)
pnpm --filter virtual-support smoke   # real dev Supabase + OpenAI; reads .env; needs 002 migration; does not write ask_log
pnpm --filter virtual-support eval    # re-test set from ask_eval_cases (see Ask log & feedback); needs 003 migration
```

`SMOKE_ANSWER=1` additionally calls `gpt-4o` and prints a full answer.

## BFF actions (`/api/data`)

`listFolders`, `createFolder`, `renameFolder`, `deleteFolder`, `listDocuments`, `getDocument`, `createDocument`, `updateDocument`, `deleteDocument`, `uploadImage`, `rateAnswer`.

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

1. Create Supabase project; apply `supabase/migrations/001_init.sql`, then `002_hybrid_search.sql`, then `003_ask_log.sql`.
2. Apply Course-Builder migration `012_virtual_support_tool.sql` (tool allowlist + group grants).
3. Vercel project root `apps/virtual-support`; include source outside root; link shared `OPENAI_API_KEY` + Platform env + `VS_*`.
4. Set hub `tools.config.ts` `url` to the live hostname if it differs from the placeholder.

## Admin dashboard (Stage A)

Tab **דשבורד** next to **מסמכים וצ׳אט**, shown only to members of the platform Admin group (`admin-all-tools`). The browser hides the tab (`useIsAdmin` in `src/lib/metricsClient.ts`); `/api/admin-metrics` re-checks with `assertUserIsAdmin` (dev: `requireVsPlatformAuth(..., { requireAdmin: true })`) and returns 403 otherwise. The page is lazy-loaded so recharts is only downloaded by admins.

- **Data:** every Ask writes `latency_ms` per stage (rewrite / embed / search / answer / total), token `usage` per model call, `input_tokens` / `output_tokens` / `embed_tokens`, `cost_usd`, and failed requests as `outcome = 'error'` with `error_message` (`<stage>: <message>`). Migration `004_ask_metrics.sql`. Rows from before 004 count in volume/feedback but not in latency/token/cost charts.
- **Cost:** estimated from `server/pricing.ts` (USD per 1M tokens). Prices are unverified — check OpenAI's pricing page and update when models change.
- **Aggregation:** `server/dashboardMetrics.ts` (pure, tested) over ask_log rows for 7 / 30 / 90 days, bucketed by Israel day. Rephrase = next question in the same chat within 2 minutes (same rule as `ask_log_review`). Breakdowns use the folder/document of the first cited page (else first page sent).
- **Rows:** 1 health (volume, error rate, P50/P95 per stage with a 5s line, cost per question) · 2 retrieval (no-match rate, median best similarity, median top RRF, index freshness = docs whose `content_hash` is missing or no longer matches title+body) · 3 quality (abstention + uncited rate with pipeline-version release markers) · 4 users (👎 and rephrase rate, by topic and document) · tokens and cost (tokens per model per day, cost per day, cost per question, by model and stage).
- **Not yet (Stage B/C):** judge scores (faithfulness, citation support, context recall/precision), nightly golden-set run, alerts, review queue, drill-down, release gate, escalations.
