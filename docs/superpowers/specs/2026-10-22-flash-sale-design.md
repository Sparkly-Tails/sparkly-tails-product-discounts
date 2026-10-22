# Flash sale for tier discounts, and the storefront widget aligned to the new design

Date: 2026-10-22. Status: draft for the owner's approval. Nothing is built.

## Intent and why

A tier discount can be run as a **flash sale**: a sale window with a start and an end time. While the window is open the shopper sees a countdown and the tier prices apply; before it opens the widget shows a teaser; after it ends the discount stops applying and the widget is gone. The merchant sets it up in the tier discount form of the app admin. The time-based discount, which already does something similar per product, will be removed soon, so this feature **copies** its code instead of depending on it.

The same piece of work **aligns the storefront widget to the new Stitch design** ("Fluid Progress Widget - Refined Tier Boxes & Mix-and-Match", project 6370617737489629500, screen 83cc24fdb643434683fc0db5ae7f8d93). Copies are in `docs/superpowers/specs/assets/flash-sale/`:

- `stitch-widget-board.jpg`: the screenshot (2560 x 3088), the reference for how it must look.
- `stitch-widget-board.html`: Stitch's generated HTML (Tailwind from a CDN, Material Symbols icons, Newsreader and Plus Jakarta Sans fonts, a colour palette in its config). A reference, not code to ship; the board also holds explanatory cards that are not part of the widget.

## Goals

1. A tier discount can be marked as a flash sale in the admin form (create and edit), with a start and an end time in the shop's timezone, a checkbox "show a teaser before the sale starts", and a checkbox for the "High Demand" tag.
2. The window is enforced where the price is calculated (checkout), by Shopify itself, so a cart opened earlier cannot keep the discount after the end.
3. The widget follows the design for **every** tier discount (flash or not): tier chips with totals, the price row with the tag and the tier pill, the pin rail, the drawer. For a flash sale the top bar shows the countdown and the states below.
4. An ended flash sale stays in the app's discount list with the state "Ended"; its dates can be changed to run it again.
5. The homepage table (merged redesign) shows the flash states.
6. The widget looks identical to the design when rendered and compared on localhost (method below).

## Non-goals

