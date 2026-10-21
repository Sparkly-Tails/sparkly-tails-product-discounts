# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app homepage (`src/app/page.tsx`) to match the Stitch "Discounts" screen exactly, with one "All discounts" table (real rows; working tabs, search, Filters, Sort, pagination) and placeholder number cards.

**Architecture:** Pure functions (row building, status mapping, query parsing, filtering, sorting, paging, money and date text) in `src/home/`, tested first. Small presentational server components in `src/home/components/`, no client JavaScript: the tabs, search, Filters, Sort and pagination are plain links and GET forms that write to the page's query string, so the server component filters, sorts and pages the data on every request. The page is styled by tokens in `src/home/home.css` (prefixed `home-`) so no other page changes.

**Tech Stack:** Next.js 16.2.10 (async `searchParams`), React 19.2.4, Tailwind 4, `next/font` (Inter), vitest 3 with jsdom and `@testing-library/react` for components.

**Spec:** `docs/superpowers/specs/2026-10-21-homepage-redesign-design.md` (assets in `docs/superpowers/specs/assets/homepage-redesign/`). Read the spec first; it holds the owner's decisions and the 15 numbered calls this plan implements.

## Global Constraints

- Match `stitch-discounts-screen.jpg` and its HTML exactly (layout, spacing, colours, type, icons, copy); only real rows and the spec's "My calls" may differ.
- Stat cards show the sample values Visitors `16`, Bundle orders `0`, AOV `0.00`, Added revenue `0.00`, with the "Last 30d" button and info icons (title texts from the HTML). They are placeholders; no data is collected.
- Table: tabs All/Active/Inactive with counts of ALL discounts; search on the row title; Filters = type (tier-based / time-based); Sort = title A-Z, title Z-A, type (tier first), status (Active first), ties by title A-Z, default = stored order (tier discounts then time-based); `PAGE_SIZE = 10`; any change of tab/search/filter/sort returns to page 1.
- Active = tier `status === 'live'` or time label `Active`; Inactive = tier `draft`, time `Upcoming` or `Expired`.
- Create buttons link to `/discounts/new` and `/time-discounts/new`. "More information", the tip's "Settings > Visual badges" link and the footer links (Privacy, Support, Shopify App Store) are `href="#"` dead links.
- `ensureTierDiscountSafely()` stays the first call on the page. Rows link to `/discounts/<id>` and `/time-discounts/<id>` (ids URL-encoded).
- The homepage keeps its light palette in dark mode; icons are inline SVG; no CDN scripts, no Material Symbols font, no Tailwind CDN.
- Code guidelines (`docs/coding-guidelines.md`): 3+ letter noun variable names, verb function names, no outer-scope reads, more than 2 parameters as one object, plain-value parameters, injected function calls, at most 2 branches per function. New files get lint errors. React component signatures and the Next page default export keep the framework shape; logic goes into pure functions.
- Tests first; one `vitest` process at a time; `source ~/.nvm/nvm.sh && nvm use 22.23.3` per shell. Every code commit bumps `package.json` and the first two version fields of `package-lock.json`. Commit messages carry no AI attribution. Never commit to `main`; PRs only, the owner merges and deploys.
- Branches: milestone `milestone/homepage-redesign` from `dev`; one feature branch per PR into the milestone; one final PR milestone into `dev` (merge commit).

## Review Focus

Inputs the spec implies but no task's happy-path tests cover; each has a test in the task named in brackets.

1. A tier discount with a blank `name` or `title`, or a time-based discount with a blank `title`: the row must still render with a readable title, never an empty link. [Task 1]
2. A time-based discount whose `startsAt`/`endsAt` is malformed or empty: the schedule text falls back to the raw text instead of throwing or printing "Invalid Date". [Task 1]
3. Query string abuse: `page=0`, `page=-3`, `page=abc`, `page=999`, repeated parameters (`?tab=active&tab=all`), unknown `sort`/`type`/`tab` values: all fall back to defaults or the last page, never throw or show an empty page when rows exist. [Task 2]
4. Search text with uppercase, surrounding spaces, `%`, `&`, `+`, quotes and non-ASCII letters: matching ignores case and surrounding spaces, and the links built for tabs, sort and pages round-trip the text through the address exactly. [Task 2]
5. Zero discounts, and a search or filter that matches nothing: distinct messages, tabs still show real counts, no "Showing 0-0" arithmetic errors, pagination hidden. [Tasks 2 and 5]
6. More than 10 discounts: second page shows the right rows and "Showing 11-12 of 12"; sort is stable (equal keys keep title order). [Task 2]

