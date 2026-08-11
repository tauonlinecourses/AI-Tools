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
- Header language switcher: Hebrew page links to `/en` (label **English**); English page links to `/` (label **עברית**).
- On mount / locale change, `HubPage` sets `document.documentElement.lang` + `dir`, `document.title`, and `persistHubLocale(locale)` so tool headers match.
- Tool cards use `toolHrefWithLocale(tool, locale)` (`?lang=he` / `?lang=en`) so `PageLayout` on tool apps shows the matching Hebrew/English hub chrome.
- Vercel SPA rewrite in `apps/hub/vercel.json` so `/en` serves `index.html`.

### `apps/hub/src/i18n.ts`

Single source for hub chrome copy, category labels, and Hebrew tool names/descriptions.

- `ui.en` / `ui.he` — title, subtitle, All/הכל, empty state, Coming Soon/בקרוב, lang switch label + href, `dir`, `htmlLang`.
- `categoryLabels` — maps English category keys from `tools.config.ts` (e.g. `Video`, `Education`, `Tech`) to localized tab labels.
- `toolCopy` — Hebrew `name` + `description` keyed by tool `id`. When adding a tool, add an entry here for the Hebrew page.
- Helpers: `localizeCategory(locale, category)`, `localizeTool(locale, tool)`.

### `apps/hub/src/App.tsx`

Shared launcher UI driven by `locale`:

- **ToolCard** — uses `localizeTool` for name/description; Coming Soon badge uses `ui[locale].comingSoon`.
- **HubPage** — category tabs show `ui[locale].all` for `"All"`, otherwise `localizeCategory`; filter logic still keys off English category strings from `tools.config.ts`.
- Same layout as before: header (logo + title + lang switch), category strip, tool grid.

### Adding a new tool (Hebrew)

1. Add the tool in `tools.config.ts` (English name/description/category).
2. Add Hebrew `name` + `description` in `i18n.ts` → `toolCopy[id]`.
3. If the category is new, add labels under `categoryLabels.en` and `categoryLabels.he`.
