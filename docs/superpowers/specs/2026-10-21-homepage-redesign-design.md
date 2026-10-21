# Homepage redesign: the "Discounts" page from the Stitch design

Date: 2026-10-21. Status: draft for the owner's approval. Nothing is built.

## Intent and why

The app's homepage (`src/app/page.tsx`) is two plain lists: tier discounts with an "Add discount" button and time-based discounts with an "Add time-based discount" button. The owner has a finished design for this page and wants the homepage rebuilt to match it **exactly**, in layout, styling and copy. The design puts both kinds of discount in one table, adds a row of four number cards, two illustrated "create" cards and a tip banner, and gives the page a header and footer.

The design is the Stitch screen "Discounts - Bulk & Timed Discounts" (project 6370617737489629500, screen 816c6095bfdc45ff8abbcc47ef29b70b). Copies are in `docs/superpowers/specs/assets/homepage-redesign/`:

- `stitch-discounts-screen.jpg`: the screenshot (2560 x 3288), the reference for how it must look.
- `stitch-discounts-screen.html`: Stitch's generated HTML (Tailwind from a CDN, Material Symbols icons, Inter font, a colour palette in its Tailwind config). It is a reference, not code to ship: it contains sample data and uses CDN scripts.
- `tier-illustration.jpg`, `time-illustration.jpg` (512 x 286): the two images on the create cards. They are used as they are.

## Goals

1. The homepage looks like the design: same layout, spacing, colours, type, icons, copy and states, at desktop width and in the narrower layouts the design's classes imply (cards stack, the "Schedule / Rules" column hides on small screens).
2. One table, "All discounts", lists every tier discount and every time-based discount together, with real data.
3. Every control of that table works: the All / Active / Inactive tabs (with counts), the search box, the Filters button, the Sort button and the pagination.
4. The four number cards, the "Last 30d" button and the info icons are drawn exactly as designed and show the design's sample values as placeholders.
5. Existing behaviour keeps working: the homepage first makes sure the store's tier checkout discount exists and still renders if that fails; discounts are read from the same stored configuration as today.

## Non-goals

- Real numbers in the four cards (visitors, bundle orders, AOV, added revenue). The app will collect that data later; a separate milestone.
- A working "Last 30d" date-range control.
- Targets for the links that have no destination yet (see Decisions): they stay as links that go nowhere.
- A "Settings > Visual badges" page (it does not exist).
- Changing any other page (new/edit discount pages, time-discount pages) or the storefront widget.
- Changing how discounts are stored, or adding a "created" date to them.

## Anti-goals (a failure even if it technically works)

- A homepage that is "inspired by" the design but differs in spacing, colour, type or copy.
- The sample table rows from the design (Salmon Oil, Black Friday, ...) appearing on a real merchant's page. The table shows the merchant's own discounts only.
- A table whose Filters, Sort, search, tabs or pagination only look right but do nothing.
- Visible regressions on the other pages (the new page styles must not leak into them).

## Decisions by the owner

- Recreate the design exactly. (Owner, in chat.)
- The four number cards use the design's own sample values (Visitors 16, Bundle orders 0, AOV 0.00, Added revenue 0.00) as placeholders until data collection exists. The owner rejected showing dashes instead.
- The table and **all** its controls (tabs, search, Filters, Sort, pagination) work in this milestone.
- Table behaviour (my proposal, confirmed by the owner: "guesses are fine, keep them"):
  - Tabs All / Active / Inactive with counts. Active = a tier discount whose status is `live`, or a time-based discount that is currently active. Inactive = a tier discount whose status is `draft`, or a time-based discount that is upcoming or expired. This matches the design's sample rows (a scheduled and an ended discount both show "Inactive").
  - Search matches the discount title.
  - Filters opens a small panel to narrow by type (tier-based or time-based).
  - Sort offers title A-Z, title Z-A, type and status. Discounts have no created date, so there is no "newest first".
  - Pagination: 10 per page with Previous and Next and the "Showing 1-6 of 6 discounts" line.
- Create cards: "Create tier discount" opens the existing new-discount page (`/discounts/new`); "Create tier time discount" opens the existing new time-based discount page (`/time-discounts/new`). The two illustrations are used as they are. (Owner, in chat.)
- The "More information" links on both create cards, the "Settings > Visual badges" link in the tip banner, and the Privacy, Support and Shopify App Store links in the footer stay as dead links for now. (Owner, in chat.)

## Constraints

