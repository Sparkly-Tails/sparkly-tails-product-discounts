# Mix & Match Widget Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the storefront tier-pricing widget's visual and interaction model — unit price, promo subhead, a tier/progress card (two-segment progress bar, floating callout, dynamic tier-shortcut buttons, dashed "next tier preview" box, expandable mix-and-match product list) and a total-row breakdown — to match the high-fidelity design in `/Users/rubencamposdeteba/Documents/design_handoff_mix_match_widget/`, applied to both standalone and group discounts (group-only elements — the mix-and-match product list — hidden for standalone).

**Architecture:** Pure, framework-agnostic JS functions compute all pricing/progress state from `tiers` + `otherQty` (0 for standalone, real sibling cart quantity for group) + the on-page quantity stepper's live value — the same functions serve both modes uniformly. The Liquid block renders a static scaffold (including a server-rendered promo subhead and image-enriched group sibling data) and JS fills in everything that depends on live cart/quantity state. All new colors/fonts/radii are sourced from the live theme's real CSS custom properties where a clean semantic match exists (text, secondary text, borders, font families, card radius); the design's literal moss/cream/sun hex values become new theme-editor-configurable block settings for the handful of accent colors the theme has no equivalent for.

**Tech Stack:** Vanilla JS (no build step), Liquid, CSS — all inside `extensions/product-tier-pricing/`. Tested with Node's built-in `node --test` runner (`extensions/product-tier-pricing-tests/tier-pricing.test.js`). No admin app (`src/`) or Discount Function (`extensions/product-discount/`) changes — this is a pure storefront redesign; the underlying discount data model and checkout math are untouched.

## Global Constraints

- Node version: run `nvm use 20.20.2` before any node/npm/shopify command in this repo.
- **No changes to `src/` (admin app) or `extensions/product-discount/` (Rust Function).** Every task in this plan touches only `extensions/product-tier-pricing/` and `extensions/product-tier-pricing-tests/`.
- Bump `version` in `package.json` (and `package-lock.json`'s matching two `version` fields) on this change — a new feature, so a **minor** bump, done in the same commit as the last code task, per this project's versioning convention (patch for fixes, minor for features, no exceptions). This also doubles as the "did this ship" signal in the admin app's footer, per this project's established convention, even though this feature doesn't touch the admin app's own code.
- All money math rounds explicitly to whole pence (`Math.round(x*100)/100`) — never rely on downstream rounding. This is the third independent implementation of this project's tier-pricing math (after the admin app's TS and the Discount Function's Rust) and must stay consistent with both: a fixed-price tier's per-unit price is clamped to the product's base price (never a markup), matching `clampedFixedPrice`/`totalAtThresholdFixed` in `src/lib/tier-math.ts` and the Rust Function's identical clamp.
- **SUPERSEDED 2026-08-05 (see `docs/superpowers/plans/2026-08-05-cart-aware-widget.md`): this product's own cart-resident quantity is no longer excluded.** The line below is kept for history only — do not follow it. Real-world use surfaced exactly the confusing UX this note predicted was an acceptable tradeoff: a customer with existing qualifying items already in cart would see an undercounted progress bar and a discount that silently failed to display, because their own product's cart quantity was invisible to the math. The double-counting risk this note was protecting against is real (confirmed live: this theme's stepper does not reset after a successful Add to Cart) but is now handled directly — the stepper is reset to 1 whenever the widget observes this product's cart quantity increase — rather than by excluding self-quantity from the formula.
- ~~**Combined-quantity formula for group mode** (explicit decision, do not revisit without re-confirming): `combinedQty = addingQty (this product's live on-page stepper value) + otherQty (other group products' quantity already in cart, fetched fresh from `/cart.js`, this product's OWN cart-resident quantity always excluded from the sum)`. This differs from both (a) the old, buggy pre-fix behavior (which double-counted this product's own quantity because the stepper wasn't reset after Add to Cart) and (b) the current production behavior (which ignores the stepper entirely for group mode and trusts only real cart state). Known, accepted limitation carried over directly from the design spec: if the customer already has some quantity of *this exact product* sitting in their cart from an earlier visit, that quantity is invisible to `combinedQty` — only the live stepper value (this visit) and *other* products' cart quantity count. Do not silently "fix" this by adding this-product cart-tracking back in; it was an explicit, informed choice (see conversation this plan was written from).~~
- **Tier buttons and the dashed "next tier" preview box are keyed off `addingQty` (the local stepper value) alone, never `combinedQty`.** Clicking a tier button sets the on-page quantity input directly to that tier's own `minQty` — it does not account for `otherQty` at all. This is faithful to the design reference's own logic (`mkV2()` in `widget-reference.dc.html`) and is a deliberate UX simplification ("here's a shortcut to buy exactly N of this"), separate from the combined-quantity progress bar/callout, which are the only elements driven by `combinedQty`.
- Promo-subhead and callout copy in this plan is a first-draft, generic (non-merchandising-approved) wording, mirroring the design brief's own explicit caveat about its example tier prices ("£10"/"£19") needing merchandising confirmation before shipping. Flag both for review; do not treat the exact strings in this plan as final copy.
- Commit after every task (not every step) unless a step's own instructions say otherwise.
- Run `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js` after every change to `tier-pricing.js` in this plan, not just at the end of each task.

---

## Task 1: Pure JS — progress/tier state engine and copy formatters

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`

**Interfaces:**
- Consumes: existing `computeTierState(tiers, quantity)`, `perUnitPrice(basePrice, quantity, state)` (both unchanged, same file)
- Produces: `unitPriceAtTier(basePrice, tier)`, `totalAtTier(basePrice, tier)`, `computeProgressState(tiers, otherQty, addingQty)`, `formatCalloutText(progressState, tiers, basePrice, formatMoney)`, `formatTempBoxLabel(progressState, basePrice, addingQty, formatMoney)`

This task is pure logic only — no DOM, no Liquid, fully covered by `node --test`. Later tasks wire these into rendering.

- [ ] **Step 1: Write the failing tests for `unitPriceAtTier` / `totalAtTier`**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`, after the existing `sumGroupQuantityInCart` tests (find that `describe`-less block near the end of the file — this file uses flat `test(...)` calls, not `describe` blocks):

```js
test('unitPriceAtTier: percent tier with no anchor returns basePrice minus percentOff', () => {
  const tier = { minQty: 7, percentOff: 10 }
  assert.equal(unitPriceAtTier(1.99, tier), 1.791)
})

test('unitPriceAtTier: anchor tier returns anchorPrice divided by minQty', () => {
  const tier = { minQty: 7, percentOff: 5, anchorPrice: 10.0 }
  assert.equal(unitPriceAtTier(1.49, tier), 10.0 / 7)
})

test('unitPriceAtTier: fixed tier returns the clamped fixed price directly', () => {
  const tier = { minQty: 3, fixedPrice: 1.5 }
  assert.equal(unitPriceAtTier(1.99, tier), 1.5)
})

test('unitPriceAtTier: fixed price above base price clamps to base price, never a markup', () => {
  const tier = { minQty: 1, fixedPrice: 5.0 }
  assert.equal(unitPriceAtTier(1.49, tier), 1.49)
})

test('totalAtTier: fixed tier multiplies clamped unit price by minQty, rounded to whole pence', () => {
  const tier = { minQty: 3, fixedPrice: 1.5 }
  assert.equal(totalAtTier(1.99, tier), 4.5)
})

test('totalAtTier: anchor tier returns exactly the anchorPrice (minQty units, no extra accrual)', () => {
  const tier = { minQty: 7, percentOff: 5, anchorPrice: 10.0 }
  assert.equal(totalAtTier(1.49, tier), 10.0)
})
```

(Update the file's top `require` line to include the new exports as they're added — see Step 3.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — `unitPriceAtTier is not defined` (not exported yet).

- [ ] **Step 3: Implement `unitPriceAtTier` / `totalAtTier`**

Add to `extensions/product-tier-pricing/assets/tier-pricing.js`, directly after the existing `perUnitPrice` function:

```js
function unitPriceAtTier(basePrice, tier) {
  if (tier.fixedPrice != null) {
    return Math.min(Math.max(tier.fixedPrice, 0), basePrice)
  }
  return perUnitPrice(basePrice, tier.minQty, {
    percentOff: tier.percentOff != null ? tier.percentOff : 0,
    anchorPrice: tier.anchorPrice != null ? tier.anchorPrice : null,
    fixedPrice: null,
    minQty: tier.minQty,
  })
}

function totalAtTier(basePrice, tier) {
  return Math.round(unitPriceAtTier(basePrice, tier) * tier.minQty * 100) / 100
}
```

- [ ] **Step 4: Run tests to verify the new ones pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS for the 6 new tests. (They aren't exported yet, so `require` will still be missing them if you update the require line now — do that in this step, adding `unitPriceAtTier, totalAtTier` to both the destructured `require(...)` at the top of the test file and the `module.exports` object near the bottom of `tier-pricing.js`.)

- [ ] **Step 5: Write the failing tests for `computeProgressState`**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`:

```js
test('computeProgressState: below the lowest tier, no segments filled, not maxed', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)

  assert.equal(state.combinedQty, 1)
  assert.equal(state.topThreshold, 20)
  assert.equal(state.cartPct, 0)
  assert.equal(state.addedPct, 5) // round(1/20*100)
  assert.equal(state.maxed, false)
})

test('computeProgressState: otherQty contributes its own bar segment, excluded from addedPct', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 1)

  assert.equal(state.combinedQty, 3)
  assert.equal(state.cartPct, 10) // round(2/20*100)
  assert.equal(state.addedPct, 5) // round(1/20*100)
})

