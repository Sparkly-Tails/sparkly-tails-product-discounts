# Time-Discount Extension Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the pre-per-row ("old shape") reading from the checkout Function, both storefront scripts and both Liquid blocks, now that no live time-based discount uses it and every discount (per product or group) is stored and sent as rows (`items`).

**Architecture:** The Function config and the per-product storefront metafield both carry `items`. The old shape (one shared `pricingMode`/`amount` plus `resolvedMembers` in the Function config; top-level `pricingMode`/`amount`/`variantIds` in the storefront metafield) is read in four places. Each is deleted, and a test per place pins that an old-shape value now applies nothing.

**Tech Stack:** Rust (Shopify Function, `shopify_function` 2.1), plain browser scripts with `node:test`, a jsdom vitest test for the scripts together, Liquid.

**Spec:** `docs/superpowers/specs/2026-10-06-group-time-discount-kind-design.md`, section 7 ("Cleanup that goes with this work"), second half.

**Depends on:** the Group PR (`docs/superpowers/plans/2026-10-06-group-time-discount-kind.md`) being merged first, so that nothing in the admin can still write the old shape. This PR **changes extension code, so the Shopify app must be deployed from its branch before it is merged.**

## Global Constraints

- **Branches and PRs.** Cut a feature branch from `origin/main` (after the Group PR has merged); never commit to `main`. Before every `git push` to an existing branch run `gh pr view <branch> --json state`; if MERGED, cut a new branch and open a new PR. Merging and deploying are the user's.
- **Environment.** Node commands assume `source ~/.nvm/nvm.sh && nvm use 22.23.3`. Rust commands assume `source ~/.cargo/env` and `export CARGO_TARGET_DIR=/Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/extensions/time-based-discount/target` (a shared build cache). Extension tests: `node --test extensions/product-tier-pricing-tests/*.test.js` (the glob is required on Node 22).
- **Version.** Every commit that changes code bumps `package.json` (line 3) and the two top `"version"` fields of `package-lock.json` (lines 3 and 9) to the same value: the next patch above `main`'s current version for Task 1, the next patch again for Task 2.
- **Commits.** End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (a second `-m`).
- **Tests first.** For each task, add the failing test that pins the new behaviour, see it fail, then delete the old code, then see it pass.
- **Shared global scope.** `tier-pricing.js` and `time-based-discount.js` run in ONE browser global scope; keep their top-level names unique (`tierTimeDiscount…` and `countdownDiscount…` prefixes). `tests/storefront/time-discount-scripts.test.ts` has a guard for this; it must keep passing.

## Review Focus

1. **A product still carrying an old-shape storefront metafield** must show no sale price and no wrong countdown, not an error (Task 2 pins: no sale price, countdown alone, as for "no pricing data").
2. **A Function config that is empty, or in the old shape,** applies no discount and does not fail checkout (Task 1).
3. **The two scripts must keep agreeing** on which row applies to a variant (existing tests keep passing).

## File Structure

| File | Change |
|---|---|
| `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs` | Drop `Member`, the legacy `Config` fields and the fallback; update 6 tests, delete 2, add 1 |
| `extensions/product-tier-pricing/assets/tier-pricing.js` | `tierTimeDiscountItems` reads `items` only |
| `extensions/product-tier-pricing/assets/time-based-discount.js` | `countdownDiscountItems` reads `items` only |
| `extensions/product-tier-pricing/blocks/tier-pricing.liquid`, `time-based-discount.liquid` | Stop passing `pricingMode`, `amount`, `variantIds` |
| `extensions/product-tier-pricing-tests/tier-pricing.test.js`, `time-based-discount.test.js`, `tests/storefront/time-discount-scripts.test.ts` | Tests follow |

---

### Task 1: The Function reads `items` only

**Files:**
- Modify: `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs`, `package.json`, `package-lock.json`

- [ ] **Step 1: Branch, bump, and run the baseline**

```bash
cd /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts
git fetch origin && git worktree add .claude/worktrees/ext-cleanup -b chore/time-discount-extension-cleanup origin/main
cd .claude/worktrees/ext-cleanup && ln -s /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/node_modules node_modules
source ~/.cargo/env && export CARGO_TARGET_DIR=/Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/extensions/time-based-discount/target
(cd extensions/time-based-discount && cargo test 2>&1 | tail -4)
```

Bump the version (next patch above `main`). Expected baseline: all Rust tests PASS (14).

- [ ] **Step 2: Write the failing test**

In the `#[cfg(test)] mod tests` of `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs`, next to `an_empty_config_applies_nothing`, add:

```rust
    #[test]
    fn a_config_in_the_old_shape_applies_nothing() -> Result<()> {
        let result = run_with(
            &[cart_line(0, 1, "10.00", 1, 10)],
            r#"{"resolvedMembers":[{"productId":"gid://shopify/Product/1"}],"pricingMode":"percent","amount":50.0}"#,
        )?;
        assert!(result.operations.is_empty());
        Ok(())
    }
```

- [ ] **Step 3: Run it to see it fail**

