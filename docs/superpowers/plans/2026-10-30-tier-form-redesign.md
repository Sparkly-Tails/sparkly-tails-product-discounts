# Tier Discount Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Create and Edit pages of a tier discount as the Stitch two-column form with a sticky live widget preview and one footer Save.

**Architecture:** New components under `src/form/` (cards, preview, footer) are built and compared with the design one PR at a time without touching the live pages; two PRs at the end switch the Create page and then the Edit page to them and delete the old forms. One new server action `saveDiscount` replaces the per-section actions; its logic lives in injected, lint-clean functions in `src/form/`. The preview renders the storefront widget's own pure functions and stylesheet.

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4 (admin), vitest 3 with jsdom, the widget script `extensions/product-tier-pricing/assets/tier-pricing.js` (CommonJS pure functions) and `tier-pricing.css`.

**Spec:** `docs/superpowers/specs/2026-10-29-tier-form-redesign-design.md` (approved 2026-10-30; screenshot in `docs/superpowers/specs/assets/tier-form/`). Read it first: it holds the owner's decisions and my calls.

## Global Constraints

- Every PR is at most **200 changed lines** excluding tests, lock files and deleted lines; if a task would exceed it, split it (each task below says where). Branch per PR from `dev` (a stack only when a task needs the previous one), PR into `dev`; the owner merges and deploys.
- Tests first; one `vitest` process at a time; `source ~/.nvm/nvm.sh && nvm use 22.23.3`; version bump (`package.json` and the first two version fields of `package-lock.json`) in every code commit; no AI attribution in commits or PR text; never commit to `main`; never deploy.
- New TS/TSX follow `docs/coding-guidelines.md` (errors in lint): 3+ letter noun names, verb function names, no outer-scope reads or calls (inject; compose in React components and in `*_TOOLS` objects as in `src/home/rowTools.ts`), more than 2 parameters as one object, at most 2 branches per function. Existing files named in `eslint.guidelines-legacy.mjs` only warn.
- The Design card saves nothing and nothing reads it. The Title field is gone; a new discount stores `title` equal to its internal name. The footer: Create = Discard, Go live, Save; Edit = Delete (far left, red, confirmation), Discard, Go live / Take offline, Save.
- Colours and type come from the design: new tokens `--color-form-*` in `src/form/form.css` (imported by `src/app/globals.css`, like `home.css`), Inter through `src/home/homeFont.ts`, inline SVG icons (no icon font).
- Comparison method (every UI task, "Compare" step): bundle the new component with esbuild into a throwaway page in the session scratchpad with stubs for `next/*` and server actions; serve it on `127.0.0.1` next to the Stitch HTML (Tailwind from a CDN, which is v3: `text-xs` has a 16px line height there) in same-origin iframes; compare each element's box and computed style (font size and weight, colours, padding, radius, gap, shadow) with a tolerance of 1px; fix every real difference. The Stitch card is 1280px wide (a 1232px container); compare at that width and at 375px.
- Never state an unverified Shopify behaviour as fact; the save order (Shopify first, config after) is the one of `src/actions/discountActions.ts` (`syncRecordOf` before `saveConfig`).

## Review Focus

Inputs the spec implies but the happy path does not cover; each has a test in the task named in brackets.

1. Shopify refuses the save (limit of 25, bad window) or the end time has passed: nothing is saved, the message shows, the form keeps what was typed. [Task 8]
2. Discard on the Edit page restores flash window, teaser, High Demand, products and tiers, not only the name; on Create it leaves without saving. [Tasks 7, 10]
3. Products with different prices: the Fixed price toggle is unavailable (as today) and a mode switch never keeps an invalid mode; anchor prices only when prices are equal. [Task 4]
4. Preview inputs: no product (message), one product, several products with different prices, a variant selected, incomplete tier rows, a flash window in the past or not yet started. [Tasks 6, 7]
5. Go live from the footer with unsaved changes saves them first; a live discount whose sale ended is refused with the existing message. [Task 8, 10]

---

### Task 1: Tokens, page shell and footer bar (PR 1, components only)