test('computeProgressState: callout percent is clamped between 6 and 94', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 20, percentOff: 10 }]
  const almostNothing = computeProgressState(tiers, 0, 1)
  assert.equal(almostNothing.calloutPct, 6)

  const almostFull = computeProgressState(tiers, 0, 19)
  assert.equal(almostFull.calloutPct, 94) // raw 95, clamped down
})

test('computeProgressState: reaching the top tier reports maxed and a 0 tierRemaining', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 18)

  assert.equal(state.combinedQty, 20)
  assert.equal(state.maxed, true)
  assert.equal(state.tierState.nextTier, null)
})

test('computeProgressState: addedPct never exceeds the remaining room left by cartPct, even if otherQty alone already maxes the bar', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 25, 3)

  assert.equal(state.cartPct, 100)
  assert.equal(state.addedPct, 0)
  assert.equal(state.combinedQty, 28)
  assert.equal(state.maxed, true)
})

test('computeProgressState: tierButtons marks exactly the button matching addingQty as active, ignoring otherQty', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 5, 7)

  assert.deepEqual(state.tierButtons, [
    { minQty: 1, active: false },
    { minQty: 7, active: true },
    { minQty: 20, active: false },
  ])
})

test('computeProgressState: tempBox appears between two tiers based on addingQty alone, not combinedQty', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const between = computeProgressState(tiers, 10, 3) // addingQty 3 is between 1 and 7
  assert.deepEqual(between.tempBox, { afterIndex: 0, tier: { minQty: 7, percentOff: 5 } })

  const atExactTier = computeProgressState(tiers, 10, 7)
  assert.equal(atExactTier.tempBox, null)

  const pastTop = computeProgressState(tiers, 10, 25)
  assert.equal(pastTop.tempBox, null)
})

