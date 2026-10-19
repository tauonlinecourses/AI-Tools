<!-- AGENT DOC: Step 5b — apps/hub App.tsx -->
<!-- Topic: hub launcher UI, tool cards, categories, Hebrew locale -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 8 of 10**.
>
> ← Previous: [07-apps-hub-config.md](./07-apps-hub-config.md)
> → Next: [09-apps-tool-starter.md](./09-apps-tool-starter.md)

---

## Step 5b — `apps/hub` launcher UI

Continues Step 5 from [07-apps-hub-config.md](./07-apps-hub-config.md).

### Locales & routing

| Route | Locale | Direction |
|-------|--------|-----------|
| `/`   | Hebrew (`he`, default) | RTL |
| `/en` | English (`en`)         | LTR |

- `react-router-dom` wraps the app in `main.tsx` (`BrowserRouter`).
- `App.tsx` routes `/` → `<HubPage locale="he" />` and `/en` → `<HubPage locale="en" />`. Legacy `/he` redirects to `/`.
- Header language switcher: Hebrew page links to `/en` (label **English**); English page links to `/` (label **עברית**). Currently **hidden** via `SHOW_LANG_SWITCHER = false` in `App.tsx` (set to `true` to bring it back); `/en` route still works.
- On mount / locale change, `HubPage` sets `document.documentElement.lang` + `dir`, `document.title`, and `persistHubLocale(locale)` so tool headers match.
- Tool cards use `toolHrefWithLocale(tool, locale)` (`?lang=he` / `?lang=en`) so `PageLayout` on tool apps shows the matching Hebrew/English hub chrome.
- Vercel SPA rewrite in `apps/hub/vercel.json` so `/en` serves `index.html`.

### `apps/hub/src/i18n.ts`

Single source for hub chrome copy, category labels, and Hebrew tool names/descriptions.

- `ui.en` / `ui.he` — title, subtitle, All/הכל, empty state, Coming Soon/בקרוב, no-permission tooltip (`אין לך הרשאות לכלי זה` / English equivalent), lang switch label + href, `dir`, `htmlLang`.
- `categoryLabels` — maps English category keys from `tools.config.ts` (e.g. `Video`, `Education`, `Tech`) to localized tab labels.
- `toolCopy` — Hebrew `name` + `description` keyed by tool `id`. When adding a tool, add an entry here for the Hebrew page.
- Helpers: `localizeCategory(locale, category)`, `localizeTool(locale, tool)`.

### Favicon

`public/favicon.png` — brand tab icon (square TAU seal crop). Linked from `index.html`. The same PNG is copied into every standalone tool’s `public/` so hub and tools share one favicon.

### `apps/hub/src/components/SoftPageBg.tsx`

Shared soft curved background (`public/hub-bg.png`). Masked so the pattern is soft/near-invisible at the top and a bit stronger toward the bottom (overall opacity ~0.55). Used by `HubPage` and `LoginPage`.

### `apps/hub/src/components/LoginPage.tsx`

Staff sign-in form (email + password via platform auth). Header block is **centered**: logo image (`h-16`, same height as the hub homepage logo) above, then title, then subtitle from `ui[locale].subtitle` (Hebrew: **כלים שפותחו על ידי הדקנט, למען הדקנט**) — all `text-center` / `items-center`. Form fields stay start-aligned. Above **Sign in** / **כניסה**, a `dir="ltr"` row places **Create account** / **יצירת חשבון** on the physical left and **Forgot password?** / **שכחת סיסמה?** on the physical right (same underline link style); the submit button stays centered (`/register` or `/en/register`, and `/auth/forgot-password` or `/en/auth/forgot-password`). The card sits slightly above true vertical center (`pb-24` on the full-height wrapper). Uses `SoftPageBg` behind the form; the card stays near-opaque white.

### Register / set-password / forgot / change / pending

| Route | Component | Behavior |
|---|---|---|
| `/register`, `/en/register` | `RegisterPage` | Email + password + group select (excludes Admin). No display-name field. Creates pending user via `/api/register`, then signs in → pending gate. |
| `/auth/forgot-password`, `/en/auth/forgot-password` | `ForgotPasswordPage` | Public email form → `resetPasswordForEmail` → neutral success message (no email enumeration). |
| `/auth/set-password`, `/en/auth/set-password` | `SetPasswordPage` | Invite **or** recovery landing: session from invite/reset link → set new password → continue to hub. Recovery detected via `PASSWORD_RECOVERY` / `type=recovery` (copy switches to reset wording). No session: prompt to open the email/shared link; if URL has Auth `error` / `error_description` (e.g. `otp_expired`), show expired-link copy instead. |
| `/auth/change-password`, `/en/auth/change-password` | `ChangePasswordPage` | Signed-in only (unsigned → hub home). Current + new + confirm; verifies current password then `updatePlatformPassword`. |
| (hub when `accountStatus` is pending/rejected) | `AccountStatusPage` | Blocking message + sign out; no tools. |

### `apps/hub/src/App.tsx`

