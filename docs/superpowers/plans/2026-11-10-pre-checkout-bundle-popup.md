# Pre-checkout bundle pop-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer presses Checkout with a bundle in the cart that has not reached its first tier, show a pop-up with one box per such bundle where they can add the missing items, then carry on to checkout.

**Architecture:** Server and form side: three new discount values (customer title, pop-up frequency, and the storefront index carrying `discountId`, `title`, `popupFrequency`, `style`). Storefront side: a new app embed "Bundle pop-up" with a core script (`bundle-popup.js`: stops and resumes the Checkout press, reads the cart, decides which bundles are due) and a UI component (`bundle-popup-ui.js`: dialog, boxes, adding), reusing the shared `currency` component and the widget's `tierMath.js`, `copy.js` and `flash.js`. Same core + components pattern as the card script (#190).

**Tech Stack:** Next.js / TypeScript (form, server), plain ES modules built by esbuild (`scripts/build-extension.mjs`, 10,000 byte limit per script), Liquid, vitest (jsdom for storefront tests), `shopify theme check`.

**Spec:** `docs/superpowers/specs/2026-11-10-pre-checkout-bundle-popup-design.md` (PR #191).

## Global Constraints

- Run everything after `source ~/.nvm/nvm.sh && nvm use 22.23.1`. A new worktree needs `ln -s ../tf-shell/node_modules node_modules` (not `../../../node_modules`).
- Never deploy. Commits and PR descriptions carry **no AI attribution** (no Co-Authored-By, no "Generated with"). Bump `package.json` and `package-lock.json` (2 places) by one patch in every code commit: base version + 1 (check the base at PR time; #190 is 0.23.159). Check the PR state before every push; the owner merges in order.
- The owner's code rules for every function written: variable names are nouns of 3+ letters; function names are verbs; no outside variables (what a function needs, including `fetch`, the clock, storage, the DOM, and other functions, comes in as a parameter, with `tools` for called functions); more than 2 parameters go in one object; parameters are plain values or one flat object; at most 2 branches per function (`if`, `else if`, ternary, control-flow `&&`/`||`, `case`, loop condition). Do not refactor untouched code.
- Frequency values are `'session'` and `'checkout'`; absent means `'session'`. The wait of one Checkout press has a budget of **2000 ms** in total; nothing is fetched before the press.
- Colours and radius as the widget: `moss_color` `#434625`, `cream_color` `#f3ecd9`, `sun_color` `#ffdc4c`; a colour must be a whole `#RRGGBB` or `#RRGGBBAA`; radius a whole number from 0 to 24.
- Copy, verbatim: heading "Complete your bundle" (one box) / "Complete your bundles" (more); fallback box heading "Your bundle"; badge "Tier 1 at {minQty} items" (fixed) / "Unlock {percent}% off at {minQty} units" (percent); incentive fixed "Currently {units} units selected • Add {missing} more to unlock {price}/ea" + " (Save {amount} on these items!)"; incentive percent "{units} of {minQty} items selected • Add {missing} more to unlock {percent}% off the whole bundle"; "⚡ Quick auto-fill: Add {missing} more items"; button "Add {missing} & unlock tier"; contracted "View & mix eligible products ({count} available)" and "⚡ Quick-add {missing} to unlock {percent}% OFF" / "⚡ Quick-add {missing} to unlock {price}/ea"; "Continue to checkout"; "Tier unlocked"; "We couldn't add that. Try again."; flash bar "⚡ TIER 1 FLASH SALE ENDS IN".

## Branches and PRs

- **Branch A `feat/popup-data-and-form`** from `origin/dev` (Tasks 1-3): server and form. Independent of #190.
- **Branch B `feat/bundle-popup`** from `feat/card-prices-currency` (Tasks 4-10): the storefront. Shares files with #190 (`scripts/extensionFiles.mjs`, `tests/helpers/builtWidget.ts`, `tests/scripts/extensionContract.test.ts`). PR base is `feat/card-prices-currency` while #190 is open; retarget to `dev` after the owner merges it.
- Both must be deployed for the pop-up to work for real; each is testable alone.

## Review Focus

The spec implies these inputs; each gets a test in the task named.

1. A stale index (saved before this change: no `discountId`, `title`, `popupFrequency` or `style`): box heading "Your bundle", frequency `session`, key by first member's product id, look from the embed settings (Tasks 4, 6, 8).
2. A member that lists specific variants: only those variants' cart lines count and only those variants are offered (Tasks 4, 5).
3. Checkout pressed again while the first press is being worked out, or after Continue: never a second pop-up, never a loop (Task 7).
4. A flash sale that ended between page load and the press: no box (Task 4).
5. A cart in a currency other than the shop's with an unreadable rate or sample: no pop-up, checkout goes ahead (Task 7).

---

## Task 1: popupFrequency and title through the form values

Branch A. **Files:** modify `src/lib/config.ts` (`Discount.popupFrequency?: 'session' | 'checkout'`), `src/form/formValues.ts` (`FormValues.title`, `FormValues.popupFrequency`, both in `buildComparable`), `src/form/emptyValues.ts`, `src/form/loadFormValues.ts`, `src/form/parseDiscountForm.ts`, `src/form/parseTools.ts`, `src/form/saveSteps.ts`. Tests: `tests/form/parseDiscountForm.test.ts`, `saveSteps.test.ts`, `loadFormValues.test.ts`, `formValues.test.ts`, `emptyValues` via formValues.

**Interfaces — produces:**
- `readTitle({ formData }): string` (trimmed, `''` when absent) and `readPopupFrequency({ formData }): 'session' | 'checkout'` in `parseDiscountForm.ts`, both added to `ParseTools`; `ParsedDiscount` gains `title: string` and `popupFrequency`.
- `FormValues` gains `title: string` and `popupFrequency: 'session' | 'checkout'`.
- `pickSavedTitle({ title, existingTitle }): string` in `saveSteps.ts`: `title` when not empty, else `existingTitle`.

- [ ] **Step 1: failing tests** (names and assertions):
  - `parseDiscountForm › reads the title, trimmed`: form `title="  Tins mix  "` → `values.title === 'Tins mix'`; absent → `''`.
  - `› reads popupFrequency`: `'checkout'` → `'checkout'`; `'session'`, absent and `'weekly'` → `'session'`.
  - `saveSteps › a new discount takes the title of the form`: `buildNewDiscount` with `title: 'Tins mix'`, `name: 'BFCM'` → `discount.title === 'Tins mix'`; with `title: ''` → `''`.
  - `› an existing discount keeps its title when the form has none`: `existing.title = 'Old'`, `values.title = ''` → `'Old'`; with `'New'` → `'New'`.
  - `› the fields of the form include popupFrequency`: `buildDiscountFields` returns `popupFrequency: 'checkout'` for `'checkout'` and `popupFrequency: 'session'` for `'session'` (always written).
  - `loadFormValues › buildFormValues`: `discount.title = 'Tins'`, no `popupFrequency` → `values.title === 'Tins'`, `values.popupFrequency === 'session'`.
  - `formValues › isFormDirty`: changing only `title`, or only `popupFrequency`, makes the form dirty.
- [ ] **Step 2: run** `npx vitest run tests/form` — expect the new tests to fail (missing functions/fields).
- [ ] **Step 3: implement** the signatures above; `buildNewDiscount` and `mergeDiscount` use `values.title` / `pickSavedTitle`; `buildDiscountFields` adds `popupFrequency`.
- [ ] **Step 4: run** `npx vitest run tests/form && npx tsc --noEmit` — all pass.
- [ ] **Step 5: commit** `feat: carry the customer title and the pop-up frequency through the discount form values`.

## Task 2: the Title and pop-up fields on the Details card

Branch A. **Files:** modify `src/form/components/DetailsCard.tsx`, `src/form/components/TierDiscountForm.tsx`; tests `tests/form/components/detailsCard.test.tsx` (create if absent, in the style of the neighbouring component tests), `tierDiscountForm.test.tsx`.

**Interfaces — consumes:** `FormValues.title`, `FormValues.popupFrequency` (Task 1). **Produces:** `DetailsCard` props `{ initialName, onNameChange, initialTitle, onTitleChange, initialPopupFrequency, onPopupFrequencyChange }`.

- [ ] **Step 1: failing tests:**
  - `DetailsCard › shows a Title input named "title"` labelled "Title" with the hint "Shown to customers as the heading of the checkout pop-up", holding `initialTitle`.
  - `› shows a select named "popupFrequency"` labelled "Show the pop-up" with options "Once per session" (`session`) and "At every checkout press" (`checkout`), preselected from `initialPopupFrequency`.
  - `› typing in Title calls onTitleChange; choosing an option calls onPopupFrequencyChange`.
  - `TierDiscountForm › the Title follows the name until it is edited` on a new discount (initial title empty): typing a name sets the Title input to the same text; after typing in Title, further name changes leave it alone. On an existing discount whose title differs from its name, the name never changes the title.
  - `› submits title and popupFrequency` (the form data holds both fields).
- [ ] **Step 2: run** `npx vitest run tests/form/components` — new tests fail.
- [ ] **Step 3: implement** in the same state-in-component style as the name field; the follow-the-name rule lives in `TierDiscountForm` as a pure function `pickTitleAfterNameChange({ name, title, isTitleEdited }): string`.
- [ ] **Step 4: run** `npx vitest run tests/form tests/app && npx tsc --noEmit`.
- [ ] **Step 5: commit** `feat: bring the customer title back to the form and add the pop-up frequency`.

## Task 3: the card index carries what the pop-up needs

Branch A. **Files:** modify `src/lib/cardIndex.ts`; test `tests/lib/cardIndex.test.ts`.

**Interfaces — produces:** `CardIndexDiscount` gains `discountId: string`, `title: string`, `popupFrequency: 'session' | 'checkout'`, `style?: { backgroundColor: string; cornerRadius: number }`; `buildCardDiscount` sets them.

- [ ] **Step 1: failing tests:**
  - `buildCardDiscount › carries the discount id`: `discountId` equals the saved discount's `discountId`.
  - `› title is the discount's title, or its name when the title is blank`.
  - `› popupFrequency defaults to 'session'`; `'checkout'` is carried.
  - `› style is carried as { backgroundColor, cornerRadius } and left out when the discount has none` (key absent in the JSON).
  - `› existing fields (tiers, members, flash) are unchanged`.
- [ ] **Step 2-4:** run `npx vitest run tests/lib/cardIndex.test.ts` (fail), implement, run `npx vitest run && npx tsc --noEmit` (pass).
- [ ] **Step 5: commit** `feat: carry the title, frequency, style and id of a discount in the card index`; then open PR A into `dev` (version = `dev` + 1).

---

## Task 4: which bundles are due (pure logic)

Branch B. **Files:** create `extensions/product-tier-pricing/src/popup/units.js`, `session.js`, `due.js`; test `tests/storefront/popup-due.test.ts` (imports the modules directly, like `componentLoader.test.ts`).

**Interfaces — produces:**
- `countBundleUnits({ lines, members }): number`: `lines` are `/cart.js` items (`product_id`, `variant_id`, `quantity`), `members` the index's (`productId`, `variantIds: string[] | null`); a member with `variantIds: null` counts every line of that product; with a list, only those variants.
- `readFirstTierQty({ tiers }): number` (smallest `minQty`); `isBundleIncomplete({ units, firstTierQty }): boolean` (`units >= 1 && units < firstTierQty`).
- `buildShownKey({ discount }): string`: `'smoothDiscountsPopup:' + (discount.discountId || 'p' + discount.members[0].productId)`.
- `wasShown({ storage, key }): boolean` and `rememberShown({ storage, key }): void`, `storage` = `sessionStorage`; any throw means `false` / nothing.
- `listDueBundles({ discounts, lines, nowSeconds, storage, tools }): { discount, units, firstTierQty }[]` in index order; `tools` has `countBundleUnits`, `readFirstTierQty`, `isBundleIncomplete`, `buildShownKey`, `wasShown`, `flashPhase`.

- [ ] **Step 1: failing tests:**
  - whole-product member counts all variants' lines; a member with `variantIds: ['2']` ignores variant 3 (Review Focus 2); two members add up; a line of another product is ignored.
  - `isBundleIncomplete`: units 0 → false; 3 of 8 → true; 8 of 8 → false; 9 → false.
  - flash discount with `flash` ended (`nowSeconds` past `endsAtUnix`) or not started → not due (Review Focus 4); running → due.
  - frequency `'checkout'` is due even when `wasShown`; `'session'` (and absent) is not due once shown; an index discount without `discountId` is keyed by its first member's product id (Review Focus 1).
  - `wasShown` with a `storage` whose `getItem` throws → `false`; `rememberShown` with `setItem` throwing → does not throw.
  - order: two due discounts come back in index order.
- [ ] **Step 2-4:** run `npx vitest run tests/storefront/popup-due.test.ts` (fail), implement, run (pass).
- [ ] **Step 5: commit** `feat: work out which bundles a pop-up is due for`.

## Task 5: eligible items, Quick auto-fill and cost (pure logic)

Branch B. **Files:** create `extensions/product-tier-pricing/src/popup/items.js`; test `tests/storefront/popup-items.test.ts`.

**Interfaces — produces:**
- `listEligibleItems({ products, members }): Item[]`, `Item = { variantId: string, productId: string, handle: string, label: string, imageUrl: string | null, price: number, available: boolean }`: `products` maps handle → `/products/{handle}.js` JSON (`variants[].price` in cents; `price` in the result in currency units); a member's `variantIds: null` offers every variant, a list only those; `label` is "Product – Variant", or just the product when it has one variant; unavailable variants are returned with `available: false` (the list shows only available ones; counts use available ones).
- `isCompletable({ items }): boolean`: at least one available item.
- `chooseQuickFill({ items, lines, missing }): { variantId: string, quantity: number }[]`: one unit per variant per pass; pass order: available variants already in the cart, in cart order, then the other available items in `items` order; repeat passes until `missing` units are chosen; sold-out skipped; aggregated per variant; empty when no available item.
- `sumQuickFillCost({ picks, items }): number` (units × price).

- [ ] **Step 1: failing tests:**
  - member with `variantIds: ['11']` offers variant 11 only (Review Focus 2); `null` offers all.
  - label with one variant → "Tuna"; with two → "Tuna – Large".
  - `chooseQuickFill`: missing 3, in-cart variants A then B, others C, D → picks `[A:1, B:1, C:1]`; missing 3 with only A in cart and others C, D → `[A:1, C:1, D:1]`; missing 4 with A, B only → `[A:2, B:2]` (second pass); sold-out C skipped; no available items → `[]`; in-cart variant that is sold out is skipped.
  - `sumQuickFillCost`: picks `[A:2, C:1]` with prices 1.63 and 1.69 → `4.95`, rounded to cents.
  - `isCompletable`: all unavailable → false.
- [ ] **Step 2-4:** run the test (fail), implement, run (pass).
- [ ] **Step 5: commit** `feat: list the items of a bundle and choose the units for Quick auto-fill`.

## Task 6: copy, chips and look (pure logic)

Branch B. **Files:** create `extensions/product-tier-pricing/src/popup/copy.js`, `look.js`; test `tests/storefront/popup-copy.test.ts`.

**Interfaces — produces:**
- `copy.js`: `buildHeadingText({ boxCount })`, `buildBadgeText({ tier, mode })` (`mode` from the tier: `fixedPrice != null` is fixed), `buildIncentiveText({ tier, units, missing, basePrice, formatMoneyText })` (`basePrice` is `null` when unknown → no savings clause), `buildQuickLabelText({ missing })`, `buildQuickButtonText({ missing })`, `buildQuickAddText({ tier, missing, formatMoneyText })`, `buildViewText({ count })`, `buildChips({ tiers, basePrice, units, formatMoneyText, tools })` (uses `withUnitAnchor` and the widget's `buildTierChips`; keeps the 1× chip, the current chip, the first tier chip and the next tier chip only; returns `[]` when `basePrice` is `null`).
- `look.js`: `readBoxLook({ style, creamFallback }): { background: string, radius: number | null }` and `applyBoxLook({ box, look, accents })` setting `--smooth-discounts-cream`, `--smooth-discounts-radius`, `--smooth-discounts-moss`, `--smooth-discounts-sun` on the box element (`accents = { moss, sun }`).

- [ ] **Step 1: failing tests** (exact strings from Global Constraints):
  - heading "Complete your bundle" for 1, "Complete your bundles" for 2.
  - badge: `{ minQty: 8, fixedPrice: 1.63 }` → "Tier 1 at 8 items"; `{ minQty: 3, percentOff: 15 }` → "Unlock 15% off at 3 units".
  - incentive fixed, `units 5, missing 3, tier 8 × 1.63, basePrice 1.69`, format `£{{amount}}` → "Currently 5 units selected • Add 3 more to unlock £1.63/ea (Save £0.48 on these items!)"; with `basePrice` null → no parenthesis. Percent: `units 2, minQty 3, 15%` → "2 of 3 items selected • Add 1 more to unlock 15% off the whole bundle".
  - "⚡ Quick auto-fill: Add 3 more items"; "Add 3 & unlock tier"; "⚡ Quick-add 1 to unlock 15% OFF"; "⚡ Quick-add 3 to unlock £1.63/ea"; "View & mix eligible products (4 available)".
  - chips with tiers 8 × 1.63 and 16 × 1.55, base 1.69, 5 units → labels "1 × £1.69", "5 × £8.45", "8 × £13.04", "16 × £24.80" (totals); with 1 unit the current chip is the first chip (no duplicate); a third tier is not shown; `basePrice` null → `[]`.
  - look: `{ backgroundColor: '#aabbcc', cornerRadius: 8 }` → background `#AABBCC`, radius 8; `'red'`, `'#12'`, `'url(x)'` → falls back to `creamFallback`; radius `30` or `-1` or `'12'` (text) → `null`; `style` undefined → fallback and `null` (Review Focus 1); `#AABBCC80` accepted.
  - `applyBoxLook` sets the four properties; a `null` radius sets none.
- [ ] **Step 2-4:** run (fail), implement, run (pass).
- [ ] **Step 5: commit** `feat: write the pop-up's texts and tier chips, and read a box's look safely`.

## Task 7: the core script, the embed and the build wiring

Branch B. **Files:** create `src/popup/core.js`, `src/popup/config.js`, `src/entries/popup.js`, `extensions/product-tier-pricing/blocks/bundle-popup.liquid`; modify `scripts/extensionFiles.mjs` (core `bundle-popup.js`, component `bundle-popup-ui.js`, stylesheet `bundle-popup.css`), `locales/en.default.schema.json` (`bundle_popup_name`, reuse the three colour labels), `tests/helpers/builtWidget.ts` (`POPUP_COMPONENTS = ['bundle-popup-ui.js', 'tier-pricing-currency.js']`, `POPUP_CORE`, `runPopupScripts`), `tests/scripts/extensionContract.test.ts`; create `src/entries/popup-ui.js` as a stub registering `popupUi` with `openPopup` returning `Promise.resolve({ action: 'continue', didAdd: false })` (Task 8 replaces it) and an empty `src/bundle-popup.css`; tests `tests/storefront/popup-core.test.ts`.

**Interfaces — produces:**
- Embed element `[data-smooth-discounts-popup]` with `data-index`, `data-money-format`, `data-root-url`, `data-shop-currency`, `data-money-sample`, `data-component-urls` (`popupUi`, `currency`), `data-moss-color`, `data-cream-color`, `data-sun-color`; printed only when the index is not blank; the block preloads the UI script and has three colour settings with the widget's defaults.
- `readPopupConfig({ doc, shopify, tools })`: the same fields as `readCardConfig` (#190) plus the three colours; `null` without the element. Currency reading reuses `readContainerCurrency`.
- `withBudget({ win, promise, milliseconds }): Promise<T | null>` (null at the limit or on rejection).
- `startPopup({ win, tools }): void`: adds one capture-phase `click` listener on `win.document`; a click inside `[name="checkout"]` is stopped (`preventDefault`, `stopImmediatePropagation`) unless the bypass flag is set; then within one `withBudget(…, 2000)`: `/cart.js` → `listDueBundles` → `/{root}products/{handle}.js` for the due bundles' handles (parallel) → components (`popupUi`, plus `currency` for a foreign currency) → `showIndexInCurrency` (#190) → `isCompletable` filter. No box: resume. Boxes: `rememberShown` for each `'session'` bundle, call `popupUi.openPopup(...)`, then act on `{ action, didAdd }`.
- `resumeCheckout({ win, target, didAdd, root })`: `didAdd` → `win.location.assign(root + 'checkout')` (root without double slash); else the button's form → `form.requestSubmit(button)`, a link → `win.location.assign(href)`; both with the bypass flag set first.
- `dismissPopup({ win, didAdd })`: `didAdd` → `win.location.reload()`.

- [ ] **Step 1: failing tests** (jsdom, built scripts, fake timers; `fetch` stubbed per URL):
  - nothing printed (no embed element) → a Checkout press is not stopped.
  - no due bundle (units at or above first tier) → press stopped, then the form is submitted once (listen for `submit`), `openPopup` not called.
  - due bundle → `openPopup` called with one box holding `title`, `units`, `firstTierQty`, items, and the box's look inputs; with frequency `'session'` it is not due on a second press (same tab), with `'checkout'` it is.
  - Continue without an add → form submitted once and the pop-up does not reopen (no loop, Review Focus 3); a second press while the first is being worked out is stopped and ignored.
  - Continue with an add → `location.assign('/checkout')` (root `/fr` → `/fr/checkout`), the form is **not** submitted.
  - close after an add → `location.reload` called; close without an add → nothing.
  - failures end with the form submitted: `/cart.js` rejects; `/cart.js` returns text that is not JSON; `/cart.js` never answers (advance 2000 ms); `/products/…js` fails for every product (box dropped); the UI component fails to load; foreign currency with rate `'abc'` or a sample without an amount (Review Focus 5); `sessionStorage.getItem` throws (pop-up still opens).
  - a bundle that cannot be completed (all variants sold out) gets no box.
  - a link `<a name="checkout" href="/checkout">` is followed after Continue.
  - contract tests: the new scripts and stylesheet are in the build list; the block hands over the address of each component under the names the core asks for (`popupUi`, `currency`) and each entry registers itself under that name; `shopify theme check --path extensions/product-tier-pricing` reports no offenses.
- [ ] **Step 2: run** `npx vitest run tests/storefront/popup-core.test.ts tests/scripts` — fail.
- [ ] **Step 3: implement** the signatures above; reuse `loadComponentSet`/`loadComponent` (as `cards/components.js` does), `showIndexInCurrency`, `parseCardIndex`-style tolerant index reading, `flashPhase`.
- [ ] **Step 4: run** `npx vitest run && npx tsc --noEmit && node scripts/build-extension.mjs && npx shopify theme check --path extensions/product-tier-pricing --no-color` — all pass; every script under 10,000 bytes.
- [ ] **Step 5: commit** `feat: stop the Checkout press, work out the due bundles and carry on to checkout when anything fails`.

## Task 8: the pop-up component (dialog, boxes, adding)

Branch B. **Files:** replace the stub `src/entries/popup-ui.js`; create `src/popup/ui.js`, `src/popup/dialog.js`, `src/popup/box.js`, `src/popup/add.js`; test `tests/storefront/popup-ui.test.ts`.

**Interfaces — produces:** `openPopup(tools, { win, boxes, root, accents, moneyFormat }): Promise<{ action: 'continue' | 'close', didAdd: boolean }>`; `boxes` entries: `{ title, tiers, units, firstTierQty, items, flash, style, lines }`. `addItems({ win, root, picks }): Promise<{ ok: boolean }>`: one `POST {root}cart/add.js` with `{ items: [{ id, quantity }] }`, `ok: false` on a non-2xx answer or a throw. `readCartUnits({ win, root, members })` re-reads `/cart.js` after each add.

- [ ] **Step 1: failing tests:**
  - a `<dialog>` with `showModal`, labelled by the heading ("Complete your bundles" for two boxes), a close button, boxes, and a "Continue to checkout" link at the bottom; Escape and the close button resolve `{ action: 'close' }`; the backdrop click too; focus enters the dialog and returns to the Checkout button.
  - the first box is expanded; others contracted; pressing "View & mix eligible products (N available)" expands that box and contracts the other; with a stubbed `IntersectionObserver`, the most visible box is expanded.
  - expanded box shows: title, badge, incentive line, chips (when `basePrice` known), the items list, the Quick auto-fill row; contracted shows title, badge, incentive, "View & mix…" and "⚡ Quick-add…" buttons; strings exactly as Global Constraints.
  - flash bar "⚡ TIER 1 FLASH SALE ENDS IN" with the countdown on a box with `flash`; none without; the countdown ticks each second (fake timers) and the box is removed when it reaches 0.
  - pressing an item's Add posts `{ items: [{ id: 11, quantity: 1 }] }` to `/cart/add.js` (and `/fr/cart/add.js` for root `/fr/`), re-reads `/cart.js`, and updates the incentive line, the chips and the item's in-cart count.
  - Quick auto-fill sends **one** request with several items (from `chooseQuickFill`); when the units reach the first tier the box shows "Tier unlocked" and its Add and Quick buttons go.
  - a refused add (422) shows "We couldn't add that. Try again." in the box, re-reads the cart, and the Continue link still works.
  - Continue resolves `{ action: 'continue', didAdd }` with `didAdd` true after any successful add.
  - a box with no title shows "Your bundle" (Review Focus 1); each box has its own look (two styles → two backgrounds); amounts use `moneyFormat`.
- [ ] **Step 2-4:** run (fail), implement in the pure-function style with `tools` injection, run `npx vitest run tests/storefront && npx tsc --noEmit && node scripts/build-extension.mjs` (pass; sizes under 10,000).
- [ ] **Step 5: commit** `feat: the bundle pop-up with its boxes, items and Quick auto-fill`.

## Task 9: the stylesheet

Branch B. **Files:** create `extensions/product-tier-pricing/src/bundle-popup.css` (replacing the empty file); test `tests/storefront/popup-stylesheet.test.ts` (in the style of `widgetNames.test.ts`).

- [ ] **Step 1: failing tests:** every class the UI writes has a rule (`smooth-discounts-popup`, `…__box`, `…__box--expanded`, `…__box--contracted`, `…__chip`, `…__item`, `…__flash`, `…__error`, `…__continue`); the stylesheet uses the widget's custom properties (`--smooth-discounts-cream`, `-moss`, `-sun`, `-radius`) with the defaults of Global Constraints; no `@import` or `url(http` (nothing loaded from outside) and no `font-family` other than `inherit`; a media rule for narrow screens (`max-width: 480px`) makes the dialog fill the width; `prefers-reduced-motion` turns animations off.
- [ ] **Step 2-4:** run (fail), write the CSS (the design's layout: cream boxes, dark flash bar, rounded chips; the theme's fonts), run (pass).
- [ ] **Step 5: commit** `feat: style the bundle pop-up like the widget`.

## Task 10: check on the demo store, then the PR

Branch B. No new code unless a defect is found (then: failing test first).

- [ ] **Step 1:** the owner types the storefront password in their own Terminal tab (never typed by Claude); follow `building-multistore-shopify-apps/guide/06-local-testing-and-cli.md` (`shopify theme dev`, then `shopify app dev` from a throwaway worktree with `--theme <development theme id>`; `app dev clean` after; remove the development theme). Branch A and B code both on the dev store; run the dev store's save of a discount once so the index carries the new fields.
- [ ] **Step 2:** with a bundle of 2+ tiers and a few products: from the cart page, the drawer and the notification, Checkout opens the pop-up only with an incomplete bundle; per-item Add and Quick auto-fill add units; "Tier unlocked" appears; Continue reaches checkout with the units kept; close after an add refreshes the cart page; a second Checkout press in the same tab does not reopen it (`session`) / reopens it (`checkout`); a flash bundle shows its countdown; phone width (375px) fits and scrolls; keyboard: Tab stays inside, Escape closes.
- [ ] **Step 3:** run `npx vitest run`, `npx tsc --noEmit`, `node scripts/build-extension.mjs`, `shopify theme check` once more; note any test timeouts caused by machine load and rerun those files alone.
- [ ] **Step 4:** bump the version, push, open PR B (base `feat/card-prices-currency`), the description listing: what is verified on the demo store and how, what is not (no second currency; one theme; the rate question), the pre-existing failures (`node --test` 11, sold-out unhandled errors), and the deploy note (owner deploys both PRs; nothing deployed by Claude). Then `get_status` of the PR; offer auto-fix.

---

## Plan-level calls (beyond the spec)

1. The index also carries `discountId` (the spec lists `title`, `popupFrequency`, `style`): the "shown this session" key needs a stable id. An index saved before this change has none, so the key falls back to the first member's product id.
2. An index saved before this change has no `title`: the box heading is "Your bundle". The index is rebuilt at every save, so a stale one lasts until the next save of any discount.
3. The Title field follows the name until it is edited (new discounts), as the spec says it is prefilled from the name.
4. The box's expanded or contracted state is the most visible box when an `IntersectionObserver` exists; without one, the first box stays expanded.
5. Branch layout: A from `dev`, B stacked on #190.