test('computeProgressState: a single-tier discount has no tempBox and a top threshold equal to that one tier', () => {
  const tiers = [{ minQty: 5, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 2)

  assert.equal(state.topThreshold, 5)
  assert.equal(state.tempBox, null)
  assert.deepEqual(state.tierButtons, [{ minQty: 5, active: false }])
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — `computeProgressState is not defined`.

- [ ] **Step 7: Implement `computeProgressState`**

Add to `extensions/product-tier-pricing/assets/tier-pricing.js`, after `totalAtTier`:

```js
function computeProgressState(tiers, otherQty, addingQty) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const topThreshold = sorted[sorted.length - 1].minQty
  const combinedQty = otherQty + addingQty
  const tierState = computeTierState(sorted, combinedQty)

  const cartPct = topThreshold > 0 ? Math.min(100, Math.round((otherQty / topThreshold) * 100)) : 0
  const addedPctRaw = topThreshold > 0 ? Math.round((addingQty / topThreshold) * 100) : 0
  const addedPct = Math.max(0, Math.min(100 - cartPct, addedPctRaw))
  const rawCalloutPct = topThreshold > 0 ? Math.round((combinedQty / topThreshold) * 100) : 0
  const calloutPct = Math.max(6, Math.min(94, rawCalloutPct))
  const maxed = combinedQty >= topThreshold

  const tierButtons = sorted.map((t) => ({ minQty: t.minQty, active: addingQty === t.minQty }))

  let tempBox = null
  for (let i = 0; i < sorted.length - 1; i++) {
    if (addingQty > sorted[i].minQty && addingQty < sorted[i + 1].minQty) {
      tempBox = { afterIndex: i, tier: sorted[i + 1] }
      break
    }
  }

  return { combinedQty, topThreshold, cartPct, addedPct, calloutPct, maxed, tierState, tierButtons, tempBox }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS, all tests including pre-existing ones. Add `computeProgressState` to the `require` line and `module.exports`.

- [ ] **Step 9: Write the failing tests for the copy formatters**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`:

```js
function fmt(n) {
  return '£' + n.toFixed(2)
}

test('formatCalloutText: below the top tier shows progress toward the next tier', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 1)
  const text = formatCalloutText(state, tiers, 1.49, fmt)
  assert.equal(text, '3 of 7 · 4 more for £1.42')
})

test('formatCalloutText: at the top tier shows the combined total and final price, no "more for"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 12, 8)
  const text = formatCalloutText(state, tiers, 1.49, fmt)
  assert.equal(text, '20 combined · £1.34 each')
})

test('formatTempBoxLabel: quantity, "x", the total at the next tier\'s blended rate — no "=" sign', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 5)
  const label = formatTempBoxLabel(state, 1.49, 5, fmt)
  // next tier is minQty 7 @ 5% off => unit 1.4155, 5 * 1.4155 = 7.0775 -> rounds to 7.08
  assert.equal(label, '5x £7.08')
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — formatters not defined.

- [ ] **Step 11: Implement the formatters**

Add to `extensions/product-tier-pricing/assets/tier-pricing.js`, after `computeProgressState`:

```js
function formatCalloutText(progressState, tiers, basePrice, formatMoney) {
  if (progressState.maxed) {
    const topTier = tiers.slice().sort((a, b) => a.minQty - b.minQty).pop()
    return progressState.combinedQty + ' combined · ' + formatMoney(unitPriceAtTier(basePrice, topTier)) + ' each'
  }
  const next = progressState.tierState.nextTier
  return progressState.combinedQty + ' of ' + next.minQty + ' · ' + next.delta + ' more for ' + formatMoney(
    next.fixedPrice != null ? next.fixedPrice : unitPriceAtTier(basePrice, { minQty: next.minQty, percentOff: next.percentOff, anchorPrice: null }),
  )
}

function formatTempBoxLabel(progressState, basePrice, addingQty, formatMoney) {
  if (!progressState.tempBox) return ''
  const total = Math.round(unitPriceAtTier(basePrice, progressState.tempBox.tier) * addingQty * 100) / 100
  return addingQty + 'x ' + formatMoney(total)
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS, all tests. Add `formatCalloutText, formatTempBoxLabel` to the `require` line and `module.exports`.

- [ ] **Step 13: Write the failing tests for `buildPromoText`**

`buildPromoText` builds the promo-subhead copy shown under the unit price — it needs a `title` (from the discount's own admin-configured title, once the separate admin-app title-field work lands and starts populating it; always blank/`undefined` until then) to produce the design's exact phrasing, and falls back to generic copy when no title is set. Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`:

```js
test('buildPromoText: group mode with a title uses "Mix & match any {title}"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, 'Canagan treat')
  assert.equal(text, 'Mix & match any Canagan treat — 7+ unlocks £1.42 each, 20+ unlocks £1.34 each')
})

test('buildPromoText: group mode with no title falls back to generic copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, undefined)
  assert.equal(text, 'Mix & match — 7+ unlocks £1.42 each')
})

test('buildPromoText: standalone mode with a title uses "Buy more {title}"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, false, 'Canagan Tuna Soup')
  assert.equal(text, 'Buy more Canagan Tuna Soup — 7+ unlocks £1.42 each')
})

test('buildPromoText: standalone mode with no title falls back to generic copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, false, '')
  assert.equal(text, 'Buy more, save more — 7+ unlocks £1.42 each')
})
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — `buildPromoText is not defined`.

- [ ] **Step 15: Implement `buildPromoText`**

Add to `extensions/product-tier-pricing/assets/tier-pricing.js`, after `formatTempBoxLabel`:

```js
function buildPromoText(tiers, basePrice, formatMoney, isGroup, title) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const clauses = sorted.slice(1).map((t) => t.minQty + '+ unlocks ' + formatMoney(unitPriceAtTier(basePrice, t)) + ' each')
  const hasTitle = title != null && title !== ''
  const prefix = isGroup
    ? (hasTitle ? 'Mix & match any ' + title + ' — ' : 'Mix & match — ')
    : (hasTitle ? 'Buy more ' + title + ' — ' : 'Buy more, save more — ')
  return prefix + clauses.join(', ')
}
```

(Note the parameter order here — `formatMoney` is a single-argument function `(n) => string`, matching this plan's test helper `fmt`, not the two-argument `formatMoney(amount, format)` used elsewhere in this file. Task 3 wraps the real `formatMoney` accordingly when calling this from `renderTierPricing`: `(n) => formatMoney(n, moneyFormat)`, exactly as it already does for `formatCalloutText`.)

- [ ] **Step 16: Run tests to verify they pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS, all tests. Add `buildPromoText` to the `require` line and `module.exports`.

- [ ] **Step 17: Consolidate the require/exports lines**

This task added 7 new functions across Steps 3, 7, 11, and 15. Rather than trust the incremental edits above, set the test file's require line and the source file's exports to their final, complete state directly.

In `extensions/product-tier-pricing-tests/tier-pricing.test.js`, the top `require` line must read exactly:

```js
const { computeTierState, perUnitPrice, sumGroupQuantityInCart, unitPriceAtTier, totalAtTier, computeProgressState, formatCalloutText, formatTempBoxLabel, buildPromoText } = require('../product-tier-pricing/assets/tier-pricing.js')
```

In `extensions/product-tier-pricing/assets/tier-pricing.js`, the `module.exports` block must read exactly:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeTierState,
    perUnitPrice,
    sumGroupQuantityInCart,
    unitPriceAtTier,
    totalAtTier,
    computeProgressState,
    formatCalloutText,
    formatTempBoxLabel,
    buildPromoText,
  }
}
```

Run `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js` once more after this — expect PASS, unchanged from Step 16.

- [ ] **Step 18: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing-tests/tier-pricing.test.js
git commit -m "Add progress-state engine and copy formatters for the redesigned mix & match widget"
```

---