- Flash sales for a single tier of a discount: the window is for the whole tier discount.
- An extra percentage on top of the tiers (the design's banner text "Flash extra 5% active" is dropped).
- A "trust badges" area (the design shows an empty one) and an "Actions & Stepper" segment of its own: not built.
- Making the "High Demand" tag data driven: it is a manual checkbox.
- Touching or keeping the time-based discount: it stays as it is until it is removed in a separate change; no new code may import from it.
- Changing the existing tier Function or the shared tier discount's price calculation: they stay as they are. (The only change to existing checkout behaviour is the combining setting named under "Risks".)

## Anti-goals (a failure even if it technically works)

- A flash sale whose discount still applies at checkout after the end time, or whose widget still shows after it.
- A widget that differs visibly from the design (spacing, colours, type, copy), or that breaks existing non-flash tier discounts.
- Code that imports from `src/timeDiscounts/`, `extensions/time-based-discount/` or the time-based storefront files (they will be deleted).
- A discount whose data is stored in both configs at once, or a product that is in two active discounts.

## Decisions by the owner

- Flash sale = a sale window for the whole tier discount (all its tiers).
- Runs only between start and end; after the end it disappears from the products, variants and collections it was active on.
- The three placements of the design are **states of one bar** that changes as the shopper adds products.
- Before the start the widget shows a **teaser** "Flash sale starts in 02 : 10 : 00" with the countdown running, controlled by a checkbox in the form.
- An ended flash sale **stays in the list with the state "Ended"**. The other states are "Upcoming" and "Active".
- The form includes a start and an end time field.
- The "High Demand" tag is built and **switched on by hand** with a checkbox in the discount form.
- Copy the time-based discount's code as much as possible; do not start from scratch.
- Feature branch, atomic commits, tests on localhost, result identical to the design.
- The bar copy was proposed and approved ("go for it"): see "The bar states".

## The bar states (copy approved)

One element at the top of the card. It changes with the flash phase and with the combined quantity (units in the cart plus the page quantity, plus selected products as today):

| Phase and quantity | Look (design) | Text |
|---|---|---|
| Before the start, teaser on | dark bar, bolt icon | "Flash sale starts in 02 : 10 : 00" (counting down); prices are the normal ones |
| Before the start, teaser off | no bar, no widget card | nothing |
| Running, below the first tier | dark bar, pulsing bolt (variant A) | "Flash sale ends in 04 : 18 : 49" |
| Running, first tier reached | green bar (variant B) | "Tier 1 unlocked! Flash sale active" on the left, the unit price "£1.63/ea" on the right, and the timer chip |
| Running, a higher tier reached | dark bar with a star (variant C) | "Tier 2 active (£1.55/ea · Keep adding)" and the timer chip "14:32" |
| After the end | nothing | the whole widget is gone, without a reload (checked every second) |

The timer shows hours only while one hour or more remains (`HH : MM : SS`, else `MM : SS`). The number of the tier in the text is the position of the reached tier ("Tier 1", "Tier 2", ...). For a non-flash discount there is no bar.

## Constraints

- Next.js 16, React 19, Tailwind 4 (admin); Liquid, plain JavaScript and CSS (theme app extension, one global script scope shared by blocks, theme-check limits: the known two offenses only); Rust Shopify Function (api 2026-04).
- Code guidelines in `docs/coding-guidelines.md` for all new TS/JS; tests first; one `vitest` process at a time; version bump in every code commit; no AI attribution in commits; never commit to `main`; the owner merges and deploys.
- Times are entered and shown in the **shop's timezone** as naive local strings (`2026-11-27T09:00`) and converted to UTC only at the Shopify API boundary (the existing `zonedTimeToUtc` in `src/lib/shop.ts` is shared, not time-based, and may be used).
- Everything the proxy guards must work without a token on plain page loads (see the homepage fix): new admin links use `next/link`, forms use server actions as the tier form does.
- Pixel-identical means: when the real widget is rendered with the real stylesheet next to the Stitch HTML and compared element by element (position, size, font, colours, padding, radius, gap), no real difference remains, except where the spec says so. The Stitch preview renders with Tailwind v3: v4-only classes such as `shadow-xs` render nothing there, and `text-xs` has a fixed 16px line height there; match what the board actually renders.

## How the data flows

- **Two configs, so the existing tier Function stays untouched (owner's decision):** regular tier discounts stay in the shop-level `tier_config` read by the existing Function, exactly as today. **Flash discounts live in their own shop-level config, `flash_config`** (same shape as a tier discount plus `flash: { startsAt, endsAt, showTeaser }` and the shared `highDemand`; times as shop-local naive strings; this mirrors how the time-based discounts have their own `time_config`). The admin reads and writes both and merges them for lists and forms. Turning the flash switch on or off in the form **moves** the discount between the two configs (one save, with the Shopify record created or deleted to match).
- **One product, one active discount (owner's rule, already the rule today):** the form does not let a product or variant be added to a discount if another **active** (Live) discount already holds it. The check (`isProductAvailable`) must look at **both** configs, so a product cannot be in a regular and a flash discount at once.
- **Checkout, a second Function:** a new Function extension `flash-discount` is a **copy of the existing tier Function** (`product-discount`) whose input query reads `flash_config` (and the record's own `{ discountId }` config) instead of `tier_config`, and which applies only the discount named by the record it runs for. Each flash discount gets its **own** Shopify automatic discount running this Function (created, updated and deleted like the time-based one: `discountAutomaticAppCreate`/`Update`/`Delete`, native `startsAt`/`endsAt` in UTC, class `PRODUCT`). Shopify turns it on and off by its window. The existing shared record and Function are not changed.
- **When the Shopify record exists:** only while the discount is Live and its flash switch is on. Going Live (or switching the flash on) creates it; going Draft, switching the flash off or deleting the discount deletes it; editing updates it. An ended sale keeps its record until the owner changes it (Shopify no longer applies it after the end).
- **Storefront:** the per-product metafield `tier_discount` (written by the product sync, which now takes the discount for a product from either config) gains `flash: { startsAtUnix, endsAtUnix, showTeaser }` and `highDemand`. Unix seconds let Liquid compare with the current time (`'now' | date: '%s'`) and let the script compare with `Date.now()`. The widget renders nothing in Liquid when the end has passed, and its script hides it at the end without a reload.
- **Status of a flash discount** (admin list, edit page, homepage table): `Upcoming` before the start, `Active` inside the window, `Ended` after it. A Draft discount does not run whatever the window says; Live plus window decides. The homepage table counts Upcoming and Ended as Inactive, as for the time-based ones.

## Where the time-based code is copied from (map)

Copy and rename (no import from the originals); keep tests with them:

| Time-based original | Flash copy (suggested path) |
|---|---|
| `src/timeDiscounts/shopifyRecord.ts` (create/update/delete the Shopify record) | `src/flash/shopifyRecord.ts`, with `FUNCTION_HANDLE = 'product-discount'` and the `{ discountId }` config |
| `src/timeDiscounts/items.ts` `scheduleProblem` (end after start, not in the past) | `src/flash/schedule.ts` |
| `src/timeDiscounts/config.ts` `computeTimeDiscountStatusLabel` | `src/flash/status.ts` returning `Upcoming`, `Active` or `Ended` |
| `src/timeDiscounts/metafieldSync.ts` (product metafields) | folded into the existing tier product sync (`src/lib/product-tiers.ts`) as the new fields |
| `src/timeDiscounts/components/TitleScheduleFields.tsx` and `useTitleSchedule.ts` (date-time inputs, shop timezone label, validation message) | `src/flash/components/FlashSaleFields.tsx` |
| `extensions/product-tier-pricing/assets/time-based-discount.js` (countdown, boundaries) | `extensions/product-tier-pricing/assets/flash-sale.js` (prefix every global with `flash`; shared global scope) |
| `extensions/product-discount/` (the tier Function, 1,900 lines of price maths and tests) | `extensions/flash-discount/` (a copy that reads `flash_config` and applies the one discount its record names); the time-based Function is not copied |
| `src/lib/config.ts` (`getConfig`, `saveConfig`, `isProductAvailable`) | `src/flash/config.ts` (`getFlashConfig`, `saveFlashConfig`) and a merged read for the admin; `isProductAvailable` checks both configs |

## My calls (not discussed with the owner; check these)

1. **Form placement.** A "Flash sale" section in the tier discount form, on the create page and on the edit page (own Save button there, like Title, Products and Tiers), with: a switch "Run as a flash sale"; "Starts (<timezone>)" and "Ends (<timezone>)" as `datetime-local` fields (the same inputs the time-based form uses; they accept typing and a picker); the checkbox "Show a teaser before the sale starts" (on by default); and, outside the section, a checkbox "Show the High Demand tag". Turning the switch off removes the flash settings and the extra Shopify record.
2. **Editing a running sale** is allowed (dates, tiers, products): saving updates the Shopify record's window and the product metafields. **Ending early** is done by switching the flash off or by setting the discount to Draft (the end time itself must always be in the future when saved). An ended sale is re-run by changing its dates (the end must be in the future again).
3. **Validation:** both times required when the switch is on; the end after the start; the end in the future when saving; clear messages in the form's style.
4. **Non-flash widgets:** no top bar; everything else as in the design. The "High Demand" tag shows only when its checkbox is on.
5. **Chips with totals.** The design's tier chips show the **total** for that quantity ("8 × £13.00"); they use the tier's exact total (including an anchor price) at that quantity, as the admin's "Total at min qty" does; the dashed chip shows the current quantity's total. This replaces today's unit-price pills.
6. **Responsive.** The board benchmarks 460 to 520px; the widget is one column and fills its container; below that it keeps the same structure (chips wrap, the drawer stacks), checked at 375px.
7. **Fonts and icons.** The design uses Newsreader and Plus Jakarta Sans and Material Symbols; the widget uses the theme's fonts and colours as decided earlier for the redesigned widget (owner note: theme fonts and colours, not the design's), and inline SVG icons. Only layout, spacing, proportions and copy follow the design exactly.
8. **Tier numbers in the copy** ("Tier 1", "Tier 2") follow the order of the discount's tiers; a discount with a single tier reads "Tier 1" only.
9. **The mix & match list** keeps today's behaviour (name, price, in-cart count, Add link to the product) in the design's row style (thumbnail, name, per-tin price, "+ Add").
10. **Collections:** tier discounts cover products and variants today; this design adds no collection support. "Disappears from products, variants and collections" is read as everything the discount covers.

## Risks to check early

- **Carts with a flash product and a regular tier product.** The one-product-one-discount rule keeps one product out of two discounts, but a cart can still hold a product of a flash discount and a product of a regular tier discount. They are two separate Shopify discounts, and Shopify's docs say discounts combine only as the rules set on each discount allow (the shared tier record sets none, so by default they do not combine). Both the shared record and every flash record therefore need `combinesWith { productDiscounts: true }`. Setting it on the shared record is a change to existing behaviour (it only affects carts that also qualify for another discount) and is named in the PR. To be checked on a dev store with a mixed cart before building further.
- **Shopify allows at most 25 active discount Functions per store** (Shopify's Discount Function API page; the changelog of 21 Nov 2024 raised the automatic app discount limit from 5 to 25). The shared tier discount uses one and every active flash record uses one more, together with every other app discount on the store, so a store has room for fewer than 25 flash sales at a time. Draft flash sales have no record and do not count. The form must show Shopify's refusal as a clear message when the limit is reached. Whether a scheduled (not yet started) record counts as active is not stated in the docs and is to be tested.
- **Copy drift.** The new Function is a copy of the tier Function; a later fix to the price maths has to be made in both until the time-based and tier code are brought together. The copy keeps the same tests, and the document of the change names the original.
- **Page caching** is not a risk here: the existing time-based mechanism (Liquid check at render plus the script hiding the widget at the end) already works and is copied (owner's confirmation); the checkout stays authoritative around the boundary.

## Left to the builder

- Splitting the work into PRs (suggested: 1 data model and sync, 2 the Function and the Shopify record, 3 the admin form and the homepage states, 4 the widget alignment for all tier discounts, 5 the flash bar, teaser and countdown), the exact names, and the component split (guideline 2).
- The exact Liquid markup and CSS for the aligned widget, from the Stitch HTML, inside the theme-check limits.
- How to test: pure-function unit tests (status, countdown format, bar state, window maths, Function filter), jsdom tests for the widget script, component tests for the form, Rust tests for the Function, and the localhost comparison.
- Localhost comparison method: render the widget with `shopify theme dev` + `shopify app dev` on a dev store (the owner types the storefront password in the browser pane) with temporary test data on an existing published product (backup and restore, as before), and compare the real page with the Stitch HTML element by element; use a static render for quick loops. Clean up with `shopify app dev clean`.

## Definition of done

- A flash sale can be created, edited, switched off and re-run in the admin, shows the right state in the list and on the homepage table, and creates, updates and deletes its Shopify record.
- At checkout the discount applies only inside the window (verified on a dev store with a real cart, including a mixed cart), and not after the end.
- The widget matches the design in every state of the table above, for flash and non-flash discounts, at desktop width and 375px, with no real difference in the element comparison.
- All gates pass (vitest, tsc, lint 0 errors, extension tests, Rust Function tests, theme check with only the two known offenses, `next build`).
- Delivered as atomic commits on a feature branch and small PRs into a new milestone, then one PR into `dev`; nothing is deployed by the agent (the owner deploys the extension and the Function).