Shared launcher UI driven by `locale`:

- **ToolCard** — uses `localizeTool` for name/description; Coming Soon badge uses `ui[locale].comingSoon`. Always rendered for every tool in the filtered category. Clickable only when `toolIsOpenable()` **and** the tool id is in `allowedToolIds`; otherwise dimmed (`opacity-60`, `cursor-not-allowed`) with native `title` tooltip `ui[locale].noPermission` (Hebrew: **אין לך הרשאות לכלי זה**). `hubPath` tools navigate in-app (e.g. MBZ at `/mbz-explorer`); standalone tools use auth handoff.
- **HubPage** — if session but `accountStatus` is `pending`/`rejected`, shows `AccountStatusPage` instead of the catalog. Category tabs show `ui[locale].all` for `"All"`, otherwise `localizeCategory`; filter logic still keys off English category strings from `tools.config.ts`. **Does not hide** tools the user lacks group access for — the full catalog is always shown; entitlement only disables the card. Within the filtered list, **available** tools (`toolIsOpenable` + in `allowedToolIds`) are sorted first; original catalog order is kept within available / unavailable. When the URL has `?returnUrl=` (from a tool `ToolAuthGate` redirect), an approved session resolves it via `findToolForReturnUrl` (catalog `url` / `devUrl` / `hubPath` only): entitled → handoff or in-app `hubPath` navigate; no entitlement → stay on catalog.
- Same layout as before: header (logo + title + lang switch), category strip, tool grid.
- **Soft page background** — `HubPage` and `LoginPage` both use `SoftPageBg`. Header and category strips use translucent white + light blur so the pattern reads through; tool cards stay solid white. Header is `z-20` and category strip `z-10` so the user-menu popup is not covered/blurred by the category strip’s backdrop filter.
- **User menu** — circular grey placeholder avatar (silhouette). Email + team names (from `listUserGroups`) sit to the **right of the avatar** (`dir="ltr"` cluster). The text column width follows the email (`w-fit`); when there are multiple teams, the comma-joined names truncate (ellipsis) to that same width. The **entire** avatar+details block is one clickable control; it opens a menu with email, the **full team list** (UI label: **צוותים** / Teams), **שינוי סיסמה** / **Change password** (links to `/auth/change-password` or `/en/auth/change-password`), and red **התנתקות** / **Sign out**; closes on outside click or Escape.
- **Admin button** — gear icon link to `/admin` (or `/en/admin`), placed **visually to the right** of the user menu (`dir="ltr"` on the header actions cluster). Visible only when `usePlatformAuth().isAdmin` is true (membership in group slug `admin-all-tools`).
- **MBZ host / route** — wrapped in `ApprovedOnly` (pending/rejected blocked). Host: unsigned → `LoginPage`; signed-in without `mbz-explorer` entitlement → `<Navigate>` to hub home; otherwise mounts the MBZ app.
- **Dictionary Tool host / route** — same pattern at `/dictionary-tool/*` (`DictionaryToolHost`, entitlement id `dictionary-tool`).

### Admin page (`/admin`, `/en/admin`)

`apps/hub/src/components/AdminPage.tsx` — Admin-group-only management UI. Uses shared `PageLayout` strip header (בית / Hub + tool name + strip logo), same as the other tools; `hubUrl` points at `/` or `/en`. Soft hub background (`SoftPageBg`) sits behind a transparent `PageLayout` shell (`className="bg-transparent"`).

| Capability | Behavior |
|---|---|
| Gate | Client: redirect/deny if not signed in, not approved, or not `isAdmin`. Server: `/api/admin` requires Bearer JWT + Admin group membership (service_role checks). |
| Users tab | Table of Auth users (email, display name from email local-part, **status**, groups). Filter by group and status; sort by email or groups. **Create user** modal: step 1 email + groups + create; step 2 user properties + invite URL **Copy**, or **Send invite email** (mutually exclusive for the live token — email clears the copyable link). Pending: **Approve** / **Reject**. Approved: **Edit** groups. Every row (except self): **Remove** permanently deletes the Auth user (`removeUser`; confirm dialog; cannot remove your own account). |
| Groups tab | Table of groups (name, slug, tools, member count). Create / edit name, slug, description, and tool checkboxes (`createGroup` / `updateGroup`). **Edit members** opens checkboxes to set who belongs to that group (`setGroupMembers`). |

API: `GET/POST /api/admin` (`apps/hub/api/admin.ts` + `adminOps.ts`) — actions include `inviteUser`, `approveUser`, `rejectUser`. Public `GET/POST /api/register`. Local Vite middleware mirrors both in `vite.config.ts`. Client helpers: `src/lib/adminApi.ts`, `src/lib/registerApi.ts`.

### Adding a new tool (Hebrew)

1. Add the tool in `tools.config.ts` (English name/description/category).
2. Add Hebrew `name` + `description` in `i18n.ts` → `toolCopy[id]`.
3. If the category is new, add labels under `categoryLabels.en` and `categoryLabels.he`.