**Files:**
- Create: `src/form/form.css` (tokens from the Stitch Tailwind config: surface #f9f9f9, on-surface #1a1c1c, outline-variant #c4c7c7, surface-container* greys, secondary #0055c7, error #ba1a1a, primary-container #303030, tertiary-fixed #9cf5c2, radii and spacing), `src/form/components/FormShell.tsx`, `src/form/components/FormFooter.tsx`
- Modify: `src/app/globals.css` (one `@import "../form/form.css";`)
- Test: `tests/form/components/formShell.test.tsx`

**Interfaces:**
- Produces: `FormShell({ breadcrumbLabel: string; heading: string; badge: string; children: ReactNode /* form column */; preview: ReactNode; footer: ReactNode })` (two columns at `lg`: form `col-span-7`, preview `col-span-5` with `sticky top-20 self-start`, footer bar below); `FormFooter({ statusText: string; children: ReactNode })` (white bar, 16px padding, status text with a check icon on the left, `children` on the right).

- [ ] **Step 1: Write the failing tests** (jsdom): the shell renders the breadcrumb ("Discounts / <label>"), the heading with the badge, both columns and the footer; the preview column has the `sticky` class; the footer shows its status text and its children.
- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/form`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the two components and the tokens; `FormShell` is a plain composition (no logic).
- [ ] **Step 4: Compare** the shell against the design (heading, breadcrumb, column widths 58/42, gap 24px, footer bar) with the harness; fix differences.
- [ ] **Step 5: Gates** (`npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npx next build`); commit (bump version) `feat: tier form shell with a sticky preview column and a footer bar`; push; open the PR.

### Task 2: Details card and Flash sale card with High Demand (PR 2, components only)

**Files:**
- Create: `src/form/components/Card.tsx` (white card, 24px padding, 1px outline border at 20%, title row), `src/form/components/DetailsCard.tsx`, `src/form/components/FlashCard.tsx`
- Test: `tests/form/components/detailsCard.test.tsx`, `tests/form/components/flashCard.test.tsx`

**Interfaces:**
- Consumes: `describeScheduleProblem`, `SCHEDULE_CHECKS` from `@/flash/schedule`.
- Produces: `DetailsCard({ initialName: string })` with one input named `name` (label "Internal name", the "Merchant admin only" aside and the help text of the design); `FlashCard({ shopTimezone: string; nowLocal: string; initial: { enabled: boolean; startsAt: string; endsAt: string; showTeaser: boolean; highDemand: boolean } })` with the same field names the actions parse today (`flashEnabled`, `flashStartsAt`, `flashEndsAt`, `flashShowTeaser`, `highDemand`), the bolt icon, the "Time-sensitive" chip, calendar icons in the inputs, and the High Demand checkbox ("Show the High Demand tag") directly below the teaser checkbox, usable while the switch is off.

- [ ] **Step 1: Write the failing tests**: names and labels of the fields; date fields hidden until the switch is on and `required` while it is on; the window problem shows as `role="alert"` and blocks the end input (`validity.customError`), as `FlashSaleFields` does; High Demand is rendered in both states of the switch, below the teaser box, with `name="highDemand"`; initial values fill the fields.
- [ ] **Step 2: Run to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the cards. Copy the window logic of `src/flash/components/FlashSaleFields.tsx` (it is deleted in Task 11); the date inputs stay `datetime-local`.
- [ ] **Step 4: Compare** both cards with the design; **Step 5: gates and commit** `feat: details and flash sale cards of the tier form`.

### Task 3: Products card (PR 3a: data, PR 3b: component)

**Files:**
- Modify: `src/lib/products.ts` (`ProductSearchResult` gets `imageUrl: string | null`; `ProductVariantOption` is unchanged; empty `query` allowed for Browse via a new `listProducts({ limit })`), `src/actions/memberPickerActions.ts` (`listProductsAction`)
- Create: `src/form/components/ProductsCard.tsx`, `src/form/useMemberSelection.ts`
- Test: `tests/lib/products.test.ts` (extend), `tests/form/components/productsCard.test.tsx`

**Interfaces:**
- Produces: `SelectedMember` gains `imageUrl: string | null`; `ProductsCard({ initialMembers: SelectedMember[]; excludeDiscountId?: string; onMembersChange: (members: SelectedMember[]) => void })` renders the search box with the clear button, the Browse button, the "N products selected" chip, one row per product (image, title, "N variants selected • price", trash button) and keeps the hidden `member-{i}-productId` / `member-{i}-variantId` inputs `parseMembersFromForm` reads. Rows group the variants of one product. Browse lists the shop's first products in the same dropdown (my call; the design does not say what Browse opens). `useMemberSelection` holds the add/remove/duplicate logic moved out of `MemberPicker` (the old component keeps working until Task 11).

- [ ] **Step 1 (PR 3a):** tests for `listProducts` and the image field in `searchProducts`; implement; commit `feat: product search returns the image and can list products`.
- [ ] **Step 2 (PR 3b):** failing component tests: adding, removing, duplicate refusal, the chip text ("1 product selected" / "2 products selected"), grouped variant rows, hidden inputs in order, Browse fills the dropdown (actions mocked), the stock badge is not rendered. Implement; **Compare**; gates; commit `feat: products card of the tier form`.

### Task 4: Tiers card (PR 4)

**Files:**
- Create: `src/form/components/TiersCard.tsx`, `src/form/tierRows.ts` (pure helpers), `src/form/useTierRows.ts`
- Test: `tests/form/tierRows.test.ts`, `tests/form/components/tiersCard.test.tsx`

**Interfaces:**
- Produces: `describeTierPrice({ basePrice: number; percentOff: number; anchorPrice: number | null; minQty: number }): { eachLabel: string; offLabel: string }` (the `$25.20 ea` / `10% off` of the design; the unit price from `src/lib/tier-math.ts`); `TiersCard({ allowPriceBasedModes: boolean; basePrice: number | null; initial: { mode: 'percent' | 'fixed'; percentTiers; fixedTiers }; onTiersChange: (tiers: PreviewTier[]) => void })` with the segmented control "Percentage off / Fixed price" (radio `pricingMode`), the table (minimum quantity with "units", discount rate with `%` and the price lines, anchor price with `$`, Remove) and "Add tier"; field names stay `tier-{i}-minQty`, `tier-{i}-percentOff`, `tier-{i}-anchorPrice`, `tier-{i}-fixedPrice`. `PreviewTier = { minQty: number; percentOff?: number; fixedPrice?: number; anchorPrice?: number }` (complete rows only, sorted).

- [ ] **Step 1: Failing tests**: `describeTierPrice` (10% of 28.00 is `$25.20 ea`, `10% off`; with an anchor price the unit price is the anchor total over the minimum quantity); the card: rows add and remove (the last row cannot be removed), Fixed price unavailable with `allowPriceBasedModes` false and a switch away from an invalid mode (Review Focus 3), incomplete rows are not reported, the field names above.
- [ ] **Step 2 to 5:** run to fail; implement; **Compare**; gates; commit `feat: tiers card of the tier form`. If over 200 lines, split `tierRows.ts` and its tests into its own PR first.

### Task 5: Design card, controls only (PR 5)

**Files:**
- Create: `src/form/components/DesignCard.tsx`
- Test: `tests/form/components/designCard.test.tsx`

**Interfaces:**
- Produces: `DesignCard()` with no props and no form field names: the collapsible header (palette icon, "Design", chevron), nine colour swatches with one selected (ring), the secondary background swatches with the hex field (`#F5EFE1`) and the round corners range (0 to 24, step 2) with its "12 px" value. Local state only; it renders no `name` attribute, so nothing is submitted.

- [ ] **Step 1: Failing tests**: selecting a swatch moves the ring and the check; typing a hex updates the swatch row and the label; the slider updates the "N px" value; no element of the card has a `name` attribute; the header collapses and expands the content.
- [ ] **Step 2 to 5:** fail; implement; **Compare**; gates; commit `feat: design card of the tier form (controls only)`.

### Task 6: Preview data and the widget's functions in the admin (PR 6a, PR 6b)

**Files:**
- Create: `src/lib/zonedTime.ts` (move `zonedTimeToUtc` from `src/lib/shop.ts`, re-exported there so imports keep working: the preview runs in the browser and `shop.ts` imports a server module), `src/form/preview/widgetFunctions.ts` (typed access to the widget script), `src/form/preview/buildPreviewModel.ts`
- Modify: `tsconfig.json` (`allowJs` for the one file or a `.d.ts` for it; the builder picks the smaller change)
- Test: `tests/lib/zonedTime.test.ts`, `tests/form/preview/buildPreviewModel.test.ts`

**Interfaces:**
- Produces: `buildPreviewModel({ products: { title: string; price: number; imageUrl: string | null }[]; selectedIndex: number; tiers: PreviewTier[]; flash: { startsAt: string; endsAt: string; showTeaser: boolean } | null; highDemand: boolean; quantity: number; timeZone: string; nowSeconds: number; tools: PreviewTools }): PreviewModel`, where `PreviewModel` is the `computeWidgetViewModel` result plus `{ isEmpty: boolean; products: ... }`; `tools` carries the widget's `computeWidgetViewModel`, `withUnitAnchor`, `buildMixMatchRows`, `formatMoney` and `zonedTimeToUtc` (guideline 7). Empty products or no complete tier gives `isEmpty: true`.

- [ ] **Step 1 (PR 6a): failing tests** for `zonedTimeToUtc` (moved, behaviour unchanged: a London summer time is one hour ahead) and for `buildPreviewModel`: empty products; one product and two percent tiers (chips `1 × $28.00`, `3 × ...`); anchor tiers; a flash window in the future shows the teaser bar and no chips; a running window shows the bar by reached tier; an ended window gives the plain price; different prices use the selected product's price (Review Focus 4). Implement; commit `feat: preview model built from the form values`.
- [ ] **Step 2 (PR 6b):** `src/form/preview/WidgetPreview.tsx` renders the widget markup of `blocks/tier-pricing.liquid` in React (flash bar, price row, tag, promo line, chips, rail, drawer) using the widget stylesheet (`@import` of `tier-pricing.css` through a plain CSS import), the "Product previewing" dropdown, the "Live storefront view" chip, the touch note, and the message "Add a product to see the preview" when `isEmpty`; the chips set the simulated quantity (local state) as the widget's chips set the page quantity. Failing tests: the printed texts equal those the widget script paints for the same input (render the Liquid-equivalent markup in jsdom once with the script, once with the component, compare the text of each element); the empty message; the dropdown lists the products; a chip click changes the status line. **Compare** with the design's preview column; gates; commit `feat: live widget preview of the tier form`.

### Task 7: Form state, the Create form and Discard (PR 7)

**Files:**
- Create: `src/form/components/TierDiscountForm.tsx` (client; composes the shell, the cards, the preview and the footer; holds the form values), `src/form/formValues.ts` (types and `isFormDirty`), `src/form/components/DiscardButton.tsx`
- Test: `tests/form/formValues.test.ts`, `tests/form/components/tierDiscountForm.test.tsx`

**Interfaces:**
- Produces: `TierDiscountForm({ mode: 'create' | 'edit'; initial: FormValues; shopTimezone: string; nowLocal: string; discountId?: string; status: 'draft' | 'live'; actions: { save: (formData: FormData) => Promise<SaveResult>; goLive...; remove... } })` where `FormValues = { name; members; pricingMode; tiers; flash; highDemand }` (all plain values); `isFormDirty({ initial, current }): boolean`; the footer status text shows "Unsaved changes on this discount tier" only when dirty. Discard on Create navigates to `/` (a `next/link`), on Edit it resets every card to `initial`.

- [ ] **Step 1: Failing tests**: dirty detection per card (name, a product, a tier, the flash window, High Demand); the status text switches; Discard on Edit restores every value (Review Focus 2); the preview receives the form's current products, tiers and flash (a typed name changes nothing in the preview).
- [ ] **Step 2 to 5:** fail; implement; **Compare** the whole page at 1280px and 375px (single column, preview after the form, not sticky); gates; commit `feat: tier form with preview, dirty state and Discard`. Split `formValues.ts` into its own PR if over 200 lines.

### Task 8: The one save action (PR 8a pure, PR 8b flow)

**Files:**
- Create: `src/form/parseDiscountForm.ts`, `src/form/saveDiscountFlow.ts`, `src/actions/saveDiscount.ts` (`'use server'`, thin)
- Test: `tests/form/parseDiscountForm.test.ts`, `tests/form/saveDiscountFlow.test.ts`, `tests/actions/saveDiscount.test.ts`

**Interfaces:**
- Produces: `parseDiscountForm({ formData }): { values: FormValues } | { error: string }` (reuses the field names above; refuses no products, no complete tier, a flash switch on with a missing or bad window, as `createDiscount` does); `saveDiscountFlow({ discountId?: string; values: FormValues; nowLocal: string; tools: SaveTools }): Promise<SaveResult>` where `SaveTools` injects `loadConfig`, `saveConfig`, `assertAvailable`, `assertPricing`, `syncRecord` (`syncDiscountRecord`), `syncMetafields`, `clearMetafields` and `newDiscountId`; `SaveResult = { ok: true; discountId: string } | { ok: false; error: string }`. Order: validate everything, then `syncRecord` (Shopify), then `saveConfig`, then the metafields; a new discount is created as a draft with `title` equal to `name`; an existing discount keeps its stored `title`, `status` and Shopify id.

- [ ] **Step 1 (PR 8a): failing tests** for `parseDiscountForm`: valid create, valid edit, each refusal message, tiers sorted, percent and fixed modes, flash off removes `flash`. Implement; commit.
- [ ] **Step 2 (PR 8b): failing tests** for the flow: create saves a draft with `title` = name and creates no record; edit of a live flash discount updates the record then the config then the metafields; a refused record changes nothing and returns the message (Review Focus 1); products already in another discount are refused; a fixed mode with differently priced products is refused; switching flash off deletes the record. Implement with the existing helpers (`syncRecordOf` logic from `discountActions.ts` moved into injectable form); the server action wires the real tools. Commit `feat: one save action for the whole tier discount`.

### Task 9: Create page on the new form (PR 9)

**Files:**
- Modify: `src/app/discounts/new/page.tsx` (render `TierDiscountForm` in create mode, with the shop timezone), delete `src/app/discounts/new/NewDiscountForm.tsx`
- Create: `src/form/components/GoLiveButton.tsx` if needed
- Test: `tests/app/discounts/newDiscountPage.test.tsx` (replaces `newDiscountForm.test.tsx`)

**Interfaces:**
- Consumes: Task 7's form and Task 8's action; "Go live" on Create saves, then sets the status live in one request (the action takes `goLive: boolean`; the flow runs `syncRecord` with status `live` and refuses an ended window, Review Focus 5).

- [ ] **Step 1: Failing tests**: the page renders the form with Save and Go live and no Delete; Save posts to `saveDiscount` and redirects to the Edit page; an error result shows in the footer area without clearing the form.
- [ ] **Step 2 to 5:** fail; implement; run the whole page in the harness; gates; commit `feat: the Create page uses the new tier form`.

### Task 10: Edit page on the new form (PR 10)

**Files:**
- Modify: `src/app/discounts/[discountId]/page.tsx` (load the discount, build `FormValues`, render the form in edit mode), `src/form/components/TierDiscountForm.tsx` (footer: Delete, Discard, Go live / Take offline, Save)
- Create: `src/form/loadFormValues.ts` (`buildFormValues({ discount, memberInfo }): FormValues`, pure)
- Test: `tests/form/loadFormValues.test.ts`, `tests/app/discounts/discountPage.test.tsx` (rewritten)

**Interfaces:**
- Produces: the Edit footer buttons use `setDiscountStatus` and `deleteDiscount` (unchanged actions; Delete through `ConfirmForm`), "Go live / Take offline" first saves unsaved changes, then changes the status (Review Focus 5); the flash state text (`Flash sale: Active`) moves next to the heading badge; the "Resulting prices" tables are dropped (the tiers card shows each price).

- [ ] **Step 1: Failing tests**: `buildFormValues` for percent and fixed discounts, with and without flash and High Demand and with variants; the page shows the saved values, the status badge (`Draft` / `Live`) and the flash state; the footer shows the four buttons in order and the label follows the status; Delete asks for confirmation; Discard restores the saved values.
- [ ] **Step 2 to 5:** fail; implement; harness check of the Edit page; gates; commit `feat: the Edit page uses the new tier form`.

### Task 11: Remove the old form code (PR 11)

**Files:**
- Delete: `src/components/MemberPicker.tsx`, `PricingModeTierFields.tsx`, `TierFields.tsx`, `FixedPriceTierFields.tsx` (only when nothing else imports them: the time-based discount form may use `MemberPicker`; check with `grep` first and keep what is still used), `src/flash/components/FlashSaleFields.tsx`, their tests, and the per-section actions in `src/actions/discountActions.ts` no page posts to any more (`createDiscount`, `updateDiscountMembers`, `updateDiscountTiers`, `updateDiscountTitle`, `updateDiscountFlash`, `updateDiscountHighDemand`)
- Test: the remaining suites must still pass

- [ ] **Step 1:** list the importers of each file; delete only unused ones and the tests of what was deleted. **Step 2:** `npx vitest run`, `tsc`, `npm run lint`, `next build`. **Step 3:** commit `refactor: remove the old tier form components and per-section actions`. (Deleted lines do not count toward the 200.)

### Task 12: Narrow screens and the final comparison (PR 12)

**Files:**
- Modify: whichever `src/form/components/*` styles the comparison shows
- Test: extend the component tests where behaviour changes

- [ ] **Step 1:** run the full-page comparison with the Stitch screen at 1280px and 375px for Create, Edit (draft and live with a flash sale) and an empty form; list the differences. **Step 2:** fix each real difference in the smallest PR possible; record the explained ones (Inter loaded from the build, icons as inline SVG, the preview's stock badge) in the PR text. **Step 3:** open the PR; write the final report (what matches, what differs, what was not verified: the real admin page behind the login).
