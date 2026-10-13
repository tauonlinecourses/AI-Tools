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

- `ui.en` / `ui.he` — title, subtitle, All/הכל, empty state, Coming Soon/בקרוב, lang switch label + href, `dir`, `htmlLang`.
- `categoryLabels` — maps English category keys from `tools.config.ts` (e.g. `Video`, `Education`, `Tech`) to localized tab labels.
- `toolCopy` — Hebrew `name` + `description` keyed by tool `id`. When adding a tool, add an entry here for the Hebrew page.
- Helpers: `localizeCategory(locale, category)`, `localizeTool(locale, tool)`.

### `apps/hub/src/components/SoftPageBg.tsx`

Shared soft curved background (`public/hub-bg.png`). Masked so the pattern is soft/near-invisible at the top and a bit stronger toward the bottom (overall opacity ~0.55). Used by `HubPage` and `LoginPage`.

### `apps/hub/src/components/LoginPage.tsx`

Staff sign-in form (email + password via platform auth). Header block is **centered**: logo image above, then title, then subtitle — all `text-center` / `items-center`. Form fields stay start-aligned; submit button is centered. The card sits slightly above true vertical center (`pb-24` on the full-height wrapper). Uses `SoftPageBg` behind the form; the card stays near-opaque white.

### `apps/hub/src/App.tsx`

Shared launcher UI driven by `locale`:

- **ToolCard** — uses `localizeTool` for name/description; Coming Soon badge uses `ui[locale].comingSoon`.
- **HubPage** — category tabs show `ui[locale].all` for `"All"`, otherwise `localizeCategory`; filter logic still keys off English category strings from `tools.config.ts`.
- Same layout as before: header (logo + title + lang switch), category strip, tool grid.
- **Soft page background** — `HubPage` and `LoginPage` both use `SoftPageBg`. Header and category strips use translucent white + light blur so the pattern reads through; tool cards stay solid white. Header is `z-20` and category strip `z-10` so the user-menu popup is not covered/blurred by the category strip’s backdrop filter.
- **User menu** — circular grey placeholder avatar (silhouette). Email + group names (from `listUserGroups`) sit to the **right of the avatar** (`dir="ltr"` cluster). The text column width follows the email (`w-fit`); when there are multiple groups, the comma-joined names truncate (ellipsis) to that same width. Clicking the avatar opens a menu with email, the **full group list**, and red **התנתקות** / **Sign out**; closes on outside click or Escape.

### Adding a new tool (Hebrew)

1. Add the tool in `tools.config.ts` (English name/description/category).
2. Add Hebrew `name` + `description` in `i18n.ts` → `toolCopy[id]`.
3. If the category is new, add labels under `categoryLabels.en` and `categoryLabels.he`.