---

### Task 1: Row building (PR 1: `feat/home-rows-and-query`)

**Files:**
- Create: `src/home/discountRows.ts`, `src/home/formatMoney.ts`
- Modify: `src/lib/shop.ts` (add `getShopCurrencyCode`)
- Test: `tests/home/discountRows.test.ts`, `tests/home/formatMoney.test.ts`, `tests/lib/shop.test.ts` (extend the existing file if present, else create)

**Interfaces:**
- Produces:
  - `export interface DiscountRow { key: string; kind: 'tier' | 'time'; title: string; subtitle: string; rules: string; isActive: boolean; href: string }`
  - `export function createMoneyFormatter(options: { currencyCode: string }): (amount: number) => string` in `formatMoney.ts`. Uses `Intl.NumberFormat('en', { style: 'currency', currency })`; an invalid code falls back to `amount.toFixed(2)`.
  - `export function describeTierRules(options: { steps: { minQty: number; amount: number }[]; pricingMode: 'percent' | 'fixed'; formatMoney: (amount: number) => string }): string`. Steps sorted by `minQty`. Percent: `"3+ units (10% off), 5+ units (20% off)"`. Fixed: `"3+ units (£1.50 each)"`.
  - `export function describeTimeSchedule(options: { startsAt: string; endsAt: string; statusLabel: 'Upcoming' | 'Active' | 'Expired' }): string`. Upcoming: `"Nov 27, 2026 - Nov 30, 2026 (Scheduled)"`; Active: `"Ends Nov 30, 2026"`; Expired: `"Ended Nov 30, 2026"`. Dates come from naive strings like `2026-11-27T09:00` formatted without any timezone shift; a string that cannot be parsed is returned unchanged.
  - `export function buildTierRow(input: { discountId: string; name: string; title: string; status: 'draft' | 'live'; rules: string }): DiscountRow` (title = `name`, or `title` if `name` is blank, or `"Untitled discount"`; subtitle = `title` when not blank and different from the row title, else `''`).
  - `export function buildTimeRow(input: { discountId: string; title: string; schedule: string; statusLabel: 'Upcoming' | 'Active' | 'Expired' }): DiscountRow` (blank title becomes `"Untitled discount"`; subtitle `''`).
  - `export function buildDiscountRows(options: { tierRows: DiscountRow[]; timeRows: DiscountRow[] }): DiscountRow[]` (tier rows first, stored order).
  - `export async function getShopCurrencyCode(): Promise<string>` in `src/lib/shop.ts`, querying `shop { currencyCode }` through `shopifyQuery`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing tests.** In `discountRows.test.ts`: `describeTierRules` percent and fixed examples above (use a `formatMoney` stub `(amount) => '£' + amount.toFixed(2)`), steps given out of order come out sorted; `describeTimeSchedule` for the three labels with the example strings above; Review Focus 2 as `describeTimeSchedule({ startsAt: 'soon', endsAt: '', statusLabel: 'Expired' })` returning a string that contains no "Invalid Date" and does not throw; `buildTierRow` maps `live` to `isActive: true` and `draft` to `false`, `href` is `/discounts/` plus the URL-encoded id, `key` is `tier:<id>`; Review Focus 1 (blank name falls back to title, both blank to "Untitled discount", subtitle rules); `buildTimeRow` maps `Active` to `isActive: true`, `Upcoming` and `Expired` to `false`, `href` `/time-discounts/<id>`, `key` `time:<id>`; `buildDiscountRows` keeps tier rows before time rows. `formatMoney.test.ts`: `createMoneyFormatter({ currencyCode: 'GBP' })(1.5)` returns `"£1.50"`, `'USD'` returns `"$1.50"`, `'???'` returns `"1.50"`. `shop.test.ts`: `getShopCurrencyCode` returns the code from a mocked `shopifyQuery` and calls it with a query containing `currencyCode`.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home tests/lib/shop.test.ts`. Expected: FAIL (modules or exports not defined).
- [ ] **Step 3: Implement** the modules to the signatures above, following the code guidelines (inject `formatMoney`; split date parsing, date formatting and the three schedule texts into separate small functions; at most 2 branches each).
- [ ] **Step 4: Run the tests.** Run: `npx vitest run tests/home tests/lib/shop.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** (bump version) with message `feat: build the homepage table rows from tier and time-based discounts`.

