<!-- AGENT DOC: Step 3b — packages/ui layout & exports -->
<!-- Topic: Input, Badge, Spinner, hub.ts, PageLayout, index exports -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 5 of 10**.
>
> ← Previous: [04-packages-ui-basics.md](./04-packages-ui-basics.md)
> → Next: [06-packages-ai-client.md](./06-packages-ai-client.md)

---

## Step 3b — `packages/ui` form controls, layout & exports

Continues Step 3 from [04-packages-ui-basics.md](./04-packages-ui-basics.md). Covers Input, Badge, Spinner, hub URL helpers, PageLayout, and package exports.

### Hub locale (`packages/ui/src/hub.ts`)

| Export | Role |
|--------|------|
| `HubLocale` | `"en" \| "he"` |
| `hubOrigin()` | Base hub URL (DEV localhost `5173`, else `VITE_HUB_URL` / prod Vercel) |
| `hubHref(locale?)` | Hub home; default Hebrew `/`, `"en"` → `{origin}/en` |
| `resolveHubLocale()` | `?lang=` then `localStorage` (`ai-tools-hub-locale`), default `"he"` |
| `persistHubLocale(locale)` | Writes the storage key |

Hebrew is the site default. English hub is at `/en`. Tool links append `?lang=he` or `?lang=en` so tools open with the matching header. `PageLayout` persists the resolved locale so in-app navigation keeps it.

### `PageLayout` (`packages/ui/src/components/PageLayout.tsx`)

Shared top nav on every tool:

- **בית / Hub** link → `hubHref(locale)` (or override `hubUrl`)
- Optional `toolName` / `toolDescription` (English)
- Optional `toolNameHe` / `toolDescriptionHe` (shown when locale is `he`)
- Optional `toolTrail` — extra `/`-separated crumbs after the tool name (`{ label, to? }`); linked crumbs use `renderTrailLink` when provided (e.g. react-router `Link`), otherwise a plain `<a href>`
- Optional `locale` prop; otherwise auto from `resolveHubLocale()`
- Header `dir` is RTL for Hebrew; logo uses logical `ms-auto` so it sits on the trailing edge
- Content area is unchanged (tools own their own `dir` for page body)

```tsx
<PageLayout
  toolName="Video Curator"
  toolDescription="…"
  toolNameHe="ניתוח וידאו"
  toolDescriptionHe="…"
  maxWidth="full"
  padded={false}
>
  …
</PageLayout>
```

Video Curator uses `maxWidth="full"` and `padded={false}` so the split-pane editor stays full-bleed under the Hub nav. Tools should omit `hubUrl` so the Hub back link resolves via `hubHref(locale)`.

The nav bar shows the brand logo on the trailing edge as a link to the hub home (`hubHref(locale)`), same target as the בית / Hub text link. The asset lives at `packages/ui/src/assets/Logo.png` and is imported by `PageLayout`. The Hub homepage logo (`apps/hub/public/logo-narrow.png`) also links to the current locale home (`/` or `/en`).

### `packages/ui/src/index.ts`

Exports components plus `hubHref`, `hubOrigin`, `resolveHubLocale`, `persistHubLocale`, `HUB_*` constants, and `HubLocale`.