Run: `(cd extensions/time-based-discount && cargo test a_config_in_the_old_shape 2>&1 | tail -8)`
Expected: FAIL (the legacy fallback turns it into a 50% discount, so `operations` is not empty).

- [ ] **Step 4: Remove the legacy reading**

In the same file:

1. Delete the `Member` struct and its doc comment (the block starting `/// Legacy config shape (saved before per-row pricing)`).
2. Replace the `Config` struct with:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    /// Per-row pricing: each product or variant with its own price rule.
    #[shopify_function(default)]
    items: Vec<Item>,
}
```

3. In `cart_lines_discounts_generate_run`, delete the whole block from the comment `// A config saved before per-row pricing has one shared rule for all its` through the line `let items: &[Item] = if config.items.is_empty() { &legacy_items } else { &config.items };`, and put in its place:

```rust
    let items: &[Item] = &config.items;
```

The `if items.is_empty() { return ... }` that follows stays.

- [ ] **Step 5: Bring the existing tests to the `items` shape**

Six tests build their config in the old shape; the Function now ignores it. In each, replace the three lines `"resolvedMembers": …, "pricingMode": …, "amount": …` with one `"items"` entry carrying the same rule:

| Test | Replace with (inside `"jsonValue": { … }`) |
|---|---|
| `applies_a_percent_discount_to_a_matching_line` | `"items": [{ "productId": "gid://shopify/Product/1", "pricingMode": "percent", "amount": 25.0 }]` |
| `applies_a_fixed_price_discount_to_a_matching_line` | `"items": [{ "productId": "gid://shopify/Product/1", "pricingMode": "fixed", "amount": 7.50 }]` |
| `a_fixed_price_above_sticker_price_never_produces_a_markup` | `"items": [{ "productId": "gid://shopify/Product/1", "pricingMode": "fixed", "amount": 20.00 }]` |
| `ignores_a_line_whose_product_is_not_in_resolved_members` | `"items": [{ "productId": "gid://shopify/Product/1", "pricingMode": "percent", "amount": 25.0 }]` and rename the test to `ignores_a_line_whose_product_is_not_in_items` |
| `matches_a_specific_variant_only_when_variant_id_is_present` | `"items": [{ "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/901", "pricingMode": "percent", "amount": 25.0 }]`; in its assertion message replace `resolvedMembers entry` with `items entry` |
| `matches_a_specific_variant_when_the_ids_agree` | same `items` entry as the row above; in its assertion message replace `resolvedMembers entry` with `items entry` |

Delete these two tests entirely: `a_legacy_config_applies_its_one_rule_to_every_member` and `items_take_precedence_over_legacy_fields_when_both_are_present`.

- [ ] **Step 6: Run the tests**