## Task 2: Liquid — enrich group siblings with images, add the new markup scaffold

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid`

**Interfaces:**
- Consumes: `product.metafields.sparkly_product_discounts.group.value` (already a parsed Liquid object for a `type: json` metafield — `.siblings` is directly loopable, no JSON parsing needed at this layer), `all_products[handle]` (Shopify global object, standard Liquid, not section/block-scoped — verify it resolves inside this sandboxed extension block in Step 1 before building anything on top of it)
- Produces: an enriched `data-group` JSON payload where each sibling now also carries `imageUrl` (nullable); new empty scaffold elements (`data-tier-pricing-*`) for Task 3's JS to fill

- [ ] **Step 1: Verify `all_products[handle]` resolves inside this extension block**

Before writing the real enrichment logic, confirm the assumption this whole task depends on. Temporarily add this single line near the top of `extensions/product-tier-pricing/blocks/tier-pricing.liquid` (after the existing `{%- assign group_metafield = ... -%}` line):

```liquid
{%- assign _probe = all_products['canagan-tuna-soup-for-cats'] -%}
<!-- DEBUG all_products probe: {{ _probe.title | default: 'NIL — all_products lookup failed or handle does not exist' }} -->
```

(Swap the handle for any real product handle in the dev store if this one doesn't exist.) Run `nvm use 20.20.2 && shopify app dev`, view a product page using this block, and check the rendered HTML source for the debug comment.

- If it prints the product's real title: confirmed working, remove the probe line and continue to Step 2.
- If it prints "NIL" or the comment is missing entirely: `all_products` is restricted in this sandboxed context. Stop here and fall back to a simpler plan for this task — skip real thumbnails entirely (render a plain colored circle with the product's initial letter instead of an `<img>`, no Liquid image lookup needed) — and update Step 3 onward accordingly before continuing.

- [ ] **Step 2: Enrich the group siblings with image URLs**

Replace the existing sibling/group JSON assembly in `tier-pricing.liquid` — find this block near the top of the file:

```liquid
{%- assign tiers_metafield = product.metafields.sparkly_product_discounts.tiers -%}
{%- assign group_metafield = product.metafields.sparkly_product_discounts.group -%}
{%- if group_metafield != blank -%}
  {%- assign group_json = group_metafield.value | json | escape -%}
{%- else -%}
  {%- assign group_json = 'null' -%}
{%- endif -%}
```

Replace it with:

```liquid
{%- assign tiers_metafield = product.metafields.sparkly_product_discounts.tiers -%}
{%- assign group_metafield = product.metafields.sparkly_product_discounts.group -%}
{%- assign group_json = 'null' -%}
{%- if group_metafield != blank -%}
  {%- capture siblings_json -%}
    [
    {%- for sibling in group_metafield.value.siblings -%}
      {%- assign sibling_product = all_products[sibling.handle] -%}
      {
        "title": {{ sibling.title | json }},
        "handle": {{ sibling.handle | json }},
        "imageUrl": {% if sibling_product and sibling_product.featured_image %}{{ sibling_product.featured_image | image_url: width: 88 | json }}{% else %}null{% endif %}
      }{%- unless forloop.last -%},{%- endunless -%}
    {%- endfor -%}
    ]
  {%- endcapture -%}
  {%- capture group_json_raw -%}
    {"tiers": {{ group_metafield.value.tiers | json }}, "siblings": {{ siblings_json }}}
  {%- endcapture -%}
  {%- assign group_json = group_json_raw | strip | json | escape -%}
{%- endif -%}
```

(`group_json_raw` is already a JSON *string* built by hand via `capture`, not a Liquid object — the outer `| json` here serializes that STRING for safe embedding as an HTML attribute value, i.e. JSON-encodes a JSON string, matching how the file already double-encodes `tiers_json`/the old `group_json` today. `| strip` removes the whitespace/newlines `capture` introduces from the multi-line block.)

- [ ] **Step 3: Add the new markup scaffold**

Replace the block's price-row + message paragraph (currently just two `<p>` tags) with the full new structure. Find:

```liquid
  <p class="sparkly-tier-pricing__price" data-tier-pricing-price>
    {{ product.selected_or_first_available_variant.price | money }}
  </p>
  <p class="sparkly-tier-pricing__message" data-tier-pricing-message></p>
  <p class="sparkly-tier-pricing__group-links" data-tier-pricing-group-links></p>
```

Replace with:

```liquid
  <div class="sparkly-tier-pricing__price-row">
    <span class="sparkly-tier-pricing__price" data-tier-pricing-price>
      {{ product.selected_or_first_available_variant.price | money }}
    </span>
    <span class="sparkly-tier-pricing__each-label">each</span>
  </div>

  {%- assign discount_tiers = tiers_metafield.value.tiers -%}
  {%- assign discount_title = tiers_metafield.value.title -%}
  {%- if group_metafield != blank -%}
    {%- assign discount_tiers = group_metafield.value.tiers -%}
    {%- assign discount_title = group_metafield.value.title -%}
  {%- endif -%}

  {%- if discount_tiers.size > 1 -%}
    <p class="sparkly-tier-pricing__promo" data-tier-pricing-promo>
      {%- if group_metafield != blank -%}
        {%- if discount_title != blank -%}Mix &amp; match any {{ discount_title }}{%- else -%}Mix &amp; match{%- endif -%}
      {%- else -%}
        {%- if discount_title != blank -%}Buy more {{ discount_title }}{%- else -%}Buy more, save more{%- endif -%}
      {%- endif -%}
      {%- for tier in discount_tiers -%}
        {%- unless forloop.first -%}
          {%- if forloop.index == 2 %} —{% else %},{% endif %}
          {{ tier.minQty }}+ unlocks
          {%- if tier.fixedPrice -%}
            {{ tier.fixedPrice | times: 100.0 | money }}
          {%- else -%}
            {{ tier.percentOff | default: 0 }}% off
          {%- endif -%}
          each
        {%- endunless -%}
      {%- endfor -%}
    </p>
  {%- endif -%}

  <div class="sparkly-tier-pricing__card" data-tier-pricing-card hidden>
    <div class="sparkly-tier-pricing__bar-wrap">
      <div class="sparkly-tier-pricing__callout" data-tier-pricing-callout></div>
      <div class="sparkly-tier-pricing__tick" data-tier-pricing-tick></div>
      <div class="sparkly-tier-pricing__track">
        <div class="sparkly-tier-pricing__segment sparkly-tier-pricing__segment--cart" data-tier-pricing-cart-segment></div>
        <div class="sparkly-tier-pricing__segment sparkly-tier-pricing__segment--adding" data-tier-pricing-adding-segment></div>
      </div>
      <div class="sparkly-tier-pricing__dot" data-tier-pricing-dot></div>
    </div>
    <div class="sparkly-tier-pricing__scale" data-tier-pricing-scale></div>
    <div class="sparkly-tier-pricing__tiers" data-tier-pricing-tiers></div>
    {%- if group_metafield != blank -%}
      <button type="button" class="sparkly-tier-pricing__toggle" data-tier-pricing-toggle>mix &amp; match products ▼</button>
      <div class="sparkly-tier-pricing__list" data-tier-pricing-list hidden></div>
    {%- endif -%}
  </div>

  <div class="sparkly-tier-pricing__total" data-tier-pricing-total hidden>
    <div class="sparkly-tier-pricing__total-value" data-tier-pricing-total-value></div>
    <div class="sparkly-tier-pricing__total-breakdown" data-tier-pricing-total-breakdown></div>
  </div>

  <p class="sparkly-tier-pricing__message" data-tier-pricing-message></p>
```

Notes on this markup:
- The promo-subhead's percent-mode branch above is intentionally left as a rough placeholder (`{{ tier.percentOff }}% off each`, not the real per-unit £ price) — computing a real per-unit £ value for an anchor/percent tier requires the same math as `unitPriceAtTier` (Task 1, JS-only), which Liquid can't call. **Do not ship this placeholder text** — Task 3 replaces the entire `[data-tier-pricing-promo]` element's content via JS once the page loads (using `unitPriceAtTier` and, once available, the real `title` — see this task's note on `discount_title` below), so the real, correct copy appears immediately on `DOMContentLoaded`. Keep this Liquid-rendered version only as a no-JS/first-paint fallback.
- `discount_title` is read from `tiers_metafield.value.title` / `group_metafield.value.title` — this key does not exist in the metafield JSON until the separate admin-app "title field" plan ships and `src/lib/product-tiers.ts` starts writing it (see that plan). Until then, `discount_title` is always blank here and every promo subhead falls back to the generic "Mix & match — " / "Buy more, save more — " prefix, which is exactly this task's pre-title behavior — nothing breaks if the two plans ship out of order.
- `data-tier-pricing-card` starts `hidden` — Task 3's JS un-hides it only when `discount_tiers.size > 0` (no configured discount at all keeps the whole card, and the promo subhead above it, hidden — matching this block's existing "always renders a price, whether or not a discount is live" contract).
- The existing `sparkly-tier-pricing__group-links` paragraph (used by the old, simpler `renderGroupLinks` function) is removed — the new expandable list (`data-tier-pricing-list`) fully replaces it. Task 3 removes the now-dead `renderGroupLinks` function from the JS file.

- [ ] **Step 4: Verify the block still parses**

Run: `nvm use 20.20.2 && shopify app dev` (or `shopify app deploy --allow-updates` against a dev/staging store if `dev` isn't set up locally), load a real product page using this block, and confirm no Liquid syntax errors appear (check the page renders at all, and check server-side logs/theme check output for `tier-pricing.liquid`).

- [ ] **Step 5: Commit**

```bash
git add extensions/product-tier-pricing/blocks/tier-pricing.liquid
git commit -m "Add image-enriched group data and new markup scaffold for the redesigned widget"
```

---

## Task 3: JS — wire the progress engine into live rendering

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`

