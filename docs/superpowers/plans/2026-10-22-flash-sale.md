# Flash Sale and Widget Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tier discount run as a flash sale (start and end time, teaser, countdown, "Ended" state, High Demand tag) and align the storefront widget to the new Stitch design for every tier discount.

**Architecture:** A discount in the existing `tier_config` gains an optional `flash` object and a `highDemand` flag. The existing tier Function gets one small change: it reads an optional per-record config `{ discountId }`; with it, it applies only that discount; without it, it applies every live discount that has no `flash`. Each live flash discount gets its own Shopify automatic discount (native start and end) running the same Function. The product sync writes the flash window (Unix seconds) and `highDemand` to the product metafield; the widget draws one top bar whose state follows the flash phase and the reached tier, and hides itself at the end.

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4 (admin), Rust Shopify Function (api 2026-04), Liquid + plain JS + CSS (theme app extension), vitest 3, `node --test` (extension unit tests), cargo tests.

**Spec:** `docs/superpowers/specs/2026-10-22-flash-sale-design.md` (assets in `docs/superpowers/specs/assets/flash-sale/`). Read it first; it holds the owner's decisions, the bar copy table and the open points.

## Global Constraints

- One Function, one config. No import from `src/timeDiscounts/`, `extensions/time-based-discount/` or the time-based storefront files (copy the code instead; they will be deleted).
- Flash statuses: `Upcoming` (before the start), `Active` (inside the window), `Ended` (after it). A Draft discount never runs. The Shopify record exists only while the discount is Live and has `flash`.
- Times are shop-local naive strings (`2026-11-27T09:00`) in `tier_config`; UTC only at the Shopify API (`zonedTimeToUtc` in `src/lib/shop.ts`); Unix seconds in the product metafield.
- Unit word: "units" and "each" (not "tins"): `Tier 1 Active (8+ units)`. The Shopify record title is the discount's `title`, no prefix.
- Bar copy (exact): teaser `Flash sale starts in 02 : 10 : 00`; running below tier 1 `Flash sale ends in 04 : 18 : 49`; tier 1 reached `Tier 1 unlocked! Flash sale active` with `£1.63/ea` on the right and the timer chip; higher tier `Tier 2 active (£1.55/ea · Keep adding)` with the chip `14:32`. Hours appear only while one hour or more remains. No bar for a non-flash discount; after the end nothing renders.
- The checkbox "Show a teaser before the sale starts" is on by default; "Show the High Demand tag" is a manual checkbox (off by default). Trust badges are not built.
- The tier price maths in the Function and in `src/lib/tier-math.ts` does not change.
- Code guidelines (`docs/coding-guidelines.md`) for new TS/JS: 3+ letter noun names, verb function names, no outer-scope reads or calls (inject collaborators; compose in React components, the page default export and module-level objects like `TABLE_TOOLS` in `src/home/tableQuery.ts`), more than 2 parameters as one object, at most 2 branches per function. New files get lint errors.
- Everything the proxy guards works without a token on plain page loads; admin links use `next/link`, forms use server actions (see the homepage fix PR #97).
- Tests first; one `vitest` process at a time; `source ~/.nvm/nvm.sh && nvm use 22.23.3`; version bump (`package.json` and the first two version fields of `package-lock.json`) in every code commit; no AI attribution in commits; never commit to `main`; the owner merges and deploys (extension, Function).
- Never state an unverified Shopify behaviour as fact: test it on a dev store or label it unknown.
- Branches: milestone `milestone/flash-sale` from `dev`; one feature branch per PR into it; stacked PRs are merged with a merge commit; one final PR milestone into `dev`.
- Visual fidelity: compare the real widget with the Stitch HTML element by element (method in Task 9); the Stitch preview renders with Tailwind v3 (v4-only classes such as `shadow-xs` render nothing there; `text-xs` has a fixed 16px line height), so match what the board renders. The widget uses the theme's fonts and colours (owner note), with the design's layout, spacing, proportions and copy.

## Review Focus

Inputs the spec implies but the happy path does not cover; each has a test in the task named in brackets.

1. A window whose end is not after its start, or already past at save time; a local time inside a daylight-saving gap or overlap: the form refuses it or converts it deterministically, never saves a window Shopify rejects. [Tasks 1, 6]
2. A flash record that outlives its discount (discount deleted, set to Draft, flash switched off) or names an unknown id: the Function applies nothing for it, and the app deletes the record. [Tasks 3, 5, 6]
3. Re-running an ended sale (new dates), switching flash off while it runs, switching it on for a Live discount: the record is created, updated or deleted exactly once, and a Shopify refusal (limit, invalid window) leaves the stored discount unchanged and shows the message. [Tasks 5, 6]
4. A product that another active discount took after the flash discount was saved as Draft: going Live is refused with the existing "already belongs to another discount" message. [Task 6]
5. Widget phase edges: exactly at the start and at the end second, a shopper whose quantity crosses a tier while the countdown runs, a product with several own variants, and a page opened one second before the end. [Tasks 10, 11]

---

### Task 1: Flash data model, window checks and status (PR 1: `feat/flash-data-model`)

**Files:**
- Modify: `src/lib/config.ts` (the `Discount` type), `src/lib/metafieldNames.ts` (add `flashRecord: 'flash_record'`, key of the record's config, owner: discount)
- Create: `src/flash/schedule.ts`, `src/flash/status.ts`
- Test: `tests/flash/schedule.test.ts`, `tests/flash/status.test.ts`, extend `tests/lib/metafieldNames.test.ts` if it lists keys

**Interfaces:**
- Produces:
  - `export interface FlashSale { startsAt: string; endsAt: string; showTeaser: boolean; shopifyDiscountId?: string }` and on `Discount`: `flash?: FlashSale`, `highDemand?: boolean` (both optional, so every existing stored discount stays valid).
  - `export function describeScheduleProblem(options: { startsAt: string; endsAt: string; nowMs: number; toUtcMs: (naive: string) => number }): string | null` in `schedule.ts` (copy of the time-based `scheduleProblem`: both required, readable, end after start, end after `nowMs`; the message texts follow the time-based ones).
  - `export type FlashStatus = 'Upcoming' | 'Active' | 'Ended'` and `export function computeFlashStatus(options: { startsAtMs: number; endsAtMs: number; nowMs: number }): FlashStatus` in `status.ts` (`now < start` Upcoming; `now < end` Active; else Ended).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests.** `schedule.test.ts` (inject `toUtcMs = (naive) => Date.parse(naive + 'Z')`): empty start or end gives a "required" message; unreadable text gives a message; end equal to or before start; end before `nowMs`; a valid future window gives `null`; start in the past with end in the future is valid (a sale may start now). Review Focus 1: a naive time that `toUtcMs` cannot convert (returns `NaN`) is refused. `status.test.ts`: before, exactly at the start (Active), inside, exactly at the end (Ended), after.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/flash`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the types and both modules to the signatures above (pure, no outer reads).
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`.** Expected: PASS, no type errors.
- [ ] **Step 5: Commit** (bump version) `feat: flash sale data model, window checks and status`; create the milestone from `dev`, push the branch and open PR 1 into it.

---

### Task 2: Product sync carries the flash window and High Demand (PR 1)

**Files:**
- Modify: `src/lib/product-tiers.ts` (`DiscountMetafieldValue`, `buildProductMetafields`)
- Test: extend `tests/lib/product-tiers.test.ts`

**Interfaces:**
- Consumes: `Discount.flash`, `Discount.highDemand` (Task 1); `zonedTimeToUtc` is applied by the caller.
- Produces: `buildProductMetafields(discount, productId, limit, existingIds, flashWindow?)` — add an optional fifth parameter object `{ startsAtUnix: number; endsAtUnix: number } | null` that the caller computes (keeps the function pure); the metafield value gains `flash: { startsAtUnix, endsAtUnix, showTeaser } | null` and `highDemand: boolean`. For a discount without `flash` the value is exactly what it was, plus `flash: null` and `highDemand: false`. `syncDiscountMetafields(discount)` computes the window with the shop timezone (`getShopTimezone`, `zonedTimeToUtc`) when `discount.flash` exists.

- [ ] **Step 1: Write the failing tests:** a non-flash discount yields the old value plus `flash: null`, `highDemand: false`; a flash discount yields the Unix seconds and `showTeaser` it was given; `highDemand: true` is carried; the sibling lists and limits are unchanged; `syncDiscountMetafields` for a flash discount converts the shop-local times with the shop timezone (mock `getShopTimezone` to `Europe/London` and check a summer time is one hour earlier in UTC).
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/lib/product-tiers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the change.
- [ ] **Step 4: Run the tests, `tsc`, and the full suite once.** Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: write the flash window and the High Demand flag to the product metafield`; push (PR 1 now holds Tasks 1 and 2).

---

### Task 3: The Function selects the discounts a record applies (PR 2: `feat/flash-function-and-record`)

**Files:**
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql` (add `discount { discountClasses metafield(namespace: "$app:smooth_discount", key: "flash_record") { jsonValue } }`), `extensions/product-discount/src/main.rs` (a second custom scalar override for `Input.discount.metafield.jsonValue`), `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`
- Test: Rust unit tests in the same file, and `extensions/product-discount/tests/` fixtures if the helper tests use them (keep every existing test unchanged)

**Interfaces:**
- Produces (Rust): `DiscountConfig` gains `discount_id: String` (key `discountId`, default empty) and `flash: Option<FlashMarker>` (key `flash`, default `None`; `FlashMarker` is a struct with optional `starts_at` and `ends_at` strings, only its presence matters); `pub struct RecordConfig { discount_id: String }`; `pub fn select_discounts<'a>(discounts: &'a [DiscountConfig], record: Option<&RecordConfig>) -> Vec<&'a DiscountConfig>` returning, of the discounts with `status == "live"`: with a record, those whose `discount_id` equals the record's (none if no match); without a record, those with `flash.is_none()`. The run function calls it instead of `config.discounts.iter().filter(|d| d.status == "live")`; the rest of the maths is untouched.

- [ ] **Step 1: Write the failing Rust tests** for `select_discounts`: no record keeps live discounts without `flash` and drops live ones with `flash`; a record picks exactly its discount; a record naming a draft discount or an unknown id picks nothing (Review Focus 2); a record with no flash discounts present returns an empty list; two live discounts with the same product do not both come back for a record. Add one run-level test: the shared run applies a non-flash discount and ignores a flash one for the same cart; a flash-record run applies the flash discount only.
- [ ] **Step 2: Run them to confirm they fail.** Run: `cargo test` in `extensions/product-discount`. Expected: FAIL (function missing).
- [ ] **Step 3: Implement** the structs, `select_discounts` and the query and typegen changes; keep every existing test green unchanged.
- [ ] **Step 4: Run all Function tests** (`cargo test` and the extension's vitest if present). Expected: PASS, with the same number of old tests plus the new ones.
- [ ] **Step 5: Commit** (bump version) `feat: the tier Function applies only the discount a flash record names`; push and open PR 2 into the milestone, stacked on PR 1.

---

### Task 4: Shopify record for a flash sale (PR 2)

**Files:**
- Create: `src/flash/shopifyRecord.ts`
- Test: `tests/flash/shopifyRecord.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery` from `src/lib/shopify-client.ts` (injected as a parameter), `METAFIELD_KEYS.flashRecord`, `TIER_FUNCTION_HANDLE` from `src/lib/tierDiscount.ts` (value `'product-discount'`).
- Produces (copied from `src/timeDiscounts/shopifyRecord.ts`, adapted): `export function buildFlashRecordInput(options: { title: string; discountId: string; startsAtUtc: string; endsAtUtc: string }): { title; functionHandle; discountClasses: ['PRODUCT']; startsAt; endsAt; metafields: [{ namespace, key: 'flash_record', type: 'json', value: '{"discountId":"..."}' }] }`; `createFlashRecord`, `updateFlashRecord`, `deleteFlashRecord` taking `{ query: typeof shopifyQuery, ... }` as an option object and returning the Shopify discount id (create) or nothing; a "not found / does not exist" user error on delete is a successful no-op (as in the original); any other user error throws an `Error` whose message is Shopify's text (so the form can show a limit refusal).

- [ ] **Step 1: Write the failing tests** with a fake `query`: the create input has the handle `product-discount`, class `PRODUCT`, the UTC window, and the config metafield `{ "discountId": <id> }` (nothing else: no tier data); update sends only the fields present; delete treats "not found" as success and throws on other errors; a user error text such as the limit message is thrown unchanged (Review Focus 3).
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/flash/shopifyRecord.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** by copying the original and adapting the names and the input; guidelines: the query function is a parameter.
- [ ] **Step 4: Run the tests and `tsc`.** Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: create, update and delete the Shopify discount of a flash sale`; push (PR 2).

---

### Task 5: Reconcile the record with the discount (PR 2)

**Files:**
- Create: `src/flash/reconcileRecord.ts`
- Test: `tests/flash/reconcileRecord.test.ts`

**Interfaces:**
- Produces: `export function decideRecordAction(options: { status: 'draft' | 'live'; hasFlash: boolean; shopifyDiscountId: string | undefined }): 'create' | 'update' | 'delete' | 'none'` (Live and flash: `create` without an id, `update` with one; otherwise `delete` when an id exists, else `none`); `export async function reconcileFlashRecord(options: { discount: Discount; decideAction; createRecord; updateRecord; deleteRecord; toWindowUtc }): Promise<string | undefined>` returning the Shopify discount id to store (or `undefined` when none), calling only the injected functions; `toWindowUtc(discount.flash)` gives `{ startsAtUtc, endsAtUtc }`. If a Shopify call throws, nothing is stored by the caller (Task 6) and the error propagates.

- [ ] **Step 1: Write the failing tests** for `decideRecordAction` (all eight combinations) and for `reconcileFlashRecord` with fakes: create is called once with the right window and returns the id; update is called with an existing id; delete is called when the flash was switched off or the discount is Draft and the id is cleared; a Shopify refusal propagates and no id is returned (Review Focus 3).
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/flash/reconcileRecord.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (pure decision, injected calls, at most 2 branches per function).
- [ ] **Step 4: Run the PR gates** (full `npx vitest run`, `npx tsc --noEmit`, `npm run lint` 0 errors, `cargo test` for the Function, `npx next build`). Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: keep the flash sale's Shopify discount in step with the discount`; push and update PR 2.

---

### Task 6: Admin form: Flash sale section, High Demand, actions (PR 3: `feat/flash-admin`)

**Files:**
- Create: `src/flash/components/FlashSaleFields.tsx` (client; the switch, "Starts (<timezone>)" and "Ends (<timezone>)" `datetime-local` inputs with the time-based form's classes and messages, the teaser checkbox, shows the validation problem), `src/flash/formFields.ts` (`parseFlashFromForm`)
- Modify: `src/app/discounts/new/page.tsx` (add the section and the High Demand checkbox), `src/app/discounts/[discountId]/page.tsx` (a "Flash sale" section with its own Save button, a High Demand checkbox with its Save, the state `Upcoming`/`Active`/`Ended` next to the status), `src/actions/discountActions.ts` (`createDiscount`, `setDiscountStatus`, `deleteDiscount`, new `updateDiscountFlash`, `updateDiscountHighDemand`)
- Test: `tests/flash/formFields.test.ts`, `tests/flash/components/FlashSaleFields.test.tsx`, `tests/actions/discountActions.test.ts` (extend)

**Interfaces:**
- Produces: `export function parseFlashFromForm(options: { formData: FormData }): FlashSale | null` (`null` when the switch is off; reads `flashEnabled`, `flashStartsAt`, `flashEndsAt`, `flashShowTeaser`); `updateDiscountFlash(discountId, formData)` and `updateDiscountHighDemand(discountId, formData)` server actions; the actions validate with `describeScheduleProblem`, call `reconcileFlashRecord` after saving `tier_config` and store the returned `shopifyDiscountId`; if the reconcile throws, the previous config is restored and the message is shown; going Live re-checks product availability across the active discounts (Review Focus 4); the saved metafields are synced with `syncDiscountMetafields` (Task 2) for a Live discount; switching flash off or setting Draft or deleting removes the record.

- [ ] **Step 1: Write the failing tests:** `parseFlashFromForm` (off gives `null`; on reads both times and the teaser flag, default on when the field is absent on create); the component (the fields are hidden until the switch is on, the shop timezone appears in both labels, the problem text shows with `role="alert"`, the teaser checkbox is checked by default); the actions with mocks: creating a flash discount saves `flash` and creates no record while Draft; going Live creates the record and stores its id; a past end time is refused before anything is saved; a record refusal restores the old config and surfaces the message; switching flash off deletes the record and clears `flash`; deleting the discount deletes the record; `updateDiscountHighDemand` sets the flag and re-syncs a Live discount.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/flash tests/actions`. Expected: FAIL.
- [ ] **Step 3: Implement** the component (copy the time-based `TitleScheduleFields` markup for the two inputs), the parser, the actions and the two pages.
- [ ] **Step 4: Run the PR gates** (as Task 5). Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: flash sale section and High Demand checkbox in the tier discount form`; push and open PR 3 into the milestone, stacked on PR 2.

---

### Task 7: Homepage and list show the flash state (PR 3)

**Files:**
- Modify: `src/home/discountRows.ts` (`buildTierRow` accepts `flashStatus: FlashStatus | null` and `rules`), `src/home/loadDiscountRows.ts` (compute the flash status with the shop timezone and the injected clock), `src/app/page.tsx` if the injection list grows
- Test: extend `tests/home/discountRows.test.ts`, `tests/home/loadDiscountRows.test.ts`, `tests/app/home.test.ts`

**Interfaces:**
- Produces: a tier row of a flash discount: `isActive` is true only for `Active` (and Live), `Upcoming` and `Ended` rows are inactive; the rules text shows the window (`Flash sale: Nov 27, 2026 - Nov 30, 2026 (Upcoming)` using `describeTimeSchedule`-style text copied into `src/flash/` if needed, never imported from `src/timeDiscounts/`); a non-flash row is unchanged.

- [ ] **Step 1: Write the failing tests** for the three states and a Draft flash discount (inactive); a non-flash row exactly as before.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/home tests/app`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the PR gates.** Expected: PASS.
- [ ] **Step 5: Commit** (bump version) `feat: the homepage table shows Upcoming, Active and Ended flash sales`; push (PR 3).

---

### Task 8: Dev-store checks of the Function and the record (verification, no product code)

**Files:** none in the repo; a throwaway script in the session scratchpad.

**Goal:** turn the open points of the spec into facts before the widget work. Use `shopify app dev --config shopify.app.dev.toml --store demo-nlmhyat3.myshopify.com --theme <dev theme id> --no-update --skip-dependencies-installation` (the first run compiles the Rust Function for several minutes; the owner types the storefront password in the terminal tab) and an Admin API script (client credentials from `shopify app env show`, never printed) that backs up and restores the test data.

- [ ] **Step 1:** create two flash-style records by API on existing published products: one window around now (`startsAt` a minute ago, `endsAt` ten minutes ahead), one regular live tier discount, on products that are in no other discount.
- [ ] **Step 2:** in the storefront, build carts and read the cart's discount lines (`/cart.js` line `discounts_allocations` or checkout totals): (a) a cart with only the flash product; (b) only the regular tier product; (c) one of each (mixed cart): record whether both discounts apply; (d) after the end time passes, reload the same cart and record whether the flash discount still applies.
- [ ] **Step 3:** record the result of (c) and (d) and, by creating records until Shopify refuses, whether a scheduled (not yet started) record counts toward the 25 limit and the exact refusal message; restore the data, stop the preview with `shopify app dev clean`, and delete every record the script made.
- [ ] **Step 4:** write the outcomes into the PR 2 description under "Verified on a dev store". If (c) shows only one discount applying, add `combinesWith { productDiscounts: true }` to the shared record input (`buildTierDiscountInput`) and to `buildFlashRecordInput` with a test, and name that change in the PR as a change to existing behaviour; if (d) shows the discount still applying after the end, stop and report to the owner before continuing.

---

### Task 9: Widget alignment: comparison harness, then card, price row and tier chips (PR 4: `feat/widget-alignment`)

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid`, `assets/tier-pricing.js`, `assets/tier-pricing.css`, `locales/en.default.schema.json` if copy needs a setting
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`, `tests/storefront/time-discount-scripts.test.ts` (the existing jsdom widget tests)

**Interfaces:**
- Produces (pure, exported for tests like the existing ones): `buildTierChips(options: { tiers, basePrice, anchorTotals, currentQty, unitCount })` returning an array `{ qty, totalLabel, isReached, isCurrent }` where the chip text is `qty × total` (`8 × £13.00`: the tier's exact total at that quantity, including an anchor price as the admin's "Total at min qty"), plus the dashed current-quantity chip between tiers; `formatTierPill(options)` for "Tier 1 Active (8+ Tins)". Existing pure functions keep their behaviour unless a test below says otherwise.

- [ ] **Step 1: Build the comparison harness (throwaway, scratchpad).** A small local server on `127.0.0.1:4173` that serves the Stitch HTML (`stitch-widget-board.html`, saved in `docs/superpowers/specs/assets/flash-sale/`) with `Access-Control-Allow-Origin: *`; a script run in the real product page (through `shopify theme dev` and `shopify app dev` as in Task 8) that fetches that HTML into an iframe `srcdoc` (same origin as the page, so both DOMs are readable), sets the iframe width to the widget's width, and compares the real widget element and the board's matching variant card element by element (position, size, font size and weight, colours, padding, radius, gap), ignoring explained differences (theme fonts and colours, icon glyphs versus SVG). Use it after every step below.
- [ ] **Step 2: Write the failing tests:** `buildTierChips` for percent and fixed tiers, anchor totals, the current quantity between tiers (dashed chip), and a quantity above the top tier; the Liquid-free pieces of the price row (struck original price shown only when a tier applies, the High Demand tag shown only when the attribute `data-high-demand="true"` is present, the tier pill text).
- [ ] **Step 3: Implement** the markup, script and CSS for: the card shell, the price row (price, `each`/`/ tin`, struck original, High Demand tag, tier pill), the promo line, and the tier chips.
- [ ] **Step 4: Compare** with the harness at desktop width and 375px; fix every real difference; record the remaining explained differences in the PR.
- [ ] **Step 5: Run the gates** (extension tests, `npx vitest run`, theme check with only the two known offenses, `next build`) and commit (bump version) `feat: widget price row and tier chips follow the new design`; create the branch from the milestone (after PR 3 is merged there, or stacked on PR 3), push and open PR 4.

---

### Task 10: Widget alignment: progress rail, status line and the mix & match drawer (PR 4)

**Files:** as Task 9.

**Interfaces:**
- Produces: the status line (`You have <b>5 units</b>` left, `Add 3 for £1.63/ea` or the unlocked text right) and the pin rail (pins at the tier quantities with the current-quantity pin, filled up to it, labels `1`, `8`, `16`) in the design's proportions; the drawer trigger `Mix & match flavours` with the open/collapsed arrow; the rows in the design's style (thumbnail, name, per-tin price, `+ Add` link) keeping today's behaviour (name, price, in-cart count, Add link to the product, no staged selection). Existing pure functions (`computeWidgetViewModel`, `computeProgressDot`, `buildMixMatchRows`) keep their outputs; only their painting changes, and a test must pin each unchanged output.

- [ ] **Step 1: Write the failing tests** for the status line texts in each state, the pin positions (reuse `computeProgressDot` results), and the drawer trigger state; keep the existing widget tests unchanged where the behaviour is unchanged.
- [ ] **Step 2: Run them to confirm they fail.** Run: `node --test extensions/product-tier-pricing-tests/*.test.js` and `npx vitest run tests/storefront`. Expected: FAIL.
- [ ] **Step 3: Implement** markup, script and CSS.
- [ ] **Step 4: Compare** with the harness (desktop and 375px) and fix every real difference.
- [ ] **Step 5: Run the gates; commit** (bump version) `feat: widget status line, pin rail and mix & match drawer follow the new design`; push (PR 4).

---

### Task 11: Flash bar, teaser, countdown and the end (PR 5: `feat/flash-widget`)

**Files:**
- Create: `extensions/product-tier-pricing/assets/flash-sale.js` (every global prefixed `flash`; copy the countdown and boundary handling of `time-based-discount.js`)
- Modify: `blocks/tier-pricing.liquid` (add `data-flash` with `{ startsAtUnix, endsAtUnix, showTeaser }` and `data-high-demand`; render nothing in Liquid when `'now' | date: '%s'` is past `endsAtUnix`; the bar element), `assets/tier-pricing.js`, `assets/tier-pricing.css`
- Test: `extensions/product-tier-pricing-tests/flash-sale.test.js`, `tests/storefront/flash-sale-widget.test.ts` (jsdom)

**Interfaces:**
- Produces (pure): `flashPhase({ nowSeconds, startsAtUnix, endsAtUnix }): 'before' | 'running' | 'ended'` (start second is running, end second is ended); `formatFlashCountdown({ secondsLeft }): string` (`04 : 18 : 49` with hours when 3600 or more, `14:32` for the chip when under an hour, never negative); `buildFlashBar({ phase, showTeaser, reachedTier, tierCount, unitPriceLabel, countdownText, chipText }): { variant: 'hidden' | 'teaser' | 'ends' | 'tier-first' | 'tier-higher', text: string, aside: string, chip: string }` producing exactly the copy in Global Constraints; the script ticks every second, re-renders when the phase changes (as the time-based boundary code does), and removes the widget at the end without a reload.

- [ ] **Step 1: Write the failing tests:** every row of the copy table (teaser, ends-in, tier 1 with chip and unit price, tier 2 with chip), `showTeaser: false` before the start gives `hidden` and no widget card, the exact start and end seconds, the hours rule, a discount with one tier reads `Tier 1` only, the ended phase removes the widget element, a quantity crossing a tier while running changes the variant, and a non-flash discount renders no bar (Review Focus 5).
- [ ] **Step 2: Run them to confirm they fail.** Run: `node --test extensions/product-tier-pricing-tests/*.test.js` and `npx vitest run tests/storefront`. Expected: FAIL.
- [ ] **Step 3: Implement** the pure functions, the Liquid data attributes and ended check, the script integration (teaser state shows no tier prices; running state draws the bar; the bar variant follows the reached tier) and the CSS for the three bar variants from the design (dark with pulsing bolt, green banner, dark with star and chip).
- [ ] **Step 4: Compare** each state with the harness (Task 9 method): run it with temporary test data on an existing published product (backup and restore), setting windows so each state is visible (a window starting in 3 minutes for the teaser, one running, one ending in 2 minutes to watch the end); fix every real difference; verify the widget disappears without reload; clean up with `shopify app dev clean`.
- [ ] **Step 5: Run the gates; commit** (bump version) `feat: flash sale bar, teaser and countdown in the widget`; push and open PR 5 into the milestone.

---

### Task 12: Final PR

- [ ] **Step 1:** after PRs 1 to 5 are merged into `milestone/flash-sale`, check `git rev-list --left-right --count origin/dev...origin/milestone/flash-sale`; if `dev` moved, merge `origin/dev` into the milestone in a worktree (keep the higher version, keep both sides' tests), run all gates on the merged result, push that merge commit to the milestone, and say plainly that it is a branch update.
- [ ] **Step 2:** open the PR milestone into `dev` (merge commit): what changed, the verification numbers, "Verified on a dev store" from Task 8, the comparison results from Tasks 9 to 11, what is not verified (the real admin page, other themes), the rollout (the owner deploys the Function and the extension with `shopify app deploy --config shopify.app.dev.toml`, then checks a flash sale end to end on the dev store; nothing is deployed by the agent).
- [ ] **Step 3:** note the lessons in the session log; do not touch the skill unless the owner asks, and then only in general terms.