---

### Task 2: Table query (PR 1, same branch)

**Files:**
- Create: `src/home/tableQuery.ts`
- Test: `tests/home/tableQuery.test.ts`

**Interfaces:**
- Consumes: `DiscountRow` from Task 1.
- Produces:
  - `export type StatusTab = 'all' | 'active' | 'inactive'`, `export type TypeFilter = 'all' | 'tier' | 'time'`, `export type SortKey = 'default' | 'title-asc' | 'title-desc' | 'type' | 'status'`
  - `export interface TableQuery { tab: StatusTab; type: TypeFilter; search: string; sort: SortKey; page: number }` and `export const DEFAULT_QUERY: TableQuery` (`all`, `all`, `''`, `default`, `1`) and `export const PAGE_SIZE = 10`
  - `export function parseTableQuery(raw: Record<string, string | string[] | undefined>): TableQuery` (an array value uses its last item; unknown values give the default; `page` is an integer of at least 1 else 1; `search` is trimmed)
  - `export interface TableView { visibleRows: DiscountRow[]; counts: { all: number; active: number; inactive: number }; matchCount: number; page: number; pageCount: number; firstNumber: number; lastNumber: number }`
  - `export function applyTableQuery(options: { rows: DiscountRow[]; query: TableQuery }): TableView` (counts over ALL rows; filter by tab, type and search (case-insensitive substring of `title`); sort by key with ties by `title` A-Z, `default` keeps stored order; `page` clamped to `1..pageCount`; with no matches `pageCount` is 1, `firstNumber` and `lastNumber` are 0)
  - `export function buildTableHref(options: { query: TableQuery; changes: Partial<TableQuery> }): string` (returns `/` plus a query string; defaults are omitted; any change other than `page` resets `page` to 1; values are encoded so they round-trip through `parseTableQuery(Object.fromEntries(new URLSearchParams(...)))`)