**Interfaces:**
- Consumes: `computeProgressState`, `formatCalloutText`, `formatTempBoxLabel`, `unitPriceAtTier`, `totalAtTier`, `buildPromoText` (Task 1); the new `data-tier-pricing-*` scaffold elements (Task 2); `title` from the parsed `data-tiers`/`data-group` JSON (currently always blank until the separate admin-app title-field plan ships and starts writing it — see Task 2's note on `discount_title`)
- Produces: rewritten `renderTierPricing`/`renderWithGroupAwareness` — no new public exports beyond Task 1's

No automated test for this step — matches this file's existing convention (DOM-touching code is gated behind `typeof document !== 'undefined'` and untested; only the pure functions above it are tested). Verified live in Task 6.

- [ ] **Step 1: Replace `renderTierPricing` and remove `renderGroupLinks`**

Replace the entire `renderTierPricing` function (and delete the now-unused `renderGroupLinks` function immediately below it) with:

```js
  function renderTierPricing(container, tiers, moneyFormat, otherQty, title, isGroup) {
    const priceEl = container.querySelector('[data-tier-pricing-price]')
    const messageEl = container.querySelector('[data-tier-pricing-message]')
    const promoEl = container.querySelector('[data-tier-pricing-promo]')
    const cardEl = container.querySelector('[data-tier-pricing-card]')
    const basePrice = Number(container.dataset.basePrice)
    const quantityInput = document.querySelector('input[name="quantity"]')
    const addingQty = quantityInput ? Number(quantityInput.value) || 1 : 1

    if (!tiers || tiers.length === 0) {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
      if (cardEl) cardEl.hidden = true
      if (promoEl) promoEl.textContent = ''
      messageEl.textContent = ''
      return
    }

    const state = computeProgressState(tiers, otherQty || 0, addingQty)
    // The price-per-unit AT THE CURRENT COMBINED QUANTITY (which may sit
    // anywhere within the reached tier's range, not just at its own
    // minQty) — reuse the existing perUnitPrice exactly as the standalone
    // path always has, rather than unitPriceAtTier (Task 1), which is for
    // "price at a SPECIFIC tier's own minQty" (tier buttons/labels), a
    // different question that would silently mis-price anchor tiers here.
    const unit = perUnitPrice(basePrice, state.combinedQty, state.tierState)
    const isDiscounted = state.tierState.fixedPrice != null || state.tierState.percentOff > 0

    if (isDiscounted) {
      priceEl.innerHTML = '<s>' + formatMoney(basePrice, moneyFormat) + '</s> ' + formatMoney(unit, moneyFormat)
    } else {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
    }

    if (promoEl) {
      promoEl.textContent = tiers.length > 1 ? buildPromoText(tiers, basePrice, (n) => formatMoney(n, moneyFormat), isGroup, title) : ''
    }

    if (cardEl) {
      cardEl.hidden = false
      renderProgressCard(container, state, tiers, basePrice, addingQty, moneyFormat)
    }

    messageEl.textContent = formatCalloutText(state, tiers, basePrice, (n) => formatMoney(n, moneyFormat))
  }
```

- [ ] **Step 2: Add `renderProgressCard` — the bar, callout, tier buttons, and dashed box**

Add this new function directly after `renderTierPricing`:

```js
  function renderProgressCard(container, state, tiers, basePrice, addingQty, moneyFormat) {
    const calloutEl = container.querySelector('[data-tier-pricing-callout]')
    const tickEl = container.querySelector('[data-tier-pricing-tick]')
    const cartSegmentEl = container.querySelector('[data-tier-pricing-cart-segment]')
    const addingSegmentEl = container.querySelector('[data-tier-pricing-adding-segment]')
    const dotEl = container.querySelector('[data-tier-pricing-dot]')
    const scaleEl = container.querySelector('[data-tier-pricing-scale]')
    const tiersEl = container.querySelector('[data-tier-pricing-tiers]')

    calloutEl.textContent = formatCalloutText(state, tiers, basePrice, (n) => formatMoney(n, moneyFormat))
    calloutEl.style.left = state.calloutPct + '%'
    tickEl.style.left = state.calloutPct + '%'
    dotEl.style.left = state.calloutPct + '%'
    cartSegmentEl.style.width = state.cartPct + '%'
    addingSegmentEl.style.width = state.addedPct + '%'

    const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
    scaleEl.innerHTML = ''
    const zeroLabel = document.createElement('span')
    zeroLabel.textContent = '0'
    scaleEl.appendChild(zeroLabel)
    sorted.slice(1).forEach((t) => {
      const label = document.createElement('span')
      label.textContent = t.minQty + ' · ' + formatMoney(unitPriceAtTier(basePrice, t), moneyFormat) + ' ea'
      scaleEl.appendChild(label)
    })

    tiersEl.innerHTML = ''
    state.tierButtons.forEach((btn, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'sparkly-tier-pricing__tier-btn' + (btn.active ? ' sparkly-tier-pricing__tier-btn--active' : '')
      el.textContent = btn.minQty + ' x ' + formatMoney(totalAtTier(basePrice, sorted[i]), moneyFormat)
      el.addEventListener('click', () => setQuantityInput(btn.minQty))
      tiersEl.appendChild(el)

      if (state.tempBox && state.tempBox.afterIndex === i) {
        const temp = document.createElement('span')
        temp.className = 'sparkly-tier-pricing__temp-btn'
        temp.textContent = formatTempBoxLabel(state, basePrice, addingQty, (n) => formatMoney(n, moneyFormat))
        tiersEl.appendChild(temp)
      }
    })
  }

  function setQuantityInput(value) {
    const input = document.querySelector('input[name="quantity"]')
    if (!input) return
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
```

- [ ] **Step 3: Parse `title`, and wire the mix-and-match list + toggle**

In `initTierPricing`, find the container's initial data-parsing lines together with the old `renderWithGroupAwareness`/`renderGroupLinks` call site:

```js
      const standaloneTiers = JSON.parse(container.dataset.tiers).tiers
      const moneyFormat = JSON.parse(container.dataset.moneyFormat)
      const group = JSON.parse(container.dataset.group)
      const productHandle = JSON.parse(container.dataset.productHandle)
      const tiers = group ? group.tiers : standaloneTiers
```

and, further down inside the same `containers.forEach` callback:

```js
      async function renderWithGroupAwareness() {
        if (!group) {
          renderTierPricing(container, tiers, moneyFormat)
          return
        }
        const handles = [productHandle].concat(group.siblings.map((s) => s.handle))
        let cartQuantity = 0
        try {
          const cart = await fetchCart()
          cartQuantity = sumGroupQuantityInCart(cart.items, handles)
        } catch {
          cartQuantity = 0
        }
        renderTierPricing(container, tiers, moneyFormat, cartQuantity)
        renderGroupLinks(container, group.siblings)
      }
```

Replace the first block with:

```js
      const standaloneData = JSON.parse(container.dataset.tiers)
      const moneyFormat = JSON.parse(container.dataset.moneyFormat)
      const group = JSON.parse(container.dataset.group)
      const productHandle = JSON.parse(container.dataset.productHandle)
      const tiers = group ? group.tiers : standaloneData.tiers
      const title = group ? group.title : standaloneData.title
```

(`title` is `undefined`/blank until the metafields carry it — `buildPromoText`, Task 1, already handles that gracefully.)

Replace the second block with:

```js
      async function renderWithGroupAwareness() {
        if (!group) {
          renderTierPricing(container, tiers, moneyFormat, 0, title, false)
          return
        }
        const siblingHandles = group.siblings.map((s) => s.handle)
        let otherQty = 0
        try {
          const cart = await fetchCart()
          otherQty = sumGroupQuantityInCart(cart.items, siblingHandles)
        } catch {
          otherQty = 0
        }
        renderTierPricing(container, tiers, moneyFormat, otherQty, title, true)
      }

      const toggleEl = container.querySelector('[data-tier-pricing-toggle]')
      const listEl = container.querySelector('[data-tier-pricing-list]')
      if (toggleEl && listEl && group) {
        let open = false
        toggleEl.addEventListener('click', () => {
          open = !open
          listEl.hidden = !open
          toggleEl.textContent = 'mix & match products ' + (open ? '▲' : '▼')
          if (open) renderMixMatchList(listEl, group.siblings)
        })
      }
```

Note the `sumGroupQuantityInCart(cart.items, siblingHandles)` call now passes **only sibling handles, excluding `productHandle`** — this is the one-line change that shifts the cart sum from "this product + siblings" (the old, cart-only model) to "siblings only" (`otherQty` in the new `addingQty + otherQty` model). `sumGroupQuantityInCart` itself is unchanged. `isGroup` is passed as a literal `false`/`true` at each call site rather than stored on `container` — cleaner than the ad hoc property the previous draft of this step used.

- [ ] **Step 4: Add `renderMixMatchList`**

Add after `setQuantityInput`:

```js
  function renderMixMatchList(listEl, siblings) {
    listEl.innerHTML = ''
    siblings.forEach((s) => {
      const row = document.createElement('a')
      row.href = '/products/' + s.handle
      row.className = 'sparkly-tier-pricing__list-item'

      if (s.imageUrl) {
        const img = document.createElement('img')
        img.src = s.imageUrl
        img.alt = s.title
        img.className = 'sparkly-tier-pricing__list-thumb'
        row.appendChild(img)
      } else {
        const placeholder = document.createElement('span')
        placeholder.className = 'sparkly-tier-pricing__list-thumb sparkly-tier-pricing__list-thumb--placeholder'
        row.appendChild(placeholder)
      }

      const name = document.createElement('span')
      name.className = 'sparkly-tier-pricing__list-name'
      name.textContent = s.title
      row.appendChild(name)

      listEl.appendChild(row)
    })
  }
```

(The design's per-sibling "Qty {n}" label is intentionally omitted here — that field in the design mock is a mocked constant per sibling, not real per-item data the `group` metafield stores. Note this as an open question in Task 6's live verification rather than fabricating a number.)

- [ ] **Step 5: Confirm no stale call sites remain**

Step 3 already updated the only two call sites of `renderTierPricing` (the `!group` branch and the group branch inside `renderWithGroupAwareness`), both now passing the full 6-argument signature (`container, tiers, moneyFormat, otherQty, title, isGroup`). Search the file for `renderTierPricing(` and confirm every call site matches this signature — none should still be calling it with the old 3- or 4-argument form.

- [ ] **Step 6: Verify the file has no syntax errors and existing tests still pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS, all tests (this task doesn't add new pure-function tests — it's wiring — but must not break Task 1's).

- [ ] **Step 7: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js
git commit -m "Wire the progress-state engine into live rendering: bar, callout, tier buttons, dashed box, mix & match list"
```

---

## Task 4: CSS — full visual styling

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.css`
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid` (schema settings + inline custom-property overrides, same pattern as the existing `price_font_size`/`custom_css` settings)
- Modify: `extensions/product-tier-pricing/locales/en.default.schema.json` (labels for the new settings)

**Interfaces:**
- Consumes: theme CSS custom properties confirmed to exist globally: `--color-text-main`, `--color-secondary-text-main`, `--color-borders-main`, `--color-background-main`, `--font-stack-headings`, `--font-stack-body`, `--font-weight-body-bold`, `--border-radius-cards`, `--border-radius-buttons` (all defined in `snippets/head-variables.liquid` in the live theme, `~/Documents/sparkly_tails_theme`)

No automated test — CSS, verified visually in Task 6.

- [ ] **Step 1: Add new block schema settings for the accent colors**

In `extensions/product-tier-pricing/blocks/tier-pricing.liquid`, find the `{% schema %}` block's `"settings"` array and add four color-picker settings after the existing `price_font_size` entry:

```json
    {
      "type": "color",
      "id": "moss_color",
      "label": "t:moss_color_label",
      "default": "#434625"
    },
    {
      "type": "color",
      "id": "cream_color",
      "label": "t:cream_color_label",
      "default": "#f3ecd9"
    },
    {
      "type": "color",
      "id": "sun_color",
      "label": "t:sun_color_label",
      "default": "#ffdc4c"
    },
```

Add matching labels to `extensions/product-tier-pricing/locales/en.default.schema.json`:

```json
{
  "name": "Tier pricing",
  "price_font_size_label": "Price font size",
  "moss_color_label": "Progress bar / accent color",
  "cream_color_label": "Tier card background color",
  "sun_color_label": "\"Adding now\" bar segment color",
  "custom_css_label": "Custom CSS",
  "custom_css_info": "Advanced. Applies only to this block."
}
```

- [ ] **Step 2: Pass the new settings as inline custom properties**

In the block's root `<div>` opening tag (the one with `id="sparkly-tier-pricing-{{ block.id }}"`), find the existing `style="--sparkly-tier-price-font-size: ...px;"` attribute and extend it:

```liquid
  style="--sparkly-tier-price-font-size: {{ block.settings.price_font_size }}px; --sparkly-tier-moss: {{ block.settings.moss_color }}; --sparkly-tier-cream: {{ block.settings.cream_color }}; --sparkly-tier-sun: {{ block.settings.sun_color }};"
```

- [ ] **Step 3: Write the full CSS**

Replace the entire contents of `extensions/product-tier-pricing/assets/tier-pricing.css`:

```css
/* extensions/product-tier-pricing/assets/tier-pricing.css */

.sparkly-tier-pricing {
  --sparkly-tier-ink: var(--color-text-main, #2a2a22);
  --sparkly-tier-text-secondary: var(--color-secondary-text-main, #5b5c4e);
  --sparkly-tier-border: var(--color-borders-main, #ddd6c2);
  --sparkly-tier-moss-tint: color-mix(in srgb, var(--sparkly-tier-moss, #434625) 15%, white);
  --sparkly-tier-track: #fffdf6;
  --sparkly-tier-radius: var(--border-radius-cards, 8px);
  --sparkly-tier-ease: cubic-bezier(0.4, 0, 0.2, 1);
  font-family: var(--font-stack-body);
}

.sparkly-tier-pricing__price-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
}

.sparkly-tier-pricing__price {
  font-family: var(--font-stack-headings);
  font-weight: var(--font-weight-body-bold, 700);
  font-size: var(--sparkly-tier-price-font-size, 2.5rem);
  color: var(--sparkly-tier-ink);
}

.sparkly-tier-pricing__price s {
  font-weight: 600;
  opacity: 0.75;
  text-decoration: line-through;
}

.sparkly-tier-pricing__each-label {
  font-family: var(--font-stack-body);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--sparkly-tier-text-secondary);
}

.sparkly-tier-pricing__promo {
  font-family: var(--font-stack-body);
  font-size: 0.75rem;
  color: var(--sparkly-tier-text-secondary);
  margin: 0 0 10px;
}

.sparkly-tier-pricing__card {
  background: var(--sparkly-tier-cream, #f3ecd9);
  border-radius: var(--sparkly-tier-radius);
  padding: 32px 16px 16px;
  margin: 20px 0;
}

.sparkly-tier-pricing__bar-wrap {
  position: relative;
  margin-bottom: 8px;
}

.sparkly-tier-pricing__callout {
  position: absolute;
  bottom: 20px;
  transform: translateX(-50%);
  white-space: nowrap;
  background: var(--sparkly-tier-ink);
  color: #fff;
  font-family: var(--font-stack-body);
  font-weight: 600;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: var(--sparkly-tier-radius);
}

.sparkly-tier-pricing__tick {
  position: absolute;
  bottom: 2px;
  transform: translateX(-50%);
  width: 1px;
  height: 16px;
  background: var(--sparkly-tier-ink);
}

.sparkly-tier-pricing__track {
  height: 8px;
  background: var(--sparkly-tier-track);
  border-radius: 999px;
  overflow: hidden;
  display: flex;
  position: relative;
}

.sparkly-tier-pricing__segment--cart {
  height: 100%;
  background: var(--sparkly-tier-moss, #434625);
}

.sparkly-tier-pricing__segment--adding {
  height: 100%;
  background: var(--sparkly-tier-sun, #ffdc4c);
  transition: width 200ms var(--sparkly-tier-ease);
}

.sparkly-tier-pricing__dot {
  position: absolute;
  top: -2px;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--sparkly-tier-ink);
  border: 2px solid #fff;
}

.sparkly-tier-pricing__scale {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-stack-body);
  font-size: 11px;
  color: var(--sparkly-tier-text-secondary);
  margin-bottom: 14px;
}

.sparkly-tier-pricing__tiers {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sparkly-tier-pricing__tier-btn {
  padding: 10px 16px;
  border-radius: var(--sparkly-tier-radius);
  font-family: var(--font-stack-body);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--sparkly-tier-border);
  background: #fff;
  color: var(--sparkly-tier-ink);
  transition: border-color 120ms ease, background-color 120ms ease;
}

.sparkly-tier-pricing__tier-btn--active {
  border: 2px solid var(--sparkly-tier-moss, #434625);
  background: var(--sparkly-tier-moss-tint);
}

.sparkly-tier-pricing__temp-btn {
  padding: 10px 16px;
  border-radius: var(--sparkly-tier-radius);
  font-family: var(--font-stack-body);
  font-weight: 600;
  font-size: 13px;
  cursor: default;
  border: 2px dashed color-mix(in srgb, var(--sparkly-tier-moss, #434625) 80%, black);
  background: #fff;
  color: var(--sparkly-tier-ink);
  animation: sparklyTierFadeIn 180ms var(--sparkly-tier-ease);
}

.sparkly-tier-pricing__toggle {
  display: block;
  border: none;
  background: none;
  padding: 10px 0 0;
  margin: 0;
  font-family: var(--font-stack-body);
  font-weight: 600;
  font-size: 12px;
  color: var(--sparkly-tier-moss, #434625);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.sparkly-tier-pricing__list {
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--sparkly-tier-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: sparklyTierFadeIn 160ms var(--sparkly-tier-ease);
}

.sparkly-tier-pricing__list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}

.sparkly-tier-pricing__list-thumb {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 8px;
  object-fit: cover;
  background: var(--sparkly-tier-cream, #f3ecd9);
}

.sparkly-tier-pricing__list-name {
  flex: 1;
  font-family: var(--font-stack-body);
  font-size: 13px;
  color: var(--sparkly-tier-ink);
}

.sparkly-tier-pricing__total {
  min-height: 44px;
  margin-top: 14px;
}

.sparkly-tier-pricing__total-value {
  font-family: var(--font-stack-headings);
  font-weight: 700;
  font-size: 15px;
  color: var(--sparkly-tier-moss, #434625);
}

.sparkly-tier-pricing__total-breakdown {
  font-family: var(--font-stack-body);
  font-size: 12px;
  color: var(--sparkly-tier-text-secondary);
  margin-top: 2px;
}

.sparkly-tier-pricing__message {
  font-size: 0.9em;
  opacity: 0.8;
}

@keyframes sparklyTierFadeIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sparkly-tier-pricing__segment--adding,
  .sparkly-tier-pricing__temp-btn,
  .sparkly-tier-pricing__list {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Notes:
- `color-mix(in srgb, ...)` requires modern browser support (Safari 16.2+, Chrome 111+, all released well before this project's timeframe) — acceptable given this codebase already targets evergreen browsers elsewhere.
- `--sparkly-tier-moss`/`--sparkly-tier-cream`/`--sparkly-tier-sun` are set inline per-instance by the Liquid block (Step 2) from the new schema settings, themselves defaulting to the design's exact hex values — so out of the box, with zero merchant configuration, colors match the design pixel-for-pixel; a merchant can retint via the theme editor without touching code.
- `--font-stack-headings`/`--font-stack-body`, `--color-text-main`, `--color-secondary-text-main`, `--color-borders-main`, `--border-radius-cards` are read directly from the theme's real global variables (no widget-local override) — this block's typography and neutral colors always match whatever the merchant has configured for the rest of the site, per this task's "use the theme" requirement, rather than hardcoding Quicksand/Mulish (fonts this theme doesn't currently load — see this plan's research notes if reintroducing them is ever reconsidered).

- [ ] **Step 4: Verify the block renders without console errors and colors/fonts look reasonable**

Run: `shopify app dev`, load a real product page with this block, open devtools, confirm no CSS-parsing warnings and that `--color-text-main` etc. resolve to non-empty values in the computed styles panel for `.sparkly-tier-pricing`.

- [ ] **Step 5: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.css extensions/product-tier-pricing/blocks/tier-pricing.liquid extensions/product-tier-pricing/locales/en.default.schema.json
git commit -m "Style the redesigned mix & match widget using theme CSS variables and new configurable accent colors"
```

---

## Task 5: Total-row breakdown

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`

**Interfaces:**
- Consumes: `unitPriceAtTier`, `computeProgressState` (Task 1)
- Produces: `computeOrderSummary(basePrice, addingQty, unitPrice)`

- [ ] **Step 1: Write the failing tests**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`:

```js
test('computeOrderSummary: no discount, no savings line', () => {
  const summary = computeOrderSummary(1.49, 3, 1.49)
  assert.equal(summary.total, 4.47)
  assert.equal(summary.fullPrice, 4.47)
  assert.equal(summary.savings, 0)
})

test('computeOrderSummary: discounted unit price reports savings vs full price', () => {
  const summary = computeOrderSummary(1.49, 5, 1.42)
  assert.equal(summary.total, 7.1)
  assert.equal(summary.fullPrice, 7.45)
  assert.equal(summary.savings, 0.35)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — `computeOrderSummary is not defined`.

- [ ] **Step 3: Implement**

Add to `extensions/product-tier-pricing/assets/tier-pricing.js`, after `formatTempBoxLabel`:

```js
function computeOrderSummary(basePrice, addingQty, unitPrice) {
  const total = Math.round(unitPrice * addingQty * 100) / 100
  const fullPrice = Math.round(basePrice * addingQty * 100) / 100
  const savings = Math.round((fullPrice - total) * 100) / 100
  return { total, fullPrice, savings }
}
```

- [ ] **Step 4: Run tests to verify they pass, then wire it into rendering**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js` — expect PASS. Add `computeOrderSummary` to the `require` line and `module.exports`.

In `renderTierPricing` (Task 3), after the block that sets `messageEl.textContent = ...`, add:

```js
    const totalEl = container.querySelector('[data-tier-pricing-total]')
    const totalValueEl = container.querySelector('[data-tier-pricing-total-value]')
    const totalBreakdownEl = container.querySelector('[data-tier-pricing-total-breakdown]')
    if (totalEl) {
      const summary = computeOrderSummary(basePrice, addingQty, unit)
      totalEl.hidden = false
      totalValueEl.textContent = 'Total ' + formatMoney(summary.total, moneyFormat)
      const unitLabel = addingQty === 1 ? ' unit' : ' units'
      let breakdown = addingQty + unitLabel + ' × ' + formatMoney(unit, moneyFormat)
      if (summary.savings > 0) {
        breakdown += ' · full price ' + formatMoney(summary.fullPrice, moneyFormat) + ' — you save ' + formatMoney(summary.savings, moneyFormat)
      }
      totalBreakdownEl.textContent = breakdown
    }
```

(Placed after the `isDiscounted`/`priceEl` block, so `unit` is already in scope. "unit"/"units" is used instead of the design mock's product-specific "pouch"/"pouches" — this widget is generic across every product type in the shop, not just pouches.)

- [ ] **Step 5: Run the full test suite**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing-tests/tier-pricing.test.js
git commit -m "Add total-row breakdown (total, per-unit, savings) to the redesigned widget"
```

---

## Task 6: Version bump

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the version**

Read the current version from `package.json` first (`grep '"version"' package.json`), then bump the minor segment (e.g. `0.16.0` → `0.17.0`) in `package.json`, and both matching occurrences in `package-lock.json` (top-level `version` and the `packages[""]` entry's `version`).

- [ ] **Step 2: Verify**

Run: `grep -n '"version"' package.json package-lock.json | head -5`
Expected: the first three occurrences all show the new version.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Bump version for the mix & match widget redesign"
```

---

## Task 7: Deploy and live verification

Not a code task — manual steps against a real store, following this project's established deploy checklist (this feature touches only `extensions/product-tier-pricing/`, so only the Shopify CLI deploy applies — no Vercel/admin-app deploy is needed or triggered by this work beyond the version-bump commit landing on `main`).

- [ ] **Step 1: Push and deploy**

```bash
git push
nvm use 20.20.2 && shopify app deploy --allow-updates
```

- [ ] **Step 2: Visually compare against the reference screenshot**

Open a real product page with a **standalone** discount configured with 3+ tiers (mirroring `/Users/rubencamposdeteba/Documents/design_handoff_mix_match_widget/screenshots/widget.png`'s layout). Confirm: unit price + "each" label, promo subhead, cream progress card with correctly-positioned callout/dot/bar segments, dynamically-generated tier buttons (one per real configured tier, not hardcoded to 3), dashed preview box appearing/disappearing at the right quantities, total row. Confirm the **mix & match toggle/list does NOT appear** for this standalone product.

- [ ] **Step 3: Verify group mode end-to-end**

Open a product that's part of a **group** discount. Confirm the mix & match toggle appears, expands to show real sibling products with real thumbnail images (or the placeholder if Task 2 Step 1's `all_products` probe failed and the fallback path was used), and that combined-quantity math matches: manually add some quantity of a *sibling* product to the cart via a separate tab/action, reload this page, and confirm the progress bar's moss segment reflects that sibling quantity while the stepper's own value drives the yellow segment — moving the stepper (without submitting) should move the yellow segment and callout live, without a full page reload.

- [ ] **Step 4: Verify graceful degradation**

Load a product with **no discount configured at all** — confirm only a plain price shows, no promo subhead, no card, no total row (all correctly hidden), matching this block's existing "always renders a price" contract.

- [ ] **Step 5: Verify existing integrations still work**

Confirm the Loop Subscriptions purchase-option price polling (switch to "Subscribe & Save" on a product that has it) still updates the widget's price correctly, and that the native quantity stepper's +/- buttons (which don't dispatch native input/change events) still trigger a re-render, exactly as before this change — this task didn't touch either mechanism, but both are worth a real click-through since this is the highest-risk regression surface.

- [ ] **Step 6: Confirm the promo/callout copy with the merchandising/product team**

Per this plan's Global Constraints note — the exact wording ("Mix & match — ", "Buy more, save more — ", "X of Y · Z more for £W", "X combined · £W each") is a first draft. Get sign-off before considering this feature fully shipped, and update `buildPromoText`/`formatCalloutText` (Tasks 1 and 3) if wording changes.