Run: `(cd extensions/time-based-discount && cargo test 2>&1 | tail -6)`
Expected: all PASS — 13 tests (14, minus the 2 deleted, plus the new one). Then `grep -n "resolved_members\|resolvedMembers\|legacy\|Legacy" extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs` must print nothing except the new test's name and config line.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "chore: the checkout Function reads per-row items only" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scripts and Liquid read `items` only

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`, `extensions/product-tier-pricing/assets/time-based-discount.js`, `extensions/product-tier-pricing/blocks/tier-pricing.liquid`, `extensions/product-tier-pricing/blocks/time-based-discount.liquid`, `extensions/product-tier-pricing-tests/tier-pricing.test.js`, `extensions/product-tier-pricing-tests/time-based-discount.test.js`, `tests/storefront/time-discount-scripts.test.ts`, `package.json`, `package-lock.json`

- [ ] **Step 1: Bump the version (next patch above Task 1's).**

- [ ] **Step 2: Write the failing tests**

In `extensions/product-tier-pricing-tests/tier-pricing.test.js` **replace** the two tests `'tierTimeDiscountItems: an older metafield becomes one row per covered variant, or one whole-product row'` and `'tierTimeDiscountItems: no rows without pricing data'` with:

```js
test('tierTimeDiscountItems: a metafield in the old shape has no rows, so it shows no sale', () => {
  assert.deepEqual(tierTimeDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: null }), [])
  assert.deepEqual(tierTimeDiscountItems({ pricingMode: 'fixed', amount: 22, variantIds: [V10, V11] }), [])
  assert.deepEqual(tierTimeDiscountItems({}), [])
})
```

Replace the test `'timeDiscountSalePrice: an older single-rule metafield still works'` with:

```js
test('timeDiscountSalePrice: a metafield in the old shape shows no sale', () => {
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: null }, variantId: '1' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: [V10] }, variantId: 10 }), null)
})
```

In the test `'timeDiscountSalePrice: null without pricing data, …'` change `discount: { pricingMode: null, amount: null, variantIds: null }` to `discount: {}`.

In `extensions/product-tier-pricing-tests/time-based-discount.test.js` replace the test `'countdownDiscountItems: current metafields carry rows; an older single-rule metafield becomes rows; no pricing means no rows'` with:

```js
test('countdownDiscountItems: current metafields carry rows; the old shape and no data mean no rows', () => {
  const items = [{ variantId: CV10, pricingMode: 'fixed', amount: 22 }]
  assert.deepEqual(countdownDiscountItems({ items }), items)
  assert.deepEqual(countdownDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: null }), [])
  assert.deepEqual(countdownDiscountItems({ pricingMode: 'fixed', amount: 22, variantIds: [CV10] }), [])
  assert.deepEqual(countdownDiscountItems({}), [])
})
```

and rename the test `'paintCountdown: shows the countdown alone when there is no pricing data (older metafield)'` to `'… (no rows)'`.

In `tests/storefront/time-discount-scripts.test.ts` replace the test `'still understands a metafield written before per-row pricing'` with (note `mount` deliberately passes the old keys through, so this proves they are ignored):

```ts
  it('does not read a metafield in the old shape: no sale price, the countdown alone', () => {
    mount({ ...live, pricingMode: 'fixed', amount: 22, variantIds: [V10] }, { selectedVariantId: 10 })
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: true })
  })
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --test extensions/product-tier-pricing-tests/*.test.js 2>&1 | grep -E "^# (pass|fail)"` and `npx vitest run tests/storefront`
Expected: the new/changed tests FAIL (the scripts still convert the old shape into rows).

- [ ] **Step 4: Simplify the scripts**

In `extensions/product-tier-pricing/assets/tier-pricing.js` replace the comment and function `tierTimeDiscountItems` (the block from `// Rows of a time-based discount for ONE product:` to the closing brace of the function) with:

```js
// Rows of a time-based discount for ONE product: [{ variantId: string|null,
// pricingMode, amount }]. Named with a tier prefix because this file shares one
// global scope with time-based-discount.js.
function tierTimeDiscountItems(discount) {
  return Array.isArray(discount.items) ? discount.items : []
}
```

In `extensions/product-tier-pricing/assets/time-based-discount.js` do the same for `countdownDiscountItems`:

```js
// Rows of a time-based discount for ONE product: [{ variantId: string|null,
// pricingMode, amount }]. Named with a countdown prefix because this file
// shares one global scope with tier-pricing.js.
function countdownDiscountItems(discount) {
  return Array.isArray(discount.items) ? discount.items : []
}
```

and change the comment above `discountApplies` in the same file from `// null = no pricing data (older metafield): countdown only.` to `// null = no rows for this product: countdown only.`

- [ ] **Step 5: Stop passing the old keys from the Liquid blocks**

In `extensions/product-tier-pricing/blocks/time-based-discount.liquid` delete the three lines that start `"pricingMode":`, `"amount":` and `"variantIds":` (the `"items":` line after them stays).

In `extensions/product-tier-pricing/blocks/tier-pricing.liquid` delete the three lines that start `"pricingMode": {% if time_discount_metafield…`, `"amount": {% if time_discount_metafield…` and `"variantIds": {% if time_discount_metafield…`. The `"items":` line is then the last entry of that JSON object and already has no trailing comma; the `"endsAt": …,` line before it keeps its comma.

- [ ] **Step 6: Run everything**

```bash
node --test extensions/product-tier-pricing-tests/*.test.js 2>&1 | grep -E "^# (pass|fail)"
npx vitest run
npx tsc --noEmit -p . && npx eslint src tests
grep -rn "variantIds" extensions/product-tier-pricing/assets extensions/product-tier-pricing/blocks
```

Expected: node tests all pass (`# fail 0`); all vitest tests PASS, including the "share one global scope" guard; no tsc/eslint output; the final `grep` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json extensions/product-tier-pricing extensions/product-tier-pricing-tests tests/storefront
git commit -m "chore: the storefront scripts and blocks read per-row items only" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Open the PR and hand over the deploy

- [ ] **Step 1: Final checks**

```bash
source ~/.cargo/env && export CARGO_TARGET_DIR=/Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/extensions/time-based-discount/target
(cd extensions/time-based-discount && cargo test 2>&1 | tail -3)
npx next build --webpack 2>&1 | grep -E "Compiled|rror"
```

Expected: 13 Rust tests PASS; the build prints `Compiled successfully`.

- [ ] **Step 2: Check the PR state, push, open the PR**

```bash
gh pr view chore/time-discount-extension-cleanup --json state 2>/dev/null || true   # must not be MERGED
git push -u origin chore/time-discount-extension-cleanup
gh pr create --base main --title "chore: remove the pre-per-row reading from the Function, scripts and blocks"
```

The PR body must say, at the top, in bold: **this PR changes extension code: deploy the Shopify app from this branch with `shopify app deploy --config shopify.app.toml` BEFORE merging**, and that nothing live uses the old shape (no live time-based discount existed when the group work started). Include the test counts (Rust 13, node, vitest) and that it needs a non-author review.

- [ ] **Step 3: The user deploys and merges**

1. The user runs `shopify app deploy --config shopify.app.toml` from this branch, then `shopify app versions list --config shopify.app.toml` to confirm the new version is active.
2. After a non-author review the user merges the PR (`bash scripts/merge-pr-stack.sh` can do it once it is approved and green).
3. Manual check on the live store: open one product that has a time discount, and confirm its sale price, its countdown, and its checkout price still show.