- [ ] **Step 1: Write the failing tests** with a fixture of 12 rows (mixed kinds and activity, titles including uppercase, a duplicate title and an accented one): `parseTableQuery` defaults for `{}`; Review Focus 3 as a table of inputs (`page: '0' | '-3' | 'abc' | '2.5' | ['1','2']`, `tab: 'bogus'`, `tab: ['active','all']`, `sort: 'newest'`) with the expected results; `applyTableQuery`: counts equal the totals whatever the search is; tab `active` keeps only active rows; type `time` keeps only time rows; search `"  SALMON "` matches `"Salmon Oil"` (case, trim); sort `title-asc`, `title-desc`, `type` (tier first), `status` (Active first), each stable with ties by title; default sort keeps input order; Review Focus 6: with 12 rows page 2 has 2 rows and `firstNumber 11`, `lastNumber 12`; `page: 999` is clamped to the last page; Review Focus 5: no matches gives `visibleRows []`, `pageCount 1`, `firstNumber 0`, `lastNumber 0`, while `counts` stay real; zero rows at all behaves the same; `buildTableHref`: defaults produce `/`, a change of tab drops `page`, a page change keeps the other values, Review Focus 4 as a round-trip test for the search texts `"100% & more"`, `"a+b"`, `` `'quote'` ``, `"café"`.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home/tableQuery.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `tableQuery.ts` with the signatures above. Keep each function to at most 2 branches (separate small functions for each field's parsing, for the filters, the comparator per sort key, and the paging arithmetic).
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run the PR gates (full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`: 0 errors).
- [ ] **Step 5: Commit** (bump version) `feat: parse, filter, sort and page the homepage table`; push the branch and open PR 1 into `milestone/homepage-redesign` (create the milestone branch from `dev` first and push it). PR text: what changed, what was verified (test counts), what is not verified (not wired into the page yet).

---

### Task 3: Page shell: tokens, font, icons, header, footer, version label (PR 2: `feat/home-shell-and-static-sections`)

**Files:**
- Create: `src/home/home.css`, `src/home/homeFont.ts`, `src/home/components/icons.tsx`, `src/home/components/HomeHeader.tsx`, `src/home/components/HomeFooter.tsx`, `src/components/VersionLabel.tsx`
- Modify: `src/app/layout.tsx` (use `VersionLabel`), `src/app/globals.css` only if it needs the `home.css` import (prefer importing `home.css` from the page)
- Test: `tests/home/components/shell.test.tsx`, `tests/components/VersionLabel.test.tsx`, extend `tests/app/layout.test.ts`

**Interfaces:**
- Produces:
  - `home.css`: a `@theme` block with every colour of the Tailwind config in `stitch-discounts-screen.html` as `--color-home-<name>` (same names and hex values: `primary`, `primary-container`, `surface`, `surface-container-lowest`, ... `on-surface`, `outline-variant`, `secondary`, `tertiary-fixed`, etc.), so the design's classes become `bg-home-surface`, `text-home-on-surface-variant`, `border-home-outline-variant/70`; plus `--font-home: var(--font-inter), sans-serif` and `rounded-*` values identical to the Stitch config (`DEFAULT 0.25rem`, `lg 0.5rem`, `xl 0.75rem`).
  - `homeFont.ts`: `export const homeFont = Inter({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-inter', display: 'swap' })` from `next/font/google`.
  - `icons.tsx`: one named exported component per icon, each `({ className }: { className?: string }) => JSX`, `aria-hidden`, `fill="currentColor"`, 24-unit viewBox: `CalendarIcon`, `InfoIcon`, `LayersIcon`, `ScheduleIcon`, `FilterListIcon`, `SwapVertIcon`, `SearchIcon`, `ChevronLeftIcon`, `ChevronRightIcon`, `ArrowForwardIcon`, `LightbulbIcon`, `TierTypeIcon` (the stacked-lines path from the HTML's table rows), `TimeTypeIcon` (the clock path from the HTML's table rows). Shapes follow the Material Symbols outlined glyphs the design names.
  - `HomeHeader(): JSX` (the sticky bordered header with the centred "ST" mark and "Smooth Discounts", markup and classes from the HTML).
  - `HomeFooter({ version }: { version: string }): JSX` (`Smooth Discounts v<version>` left; Privacy, Support, Shopify App Store dead links right).
  - `VersionLabel({ version }: { version: string }): JSX | null` client component; returns `null` when `usePathname()` is `/`, else the existing `v<version>` div (same classes as today).
- Consumes: nothing from Tasks 1-2.

- [ ] **Step 1: Write the failing tests.** `shell.test.tsx` (jsdom): `HomeHeader` renders the text "Smooth Discounts" and "ST"; `HomeFooter({ version: '1.2.3' })` shows `Smooth Discounts v1.2.3` and three links named Privacy, Support, Shopify App Store each with `href="#"`; every icon component renders an `svg` with `aria-hidden="true"`; `home.css` (read as text) defines `--color-home-primary: #173028` and `--color-home-surface: #fbf9f4`. `VersionLabel.test.tsx` with `next/navigation` mocked: renders `v0.1.0` for pathname `/discounts/new`, renders nothing for `/`. `layout.test.ts`: the rendered tree contains `VersionLabel` (keep the three existing tests).
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home tests/components/VersionLabel.test.tsx tests/app/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above; copy the exact markup, spacing and classes of the header and footer from the Stitch HTML, replacing colour class names with the `home-` prefixed ones.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: homepage header, footer, tokens, icons and a version label that hides on the homepage`.

---

### Task 4: Static sections: stat cards, create cards, tip banner (PR 2, same branch)

**Files:**
- Create: `src/home/components/StatCards.tsx`, `src/home/components/CreateCards.tsx`, `src/home/components/TipBanner.tsx`, `public/home/tier-illustration.jpg`, `public/home/time-illustration.jpg` (copied unchanged from the spec assets)
- Test: `tests/home/components/staticSections.test.tsx`

**Interfaces:**
- Produces: `StatCards(): JSX` (the "Last 30d" button and four cards; labels Visitors, Bundle orders, AOV, Added revenue; values `16`, `0`, `0.00`, `0.00`; each info icon carries the `title` text from the HTML); `CreateCards(): JSX` (two articles: tag, heading, text and buttons exactly as in the HTML; the primary buttons are links: "Create tier discount" to `/discounts/new` with the arrow icon, "Create tier time discount" to `/time-discounts/new`; "More information" `href="#"`; images `/home/tier-illustration.jpg` and `/home/time-illustration.jpg` with explicit `width={512}` `height={286}` and the alt texts of the HTML); `TipBanner(): JSX` (lightbulb, "Did you know?", the sentence and the dead "Settings > Visual badges" link).
- Consumes: icons and tokens from Task 3.

- [ ] **Step 1: Write the failing tests** (jsdom): `StatCards` shows the four labels with values `16`, `0`, `0.00`, `0.00` in that order and a "Last 30d" button; `CreateCards`: the link named "Create tier discount" has `href="/discounts/new"`, "Create tier time discount" has `href="/time-discounts/new"`, both "More information" links have `href="#"`, both images have the `src` paths above and the copy text "Reward bigger orders. Offer percentage off or a fixed price as customers add more units of a product." is present; `TipBanner` contains "Did you know?" and a link named "Settings > Visual badges" with `href="#"`.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home/components/staticSections.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the three components, copying the markup and classes from the HTML (colour class names prefixed `home-`). Copy the two images to `public/home/`.
- [ ] **Step 4: Run the tests and the PR gates** (`npx vitest run`, `npx tsc --noEmit`, `npm run lint` 0 errors). Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: homepage number cards, create cards and tip banner`; push and open PR 2 into the milestone. PR text states that these components are not used by the page yet.

---

### Task 5: The "All discounts" table (PR 3: `feat/home-discounts-table`)

**Files:**
- Create: `src/home/components/DiscountsTable.tsx`, `src/home/components/TableToolbar.tsx`, `src/home/components/FilterMenu.tsx`, `src/home/components/SortMenu.tsx`, `src/home/components/TablePagination.tsx`, `src/home/components/StatusPill.tsx`
- Test: `tests/home/components/discountsTable.test.tsx`

**Interfaces:**
- Consumes: `DiscountRow`, `TableQuery`, `TableView`, `buildTableHref`, `PAGE_SIZE` (Tasks 1-2); icons and tokens (Task 3).
- Produces: `DiscountsTable({ view, query }: { view: TableView; query: TableQuery }): JSX` composing the card from the HTML: header ("All discounts", the description line, the Filters and Sort buttons), the tab pills with counts and the search box, the table (columns Discount title, Type, Status, Schedule / Rules, row link with chevron), the footer ("Showing <first>-<last> of <matchCount> discounts", Previous, Next). Parts: `TableToolbar({ query, counts })` (tabs are links built with `buildTableHref`, the current tab `aria-current="page"`; the search is a GET `<form action="/">` with hidden inputs keeping `tab`, `type`, `sort`, an `<input name="search" aria-label="Search discounts">` and the design's placeholder "Search discounts..."), `FilterMenu({ query })` (a `<details>` styled as the "Filters" button; the panel is a GET form with radio inputs named `type` (All, Tier-based, Time-based) preserving `tab`, `search`, `sort`, and an Apply button), `SortMenu({ query })` (a `<details>` styled as the "Sort" button listing links for Default order, Title A-Z, Title Z-A, Type, Status, the current one `aria-current="true"`), `TablePagination({ query, view })` (Previous and Next as links, disabled spans on the first and last page, nothing but the "Showing" line when `pageCount` is 1), `StatusPill({ isActive }: { isActive: boolean })` (Active green pill and Inactive grey pill as in the HTML). Empty states: no rows at all gives one line "No discounts yet." inside the card; a search/filter with no match gives "No discounts match your search or filters." and a "Clear filters" link to `/`; in both cases pagination is hidden and the tabs keep real counts.

- [ ] **Step 1: Write the failing tests** (jsdom) with rows built by hand: header texts; the tab links have the hrefs `buildTableHref` gives and the active tab has `aria-current="page"`; the tab labels show the counts from `view.counts`; the search form has `method="get"`, an input named `search` with the current value, and hidden inputs for the non-default `tab`, `type` and `sort`; the Filters panel has a checked radio for the current type; the Sort menu marks the current sort; each body row has a link to the row's `href`, the type icon matches `kind` (assert by `data-kind`), the status pill text is Active or Inactive, the "Schedule / Rules" cell shows `rules`; the subtitle line renders only when non-empty; "Showing 11-12 of 12 discounts" for a second-page view; Previous is a disabled span on page 1, Next is a disabled span on the last page; Review Focus 5 for both empty states (texts above, no pagination, tab counts still shown).
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home/components/discountsTable.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, copying markup and classes from the Stitch HTML's "Section 2" (colours prefixed `home-`), as server components without client state; keep the "Schedule / Rules" column hidden below `sm` as in the design.
- [ ] **Step 4: Run the tests and the PR gates.** Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: the All discounts table with tabs, search, filters, sort and pagination`; push and open PR 3 into the milestone (not wired into the page yet).

---

### Task 6: Wire the page and check it against the design (PR 4: `feat/home-page-wiring`)

**Files:**
- Create: `src/home/components/HomeView.tsx`, `src/home/loadDiscountRows.ts`
- Modify: `src/app/page.tsx`, `tests/app/home.test.ts`, `eslint.guidelines-legacy.mjs` (remove `'src/app/page.tsx',` from the list in this PR, since the new page follows the guidelines)
- Test: `tests/home/components/homeView.test.tsx`, `tests/home/loadDiscountRows.test.ts`

**Interfaces:**
- Consumes: everything above; `getConfig`, `getTimeDiscountsConfig`, `computeTimeDiscountStatusLabel`, `getShopTimezone`, `getShopCurrencyCode`, `ensureTierDiscountSafely`.
- Produces:
  - `loadDiscountRows(options: { loadTierDiscounts: () => Promise<{ discountId: string; name: string; title: string; status: 'draft' | 'live'; pricingMode: 'percent' | 'fixed'; tiers: { minQty: number; percentOff?: number; fixedPrice?: number }[] }[]>; loadTimeDiscounts: () => Promise<{ discountId: string; title: string; startsAt: string; endsAt: string }[]>; loadTimezone: () => Promise<string>; loadCurrencyCode: () => Promise<string>; getStatusLabel: (options: { startsAt: string; endsAt: string; timezone: string }) => 'Upcoming' | 'Active' | 'Expired' }): Promise<DiscountRow[]>` using `createMoneyFormatter`, `describeTierRules`, `describeTimeSchedule`, `buildTierRow`, `buildTimeRow`, `buildDiscountRows` (the percent/fixed amount of a step is `percentOff ?? 0` or `fixedPrice ?? 0`).
  - `HomeView({ view, query, version }: { view: TableView; query: TableQuery; version: string }): JSX` composing, inside a wrapper that applies the font variable (`homeFont.variable`), `font-home`, `bg-home-surface`, `text-home-on-surface` and `min-h-screen`: `HomeHeader`, `<main className="w-full max-w-[1024px] mx-auto px-6 py-8 flex-1 flex flex-col gap-6">` with the page title block ("Discounts" with the bare "/" breadcrumb), `StatCards`, `CreateCards`, `DiscountsTable`, `TipBanner`, then `HomeFooter`.
  - `src/app/page.tsx`: `export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> })` calling `ensureTierDiscountSafely()` first, then `loadDiscountRows` (with the real loaders injected), `parseTableQuery(await searchParams)`, `applyTableQuery`, and returning `HomeView` with `version` from `package.json`. Imports `@/home/home.css`.

- [ ] **Step 1: Write the failing tests.** `loadDiscountRows.test.ts` with injected stubs: a live percent discount and a draft fixed discount become rows with the expected `rules`, `isActive`, `href`; a time discount labelled `Upcoming` gives `isActive: false` and the scheduled text; `getStatusLabel` is called with the timezone from `loadTimezone`; tier rows come before time rows; blank names fall back (Review Focus 1). `homeView.test.tsx`: renders the title "Discounts", the four stat values, both create-card buttons, the table card, the tip banner and the footer with the given version, in that order. `tests/app/home.test.ts` updated: `Home({ searchParams: Promise.resolve({}) })` for the two existing tests (the order test still expects `['ensure', 'config']`), plus: `searchParams` `{ tab: 'inactive' }` renders without throwing, and a thrown loader error propagates (the page does not hide real failures).
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home tests/app/home.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above; remove the page from the legacy lint list.
- [ ] **Step 4: Run the tests and the PR gates** (`npx vitest run`, `npx tsc --noEmit`, `npm run lint` 0 errors, `npx next build` if the project's environment allows it, reporting the result either way).
- [ ] **Step 5: Visual comparison with the design (throwaway harness, not committed).** In the scratchpad, write a small Node script that (a) bundles an entry rendering `HomeView` with fake rows (the design's six sample rows) through `react-dom/server` using `esbuild`, (b) compiles the page's CSS (`src/app/globals.css` plus `src/home/home.css`) with `postcss` and `@tailwindcss/postcss`, and (c) writes one static HTML file. Open it in the browser pane at desktop width, take a screenshot and compare it with `stitch-discounts-screen.jpg` region by region (header, number cards, create cards, table, tip, footer); repeat at 375px width. Record every difference and fix those that are not in the spec's "My calls". Delete the harness afterwards. Note that Inter and the images load from the harness folder.
- [ ] **Step 6: Commit** (bump version) `feat: the homepage is rebuilt from the Stitch Discounts design`; push and open PR 4 into the milestone with a "What is not verified" section: the real admin page on a dev store (the embedded admin cannot be driven by the agent; the owner opens it after the Vercel deploy and compares with the screenshot).

---

### Task 7: Final PR

- [ ] **Step 1:** After PRs 1-4 are merged into the milestone, check `git rev-list --left-right --count origin/dev...origin/milestone/homepage-redesign`; if `dev` moved, merge `origin/dev` into the milestone in a worktree (keep the higher version, keep both sides' added tests), run all gates, push that merge commit to the milestone, and say plainly that it is a branch update.
- [ ] **Step 2:** Open the PR `milestone/homepage-redesign` into `dev` (merge commit). Body: what changed, the verification numbers, what is not verified (live admin page, other browsers), rollout (owner merges, Vercel deploys `dev`, owner compares the live page with `stitch-discounts-screen.jpg`; nothing else deploys).
- [ ] **Step 3:** Update the project skill `building-multistore-shopify-apps` (guide/05 or a new short section) with the homepage structure and the "embedded admin cannot be driven, so check with a static render" finding, and the session log.

---

## Execution notes (2026-10-21)

What changed while the plan was executed natively, and why. The PRs are #92 (Tasks 1-2), #93 (Tasks 3-4), #94 (Task 5), #95 (Task 6), each into `milestone/homepage-redesign`; #93 to #95 are stacked on the one before so the version numbers (0.23.41 to 0.23.47) do not collide.

- **Signatures changed to satisfy the lint rules.** The rules forbid calling other module functions and reading enclosing variables, so every collaborator is passed in: `formatMoneyAmount({ amount, currencyCode })` replaces `createMoneyFormatter`; `describeTierRules`, `describeTimeSchedule`, `buildTierRow`, `buildTimeRow` take their formatters and title pickers as parameters (`formatDate` takes `{ value }`); `parseTableQuery` and `applyTableQuery` take `tools` (`TABLE_TOOLS`); `loadDiscountRows` takes `tools` (`ROW_TOOLS`). New helpers: `listTierSteps`, `pickRowTitle`, `pickRowSubtitle`, `formatNaiveDate`, `HiddenField`.
- **Design fidelity beats the plan where they differ.** No `shadow-xs`/`shadow-2xs` (the Stitch preview runs Tailwind v3, which ignores them, so the mockup shows none); the pagination line keeps both buttons (switched off) on a single page, as the design draws them; `leading-4`/`h-5`/`h-7` classes reproduce the line and icon box heights of the v3 mockup; rows are separated by a top border from the second row on, as in the design.
- **Font token.** `--font-home` is declared in `@theme inline`; as a plain `@theme` value it was resolved at the root, where next/font has not set `--font-inter`, and the page fell back to the system font. Found by the comparison, covered by a test.
- **Visual check.** A throwaway harness (esbuild + postcss + `@tailwindcss/postcss`, served on `127.0.0.1:4173`, kept outside the repository) renders the real components next to the Stitch HTML in two iframes and compares every element (position, size, font, colours, padding, radius, gap, shadow). Result for the whole page: no real differences; only the by-design ones (details menus, link tabs, SVG icons, no monospace line).
- **Not done here.** Task 7 (the final PR into `dev`) waits for #91 to #95 to be merged by the owner. The live check on the dev store and in the Shopify admin is the owner's after the dev deploy, because the embedded admin cannot be driven by the agent.