- Next.js 16.2.10, React 19.2.4, Tailwind 4 (`@import "tailwindcss"` in `src/app/globals.css`). The homepage is a server component and renders per request (`export const dynamic = "force-dynamic"` in the root layout).
- `ensureTierDiscountSafely()` must still be the first call on the page (a test, `tests/app/home.test.ts`, checks the order).
- The app runs embedded in the Shopify admin (iframe, App Bridge script in the root layout).
- Code guidelines in `docs/coding-guidelines.md` apply to all new TS/JS: 3+ letter noun variable names, verb function names, no outer-scope reads, more than 2 parameters as one object, simple parameters, injected function calls, at most 2 branches per function. New files get lint errors, not warnings.
- Tests first for new logic; one `vitest` process at a time; version bump in `package.json` and `package-lock.json` in every code commit.
- No new external runtime dependencies beyond what the design needs, and no CDN scripts (the design's Tailwind CDN and `tailwind.config` must not ship).

## Data the table is built from

- Tier discounts: `getConfig()` returns `discounts[]` with `discountId`, `name`, `title`, `status` (`draft` | `live`), `pricingMode` (`percent` | `fixed`), `members`, `tiers`. Each row opens `/discounts/<discountId>`.
- Time-based discounts: `getTimeDiscountsConfig()` returns `discounts[]` with `discountId`, `title`, `kind` (`perProduct` | `group`), `startsAt`, `endsAt`, `items`. Status comes from `computeTimeDiscountStatusLabel(startsAt, endsAt, shopTimezone)`, which returns Upcoming, Active or Expired. Each row opens `/time-discounts/<discountId>`.
- The "Schedule / Rules" column: for a tier discount the tier rules as text (for example "3+ units (10% off), 5+ units (20% off)", or a fixed price for fixed-price mode); for a time-based discount its schedule text. Exact wording per case is the builder's call within the design's style.
- The small monospace line under each title in the design is an internal code (for example `tier_salmon_oil_v2`). The app has no such code; see "My calls".

## My calls (not discussed with the owner; check these)

1. **Page-only styling.** The design's palette (cream background `#fbf9f4`, green primary `#173028`/`#2d463e`, terracotta secondary `#8b4f2f`, outline `#c2c8c4`, and so on) is applied to the homepage only, through its own scoped styles or tokens, so the other pages keep their current look. The design is light only; the homepage stays in its light palette also when the browser prefers dark mode (the current app switches to dark).
2. **Icons as inline SVG, not the Material Symbols font.** This avoids an external font request and a flash of icon names; the shapes must match the design's icons (calendar, info, layers, schedule, filter list, swap vertical, search, chevrons, arrow forward, lightbulb).
3. **Inter font.** The design uses Inter. Load it with `next/font` (self-hosted by Next) for the homepage.
4. **The version label.** The root layout prints `v<version>` at the top right of every page. The design has "Smooth Discounts v0.4.1" in its footer. The footer shows the app's real `package.json` version; the layout's top-right label stays for the other pages but is not shown on the homepage (it would repeat the footer).
5. **Header name and mark.** The header shows the design's centred green "ST" mark and "Smooth Discounts" as drawn, although the app's page metadata title says "Sparkly Tails — Product Discounts". Naming is the owner's to change later.
6. **The monospace code line under each title.** For a tier discount, show the discount's `title` (the customer-facing copy) if it is not blank, otherwise nothing; for a time-based discount, nothing. No invented codes. If the owner wants an identifier shown, that is a follow-up.
7. **Type icon.** A tier discount shows the "stacked lines" icon in the design's primary colour, a time-based discount the clock icon in the secondary colour, as in the design.
8. **Breadcrumb.** The design shows a bare "/" above the title (an empty breadcrumb). It is reproduced as drawn.
9. **Empty state.** With no discounts the table shows one centred line ("No discounts yet.") inside the card; the design has no empty state, so this is added in the same style. A filter or search with no result shows "No discounts match" with a "Clear filters" action.
10. **Controls' state in the address.** Tab, search, filter, sort and page are kept in the page address (query string) so a reload or a shared link keeps them. Filtering and sorting happen on the server component's data (the lists are small); no client-side data fetching.
11. **Image sizes.** The illustrations are only 512 x 286 and will look soft on high-density screens; they are used as they are, as decided. Copy them to `public/` and serve them with `next/image` or a plain `img` with explicit width and height to avoid layout shift.
12. **Row click.** The whole row is a link target (keyboard focusable, with a visible focus ring), not only the title.
13. **What the controls act on.** The row title of a tier discount is its `name` (as today's homepage shows it); search matches the row title. Tab, type filter and search combine (all must match). The tab counts always count all discounts, as in the design ("All 6, Active 4, Inactive 2"), and do not change with search or filter. Changing the tab, search, filter or sort goes back to page 1.
14. **Sort order details.** "Type" puts tier-based discounts before time-based ones; "Status" puts Active before Inactive; ties are broken by title A-Z. The default order is the order the discounts are stored in today (tier discounts, then time-based), so the page looks like the design before anyone touches Sort.
15. **Row link, not a click handler.** Each row is a real link to the edit page so it works with the keyboard, middle-click and the embedded admin navigation.

## Left to the builder

- How the page is split into components (guideline 2: one purpose each), for example header, stat cards, create cards, discounts table, filter panel, pagination, tip banner, footer. Pure functions for status mapping, filtering, sorting, searching and paging, each tested.
- How the Filters panel opens (popover or inline panel) and its exact look, as long as it matches the design's button and the page style. Whether Sort is a menu or a select.
- Responsive details beyond what the design's Tailwind classes show.
- Accessibility: table semantics, the tabs as a tab list or links with `aria-current`, labels for the search input and icon-only controls, focus rings, contrast of the design's small text (the design uses 11-12px text; keep it but check contrast against its own palette and report anything below WCAG AA).
- How to test the page: unit tests for the pure functions, component tests with the existing jsdom setup, and `tests/app/home.test.ts` updated (the first-call order test must stay).
- A live check: run the app locally against the dev app and a dev store, compare with the screenshot at desktop and phone width, and test each control with the store's real discounts.

## Definition of done

- The homepage, next to `stitch-discounts-screen.jpg`, differs only in the real data (rows) and in anything listed under "My calls".
- Every control works with real data on a dev store, verified live, and by tests.
- All gates pass: extension tests, `npx vitest run`, `tsc --noEmit`, `npm run lint` with 0 errors, and no change to the storefront theme extension.
- Delivered as small PRs into a milestone branch, then one PR into `dev`. Nothing is deployed from the PRs.
