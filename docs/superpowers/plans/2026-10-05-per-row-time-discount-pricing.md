# Per-Row Time-Based Discount Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A time-based discount becomes a title + schedule + a table of products/variants that each carry their own fixed price or percentage, edited on one autosaving page with a "Saved" pill.

**Architecture:** Rows (`items`) become the source of truth. Delivery is two PRs: **PR 1 (engine, backwards compatible)** teaches the checkout Function, the storefront metafield sync and both storefront scripts about per-row prices while the existing admin keeps working untouched; **PR 2 (admin)** switches the stored model to rows and replaces the admin page. Old stored discounts are converted to rows in memory on read, so nothing needs a data migration.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind v4 (admin), vitest + React Testing Library + jsdom, Rust Shopify Function (`cargo test`), plain browser scripts and Liquid theme blocks (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-05-per-row-time-discount-pricing-design.md`

## How this plan was verified

Every code block below was built and run in a scratch git worktree before being written here, one commit per task, in the order shown. The scratch results are the "expected" results in each task: **PR 1 end:** 208 vitest tests (20 files), 135 `node --test` tests, 14 Rust tests; **PR 2 end:** 260 vitest tests (23 files; 209 and 261 once PR 1's final review added a shared-scope guard test), `tsc --noEmit` clean, `next build --webpack` succeeds, and the editor was rendered with the real compiled CSS and checked visually. Nothing from the scratch worktree is in this repository. If a step in your copy disagrees with the expected result, stop and report it rather than adjusting the code.

## Global Constraints

- **Workflow:** never commit to `main`. Each PR is its own branch, opened as a PR, and needs a review from someone other than its author before merging.
- **Deploy:** production is `shopify.app.toml`. Always `shopify app deploy --config shopify.app.toml` (a plain `shopify app deploy` defaulted to the demo app once and the live store stayed on the old version). Check the live asset URL's version afterwards.
- **Spec §3.4:** deleting a row or the whole discount asks for confirmation (native `confirm()`).
- **Spec §5.5:** the "Saved" pill is a small rounded-corner rectangle that slides down from above the top edge to about 50 px, stays 4 seconds, slides back up above the top of the window and is removed from the DOM; a second save restarts the 4 seconds; errors never use the pill.
- **Spec §4.1:** a fixed price must be lower than the row's regular price; a product/variant appears once per discount; a whole-product row cannot coexist with variant rows of the same product; a product/variant cannot belong to another time or tier discount.
- **Spec §6.2:** the Function config guard stays 9,500 bytes (`FUNCTION_CONFIG_MAX_BYTES`); a discount over it fails to save with a clear message.
- **Spec §7.2:** the two storefront scripts share one global scope on the page — every top-level name must be unique across `tier-pricing.js` and `time-based-discount.js` (hence the `tierTimeDiscount…` and `countdownDiscount…` prefixes).
- **Spec §5.1.3:** product names link to `https://{SHOPIFY_SHOP}/admin/products/{numericId}` and open in a new tab; edit/delete are light-grey icon buttons (inline SVG, no icon library).
- **Spec §4.1:** one Title field; the legacy `name` is kept equal to `title` on every title save and is never shown.
- **No new dependencies.**
- Run every command from the repository root unless a step says otherwise. Use `zsh`/`bash`; the first `cargo test` compiles dependencies (about a minute).

## Review Focus

Behaviours the spec implies that are most likely to bite a person using this, each pinned by a test in the task that owns the code:

1. **A product with only a time discount and a variant-specific row, on first page load** — the price script did not know the selected variant until a variant change, so the sale price was missing at first paint. Fixed in Task 4; test "uses the selected variant from first paint, not only after a variant change".
2. **Two autosaves overlapping** — every save rewrites the single shop-config metafield, so overlapping saves could overwrite each other. Task 9; tests in `useSaveQueue.test.ts` and "does not start a row save until the title save has finished".
3. **A discount too large for the Function config** — Shopify then silently applies nothing at checkout while the admin shows it active. Tasks 5 and 9; tests "rejects a discount that would exceed the guard" and "rejects a row that would not fit the Function config".
4. **Discounts saved before this change (including collection-based ones) during rollout** — they must keep working at checkout and on the storefront until re-saved. Tasks 1, 2, 4 and 9; tests for the legacy config shape in Rust, legacy metafield shape in both scripts, and `normalizeTimeDiscount`.
5. **A removed row leaving a stale sale price on the storefront** — Task 9; tests "clears the product's storefront metafield when it has no rows left" and "re-syncs instead of clearing when the product still has other variant rows".
6. **A product Shopify can no longer find** — the page still shows its row (with dashes) so it can be removed; checked manually in the PR 2 hand-off (the page is a server component).

---

# PR 1 — Engine (backwards compatible)

Branch: `feat/per-row-time-discount-engine`, from the latest `main`.

```bash
git checkout main && git pull origin main && git checkout -b feat/per-row-time-discount-engine
```

Nothing the merchant sees changes in PR 1: the existing admin is not touched, and a discount saved by it is read as one row per product carrying its one shared price. **Deploy order for PR 1:** Vercel deploys `main` automatically when the PR is merged, so "app first, then Vercel" is only possible if the Shopify app is deployed **before merging**: run `shopify app deploy --config shopify.app.toml` from the reviewed PR branch (its Function and theme scripts read both the old and the new shapes, so this is safe against the current admin), confirm the new version is active, and only then merge. If the merge comes first, a time-discount save in the existing admin during the gap writes the new metafield shape that the old live scripts cannot read (the countdown would show on variants the discount does not cover and no sale price would show) until the app deploy; checkout prices are unaffected.


### Task 1: One reader for a discount's price rows

**Files:**
- Modify: `src/timeDiscounts/config.ts`
- Test: `tests/timeDiscounts/config.test.ts`

**Interfaces:**
- Consumes: the existing `TimeDiscount` and `DiscountMember` types.
- Produces: `TimeDiscountItem` (`{ productId: string; variantId?: string; pricingMode: 'percent' | 'fixed'; amount: number }`), the optional `items?: TimeDiscountItem[]` field on `TimeDiscount`, and `getDiscountItems(discount): TimeDiscountItem[]` — returns stored `items`, or one row per `resolvedMembers` entry carrying the discount's `pricingMode`/`amount`. Task 3 consumes it. (Task 9 replaces it with `normalizeTimeDiscount`.)

- [ ] **Step 1: Write the failing tests**

`tests/timeDiscounts/config.test.ts` — apply this change:

```diff
diff --git a/tests/timeDiscounts/config.test.ts b/tests/timeDiscounts/config.test.ts
index 3bf90e3..ae41742 100644
--- a/tests/timeDiscounts/config.test.ts
+++ b/tests/timeDiscounts/config.test.ts
@@ -1,6 +1,6 @@
 import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
 import {
-  getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, pricesUniform, fixedPriceNotLowerError,
+  getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, pricesUniform, fixedPriceNotLowerError, getDiscountItems,
   computeTimeDiscountStatusLabel, type TimeDiscountsConfig,
 } from '@/timeDiscounts/config'
 import * as shopifyClient from '@/lib/shopify-client'
@@ -186,3 +186,35 @@ describe('fixedPriceNotLowerError', () => {
     expect(fixedPriceNotLowerError('fixed', 25, 0)).toBeNull()
   })
 })
+
+describe('getDiscountItems', () => {
+  const base = {
+    pricingMode: 'fixed' as const,
+    amount: 22,
+    resolvedMembers: [
+      { productId: 'gid://shopify/Product/1' },
+      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
+    ],
+  }
+
+  it('turns each resolved member of an older discount into a row carrying the discount\'s one shared rule', () => {
+    expect(getDiscountItems(base)).toEqual([
+      { productId: 'gid://shopify/Product/1', pricingMode: 'fixed', amount: 22 },
+      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'fixed', amount: 22 },
+    ])
+  })
+
+  it('omits variantId on whole-product rows instead of writing undefined', () => {
+    const [whole] = getDiscountItems(base)
+    expect('variantId' in whole).toBe(false)
+  })
+
+  it('returns stored items as they are, ignoring the older fields', () => {
+    const items = [{ productId: 'gid://shopify/Product/9', pricingMode: 'percent' as const, amount: 10 }]
+    expect(getDiscountItems({ ...base, items })).toBe(items)
+  })
+
+  it('returns no rows for a discount with no members', () => {
+    expect(getDiscountItems({ ...base, resolvedMembers: [] })).toEqual([])
+  })
+})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/timeDiscounts/config.test.ts`
Expected: FAIL — `getDiscountItems` is not exported from `@/timeDiscounts/config`.

- [ ] **Step 3: Implement**

`src/timeDiscounts/config.ts` — apply this change:

```diff
diff --git a/src/timeDiscounts/config.ts b/src/timeDiscounts/config.ts
index 5e6135d..c6b3c44 100644
--- a/src/timeDiscounts/config.ts
+++ b/src/timeDiscounts/config.ts
@@ -7,6 +7,16 @@ export interface DiscountMember {
   variantId?: string
 }
 
+/** One product or variant with its OWN price rule. */
+export interface TimeDiscountItem {
+  productId: string
+  /** Omitted = the whole (single-variant) product. */
+  variantId?: string
+  pricingMode: 'percent' | 'fixed'
+  /** Percent off (0 < n <= 100), or the final price in major currency units. */
+  amount: number
+}
+
 export type TimeDiscountSelection =
   | { mode: 'products'; members: DiscountMember[] }
   | { mode: 'collections'; collectionIds: string[] }
@@ -29,6 +39,12 @@ export interface TimeDiscount {
   selection: TimeDiscountSelection
   /** Function-facing snapshot, recomputed at save time from `selection` (see spec §3, §5). The Function only ever reads this. */
   resolvedMembers: DiscountMember[]
+  /**
+   * Per-row pricing. Not stored yet — a discount saved before per-row pricing
+   * has none, and its resolvedMembers all share the discount's one
+   * pricingMode/amount. Always read it through getDiscountItems().
+   */
+  items?: TimeDiscountItem[]
 }
 
 export interface TimeDiscountsConfig {
@@ -83,6 +99,23 @@ export async function saveTimeDiscountsConfig(config: TimeDiscountsConfig): Prom
   }
 }
 
+/**
+ * The discount's price rows: its stored `items`, or — for a discount saved
+ * before per-row pricing — one row per resolved member carrying the
+ * discount's single shared pricingMode/amount.
+ */
+export function getDiscountItems(
+  discount: Pick<TimeDiscount, 'pricingMode' | 'amount' | 'resolvedMembers' | 'items'>,
+): TimeDiscountItem[] {
+  if (discount.items) return discount.items
+  return discount.resolvedMembers.map((member) => ({
+    productId: member.productId,
+    ...(member.variantId ? { variantId: member.variantId } : {}),
+    pricingMode: discount.pricingMode,
+    amount: discount.amount,
+  }))
+}
+
 /**
  * True when (productId, variantId) isn't already a resolvedMembers entry of
  * another time discount. Same matching rule as the existing app's
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run tests/timeDiscounts/config.test.ts && npx tsc --noEmit -p .`
Expected: 25 tests pass in that file; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/config.ts tests/timeDiscounts/config.test.ts
git commit -m "feat: getDiscountItems — one reader for a discount's price rows"
```


### Task 2: The checkout Function applies each item's own price rule

**Files:**
- Modify: `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs`

**Interfaces:**
- Consumes: the Function's existing GraphQL input (unchanged — `cart.lines` and the discount's `sparkly_time_discounts.function_config` metafield).
- Produces: a Function that accepts the new config `{ "items": [{ "productId", "variantId"?, "pricingMode", "amount" }] }` **and** the legacy config `{ "resolvedMembers": [...], "pricingMode", "amount" }`. For each cart line the variant's own row wins, else the whole-product row (no `variantId`). Fixed clamp and messages are unchanged.

- [ ] **Step 1: Write the failing tests**

Add these to the existing `mod tests` in `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs`, just before the module's closing `}` (the existing 7 tests stay as they are):

```rust
    // --- per-row pricing -------------------------------------------------

    fn cart_line(id: u32, quantity: u32, price: &str, product: u32, variant: u32) -> String {
        format!(
            r#"{{"id":"gid://shopify/CartLine/{id}","quantity":{quantity},"cost":{{"amountPerQuantity":{{"amount":"{price}"}}}},"merchandise":{{"__typename":"ProductVariant","id":"gid://shopify/ProductVariant/{variant}","product":{{"id":"gid://shopify/Product/{product}"}}}}}}"#
        )
    }

    fn run_with(lines: &[String], config_json: &str) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
        let input = format!(
            r#"{{"cart":{{"lines":[{}]}},"discount":{{"discountClasses":["PRODUCT"],"metafield":{{"jsonValue":{}}}}}}}"#,
            lines.join(","),
            config_json
        );
        run_function_with_input(cart_lines_discounts_generate_run, &input)
    }

    fn candidates_of(result: &schema::CartLinesDiscountsGenerateRunResult) -> Vec<&schema::ProductDiscountCandidate> {
        match result.operations.first() {
            Some(schema::CartOperation::ProductDiscountsAdd(op)) => op.candidates.iter().collect(),
            _ => vec![],
        }
    }

    fn percent_of(candidate: &schema::ProductDiscountCandidate) -> f64 {
        match &candidate.value {
            schema::ProductDiscountCandidateValue::Percentage(p) => p.value.0,
            _ => panic!("expected Percentage"),
        }
    }

    fn fixed_amount_of(candidate: &schema::ProductDiscountCandidate) -> f64 {
        match &candidate.value {
            schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
            _ => panic!("expected FixedAmount"),
        }
    }

    #[test]
    fn each_item_applies_its_own_price_rule() -> Result<()> {
        // Product 1: 20% off. Product 2: fixed price 30.00 on a 40.00 line, qty 2 -> (40-30)*2 = 20.00 off.
        let result = run_with(
            &[cart_line(0, 1, "10.00", 1, 10), cart_line(1, 2, "40.00", 2, 20)],
            r#"{"items":[
                {"productId":"gid://shopify/Product/1","pricingMode":"percent","amount":20.0},
                {"productId":"gid://shopify/Product/2","pricingMode":"fixed","amount":30.0}
            ]}"#,
        )?;
        let found = candidates_of(&result);
        assert_eq!(found.len(), 2);
        assert_eq!(percent_of(found[0]), 20.0);
        assert_eq!(found[0].message.as_deref(), Some("20% off"));
        assert_eq!(fixed_amount_of(found[1]), 20.0);
        assert_eq!(found[1].message.as_deref(), Some("£30.00 each"));
        Ok(())
    }

    #[test]
    fn a_variants_own_row_beats_the_whole_product_row() -> Result<()> {
        // Product 1 has a whole-product row (10% off) and a row for variant 10 (fixed 5.00).
        let result = run_with(
            &[cart_line(0, 1, "20.00", 1, 10), cart_line(1, 1, "20.00", 1, 11)],
            r#"{"items":[
                {"productId":"gid://shopify/Product/1","pricingMode":"percent","amount":10.0},
                {"productId":"gid://shopify/Product/1","variantId":"gid://shopify/ProductVariant/10","pricingMode":"fixed","amount":5.0}
            ]}"#,
        )?;
        let found = candidates_of(&result);
        assert_eq!(found.len(), 2);
        assert_eq!(fixed_amount_of(found[0]), 15.0); // variant 10 uses its own fixed row
        assert_eq!(percent_of(found[1]), 10.0); // variant 11 falls back to the whole-product row
        Ok(())
    }

    #[test]
    fn lines_without_a_matching_item_are_untouched() -> Result<()> {
        // Only variant 10 of product 1 has a row; variant 11 and product 3 do not.
        let result = run_with(
            &[cart_line(0, 1, "20.00", 1, 11), cart_line(1, 1, "20.00", 3, 30)],
            r#"{"items":[{"productId":"gid://shopify/Product/1","variantId":"gid://shopify/ProductVariant/10","pricingMode":"percent","amount":50.0}]}"#,
        )?;
        assert!(result.operations.is_empty());
        Ok(())
    }

    #[test]
    fn a_fixed_item_priced_at_or_above_the_line_price_applies_no_discount() -> Result<()> {
        let result = run_with(
            &[cart_line(0, 1, "20.00", 1, 10), cart_line(1, 1, "20.00", 2, 20)],
            r#"{"items":[
                {"productId":"gid://shopify/Product/1","pricingMode":"fixed","amount":25.0},
                {"productId":"gid://shopify/Product/2","pricingMode":"fixed","amount":20.0}
            ]}"#,
        )?;
        assert!(result.operations.is_empty());
        Ok(())
    }

    #[test]
    fn a_legacy_config_applies_its_one_rule_to_every_member() -> Result<()> {
        let result = run_with(
            &[cart_line(0, 1, "10.00", 1, 10), cart_line(1, 1, "10.00", 2, 20)],
            r#"{"resolvedMembers":[
                {"productId":"gid://shopify/Product/1"},
                {"productId":"gid://shopify/Product/2"}
            ],"pricingMode":"percent","amount":15.0}"#,
        )?;
        let found = candidates_of(&result);
        assert_eq!(found.len(), 2);
        assert_eq!(percent_of(found[0]), 15.0);
        assert_eq!(percent_of(found[1]), 15.0);
        Ok(())
    }

    #[test]
    fn items_take_precedence_over_legacy_fields_when_both_are_present() -> Result<()> {
        let result = run_with(
            &[cart_line(0, 1, "10.00", 1, 10)],
            r#"{"items":[{"productId":"gid://shopify/Product/1","pricingMode":"percent","amount":10.0}],
                "resolvedMembers":[{"productId":"gid://shopify/Product/1"}],"pricingMode":"percent","amount":50.0}"#,
        )?;
        let found = candidates_of(&result);
        assert_eq!(found.len(), 1);
        assert_eq!(percent_of(found[0]), 10.0);
        Ok(())
    }

    #[test]
    fn an_empty_config_applies_nothing() -> Result<()> {
        let result = run_with(&[cart_line(0, 1, "10.00", 1, 10)], r#"{"items":[]}"#)?;
        assert!(result.operations.is_empty());
        Ok(())
    }
```

- [ ] **Step 2: Run the tests and watch the new ones fail**

Run: `cd extensions/time-based-discount && cargo test`  (the first run compiles dependencies, about a minute; if `cargo` is not on your PATH, `source ~/.cargo/env`)
Expected: `test result: FAILED. 11 passed; 3 failed`. The three that fail are `each_item_applies_its_own_price_rule`, `a_variants_own_row_beats_the_whole_product_row` and `items_take_precedence_over_legacy_fields_when_both_are_present` (the Function ignores `items` today). The other new tests pass already because they pin behaviour that is the same before and after: `lines_without_a_matching_item_are_untouched`, `a_fixed_item_priced_at_or_above_the_line_price_applies_no_discount`, `a_legacy_config_applies_its_one_rule_to_every_member`, `an_empty_config_applies_nothing`.

- [ ] **Step 3: Implement**

Replace **everything above** `#[cfg(test)]` in that file with the code below (the `mod tests` block and its 7 existing tests stay untouched; your new tests from Step 1 stay in it):

```rust
use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::HashMap;

/// Legacy config shape (saved before per-row pricing): one product/variant
/// with no price rule of its own — the config's shared rule applies.
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Member {
    product_id: String,
    #[shopify_function(default)]
    variant_id: Option<String>,
}

/// One product or variant with its OWN price rule (current config shape).
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Item {
    product_id: String,
    /// Absent = the whole (single-variant) product.
    #[shopify_function(default)]
    variant_id: Option<String>,
    /// "percent" | "fixed"
    #[shopify_function(default)]
    pricing_mode: String,
    /// Percent-off, or the fixed per-unit price — meaning depends on pricing_mode.
    #[shopify_function(default)]
    amount: f64,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    /// Per-row pricing. Takes precedence over the legacy fields below.
    #[shopify_function(default)]
    items: Vec<Item>,
    /// Legacy: every member shares `pricing_mode`/`amount`.
    #[shopify_function(default)]
    resolved_members: Vec<Member>,
    #[shopify_function(default)]
    pricing_mode: String,
    #[shopify_function(default)]
    amount: f64,
}

/// The variant's own row wins; otherwise the whole-product row (no variant id).
fn select_item<'a>(candidates: &[&'a Item], variant_id: &str) -> Option<&'a Item> {
    candidates
        .iter()
        .copied()
        .find(|item| item.variant_id.as_deref() == Some(variant_id))
        .or_else(|| candidates.iter().copied().find(|item| item.variant_id.is_none()))
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let has_product_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product);

    if !has_product_discount_class {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    // No status check here: Shopify only invokes this Function at all once
    // this specific discount's native startsAt/endsAt window is open (see
    // spec §5) — there is nothing left for the Function itself to verify
    // about timing.
    let config: &Config = match input.discount().metafield() {
        Some(metafield) => metafield.json_value(),
        None => return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] }),
    };

    // A config saved before per-row pricing has one shared rule for all its
    // members; treat each member as an item carrying that rule.
    let legacy_items: Vec<Item> = if config.items.is_empty() {
        config
            .resolved_members
            .iter()
            .map(|member| Item {
                product_id: member.product_id.clone(),
                variant_id: member.variant_id.clone(),
                pricing_mode: config.pricing_mode.clone(),
                amount: config.amount,
            })
            .collect()
    } else {
        vec![]
    };
    let items: &[Item] = if config.items.is_empty() { &legacy_items } else { &config.items };

    if items.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    // Build a product_id -> items index once, so each cart line does an O(1)
    // HashMap lookup instead of a full linear scan of the items. This is the
    // checkout hot path (invoked on every cart recalculation).
    let mut items_by_product: HashMap<&str, Vec<&Item>> = HashMap::new();
    for item in items {
        items_by_product.entry(item.product_id.as_str()).or_default().push(item);
    }

    let mut candidates = vec![];

    for line in input.cart().lines().iter() {
        let variant = match line.merchandise() {
            schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
            _ => continue,
        };
        let product_id = variant.product().id();
        let variant_id = variant.id();

        let item = match items_by_product
            .get(product_id.as_str())
            .and_then(|candidates| select_item(candidates, variant_id))
        {
            Some(item) => item,
            None => continue,
        };

        let price = line.cost().amount_per_quantity().amount().as_f64();

        if item.pricing_mode == "fixed" {
            // Clamp to the line's own price, same fail-safe as the existing
            // Function: never produce a negative discount (a markup).
            let fixed_price = item.amount.min(price);
            let discount_amount = ((price - fixed_price) * (*line.quantity() as f64) * 100.0).round() / 100.0;
            if discount_amount <= 0.0 {
                continue;
            }
            candidates.push(schema::ProductDiscountCandidate {
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget { id: line.id().clone(), quantity: None },
                )],
                message: Some(format!("£{:.2} each", fixed_price)),
                value: schema::ProductDiscountCandidateValue::FixedAmount(
                    schema::ProductDiscountCandidateFixedAmount {
                        amount: Decimal(discount_amount),
                        applies_to_each_item: Some(false),
                    },
                ),
                associated_discount_code: None,
                prerequisites: None,
            });
        } else {
            candidates.push(schema::ProductDiscountCandidate {
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget { id: line.id().clone(), quantity: None },
                )],
                message: Some(format!("{}% off", item.amount)),
                value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(item.amount),
                }),
                associated_discount_code: None,
                prerequisites: None,
            });
        }
    }

    if candidates.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    Ok(schema::CartLinesDiscountsGenerateRunResult {
        operations: vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::All,
                candidates,
            },
        )],
    })
}
```

- [ ] **Step 4: Run the tests**

Run: `cd extensions/time-based-discount && cargo test`
Expected: `test result: ok. 14 passed; 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "feat: checkout Function applies each item's own price rule"
```


### Task 3: Sync each product's price rows to its storefront metafield

**Files:**
- Modify: `src/timeDiscounts/metafieldSync.ts`
- Test: `tests/timeDiscounts/metafieldSync.test.ts`

**Interfaces:**
- Consumes: `getDiscountItems` and `TimeDiscount` from Task 1.
- Produces: `product.metafields.sparkly_product_discounts.time_based_discount` now holds `{ discountId, title, startsAt, endsAt, items: [{ variantId: string | null, pricingMode, amount }] }` with **only that product's** rows. Task 4's scripts read it. `syncTimeDiscountMetafields(discount, timeZone)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

`tests/timeDiscounts/metafieldSync.test.ts` — apply this change:

```diff
diff --git a/tests/timeDiscounts/metafieldSync.test.ts b/tests/timeDiscounts/metafieldSync.test.ts
index 7b5b429..8534ec3 100644
--- a/tests/timeDiscounts/metafieldSync.test.ts
+++ b/tests/timeDiscounts/metafieldSync.test.ts
@@ -22,7 +22,7 @@ function writtenMetafields(spy: { mock: { calls: unknown[][] } }): MetafieldCall
 describe('syncTimeDiscountMetafields', () => {
   beforeEach(() => vi.restoreAllMocks())
 
-  it('writes one metafield per unique product to the namespace/key the Liquid block reads, with dates as real UTC instants', async () => {
+  it('writes one metafield per unique product to the namespace/key the Liquid blocks read, with dates as real UTC instants', async () => {
     const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
     await syncTimeDiscountMetafields(discount, TIME_ZONE)
 
@@ -34,21 +34,19 @@ describe('syncTimeDiscountMetafields', () => {
     expect(JSON.parse(written.value)).toEqual({
       discountId: 'time_disc_1', title: 'Flash Sale',
       startsAt: zonedTimeToUtc('2026-01-01T00:00', TIME_ZONE), endsAt: zonedTimeToUtc('2026-01-02T00:00', TIME_ZONE),
-      pricingMode: 'percent', amount: 20, variantIds: null,
+      items: [{ variantId: null, pricingMode: 'percent', amount: 20 }],
     })
   })
 
-  it('carries the fixed price as-is (no price lookup — the widget derives the display from the live variant price)', async () => {
+  it('carries the fixed price as-is (no price lookup — the scripts derive the display from the live variant price)', async () => {
     const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
     await syncTimeDiscountMetafields({ ...discount, pricingMode: 'fixed', amount: 22.5 }, TIME_ZONE)
 
     expect(spy).toHaveBeenCalledTimes(2)
-    const parsed = JSON.parse(writtenMetafields(spy)[0].value)
-    expect(parsed.pricingMode).toBe('fixed')
-    expect(parsed.amount).toBe(22.5)
+    expect(JSON.parse(writtenMetafields(spy)[0].value).items).toEqual([{ variantId: null, pricingMode: 'fixed', amount: 22.5 }])
   })
 
-  it('writes one metafield for a product listed twice and records exactly the covered variants', async () => {
+  it('writes one metafield for a product with several variant rows, listing each row', async () => {
     const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
     await syncTimeDiscountMetafields({
       ...discount,
@@ -59,22 +57,29 @@ describe('syncTimeDiscountMetafields', () => {
     }, TIME_ZONE)
 
     expect(spy).toHaveBeenCalledTimes(1)
-    expect(JSON.parse(writtenMetafields(spy)[0].value).variantIds).toEqual([
-      'gid://shopify/ProductVariant/10', 'gid://shopify/ProductVariant/11',
+    expect(JSON.parse(writtenMetafields(spy)[0].value).items).toEqual([
+      { variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'percent', amount: 20 },
+      { variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 20 },
     ])
   })
 
-  it('treats a whole-product member as covering every variant, even alongside variant members', async () => {
+  it('writes each stored item\'s own rule, and only that product\'s rows', async () => {
     const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
     await syncTimeDiscountMetafields({
       ...discount,
-      resolvedMembers: [
-        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10' },
-        { productId: 'gid://shopify/Product/1' },
+      items: [
+        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'fixed', amount: 22 },
+        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 50 },
+        { productId: 'gid://shopify/Product/2', pricingMode: 'percent', amount: 10 },
       ],
     }, TIME_ZONE)
 
-    expect(JSON.parse(writtenMetafields(spy)[0].value).variantIds).toBeNull()
+    const byProduct = Object.fromEntries(writtenMetafields(spy).map((m) => [m.ownerId, JSON.parse(m.value).items]))
+    expect(byProduct['gid://shopify/Product/1']).toEqual([
+      { variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'fixed', amount: 22 },
+      { variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 50 },
+    ])
+    expect(byProduct['gid://shopify/Product/2']).toEqual([{ variantId: null, pricingMode: 'percent', amount: 10 }])
   })
 
   it('aggregates and throws on any rejected write instead of swallowing it', async () => {
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/timeDiscounts/metafieldSync.test.ts`
Expected: FAIL — the written metafield value still has the old `pricingMode`/`amount`/`variantIds` fields, not `items`.

- [ ] **Step 3: Implement**

`src/timeDiscounts/metafieldSync.ts` — apply this change:

```diff
diff --git a/src/timeDiscounts/metafieldSync.ts b/src/timeDiscounts/metafieldSync.ts
index 9e1279b..ebf11c7 100644
--- a/src/timeDiscounts/metafieldSync.ts
+++ b/src/timeDiscounts/metafieldSync.ts
@@ -1,29 +1,34 @@
 import { shopifyQuery } from '@/lib/shopify-client'
 import { zonedTimeToUtc } from '@/lib/shop'
-import type { TimeDiscount, DiscountMember } from '@/timeDiscounts/config'
+import { getDiscountItems, type TimeDiscount } from '@/timeDiscounts/config'
 
 const NAMESPACE = 'sparkly_product_discounts'
 
+interface TimeDiscountMetafieldItem {
+  /** Variant GID, or null for the whole (single-variant) product. */
+  variantId: string | null
+  pricingMode: 'percent' | 'fixed'
+  /** Percent-off, or the fixed price in the shop's major currency unit (e.g. 22.5 = £22.50). */
+  amount: number
+}
+
 interface TimeDiscountMetafieldValue {
   discountId: string
   title: string
   startsAt: string
   endsAt: string
-  pricingMode: 'percent' | 'fixed'
-  /** Percent-off, or the fixed price in the shop's major currency unit (e.g. 22.5 = £22.50). */
-  amount: number
-  /** Variant GIDs this discount covers on the product; null means every variant. */
-  variantIds: string[] | null
+  /** Only THIS product's rows; the widget picks the selected variant's row. */
+  items: TimeDiscountMetafieldItem[]
 }
 
 /**
- * Writes the `time_based_discount` metafield to every unique product in
- * resolvedMembers — the storefront widget block reads this, keyed per product.
+ * Writes the `time_based_discount` metafield to every unique product in the
+ * discount's rows — the storefront scripts read this, keyed per product.
  *
- * The metafield carries the discount's parameters (pricingMode, amount,
- * variantIds), not a computed price: the widget derives the discounted price
- * from the live variant price, so it can't go stale when a merchant edits a
- * product price, and it stays correct per variant.
+ * The metafield carries each row's rule (pricingMode, amount, variant), not a
+ * computed price: the scripts derive the displayed price from the live variant
+ * price, so it can't go stale when a merchant edits a product price, and it
+ * stays correct per variant.
  *
  * `discount.startsAt`/`endsAt` are always naive shop-local strings (no
  * timezone offset). The storefront widget parses the metafield value with
@@ -37,22 +42,15 @@ export async function syncTimeDiscountMetafields(discount: TimeDiscount, timeZon
   const startsAt = zonedTimeToUtc(discount.startsAt, timeZone)
   const endsAt = zonedTimeToUtc(discount.endsAt, timeZone)
 
-  const membersByProduct = new Map<string, DiscountMember[]>()
-  for (const member of discount.resolvedMembers) {
-    membersByProduct.set(member.productId, [...(membersByProduct.get(member.productId) ?? []), member])
+  const itemsByProduct = new Map<string, TimeDiscountMetafieldItem[]>()
+  for (const item of getDiscountItems(discount)) {
+    const row: TimeDiscountMetafieldItem = { variantId: item.variantId ?? null, pricingMode: item.pricingMode, amount: item.amount }
+    itemsByProduct.set(item.productId, [...(itemsByProduct.get(item.productId) ?? []), row])
   }
 
   const results = await Promise.allSettled(
-    [...membersByProduct].map(([productId, members]) =>
-      setTimeDiscountMetafield(productId, {
-        discountId: discount.discountId,
-        title: discount.title,
-        startsAt,
-        endsAt,
-        pricingMode: discount.pricingMode,
-        amount: discount.amount,
-        variantIds: coveredVariantIds(members),
-      }),
+    [...itemsByProduct].map(([productId, items]) =>
+      setTimeDiscountMetafield(productId, { discountId: discount.discountId, title: discount.title, startsAt, endsAt, items }),
     ),
   )
 
@@ -62,12 +60,6 @@ export async function syncTimeDiscountMetafields(discount: TimeDiscount, timeZon
   }
 }
 
-/** A whole-product member covers every variant; otherwise only the listed variants are covered. */
-function coveredVariantIds(members: DiscountMember[]): string[] | null {
-  if (members.some((m) => !m.variantId)) return null
-  return [...new Set(members.map((m) => m.variantId as string))]
-}
-
 async function setTimeDiscountMetafield(productId: string, value: TimeDiscountMetafieldValue): Promise<void> {
   const data = await shopifyQuery<{
     metafieldsSet: { userErrors: { field: string[]; message: string }[] }
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run tests/timeDiscounts && npx tsc --noEmit -p .`
Expected: all `tests/timeDiscounts` tests pass (92 at this point); `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/metafieldSync.ts tests/timeDiscounts/metafieldSync.test.ts
git commit -m "feat: sync each product's price rows to its storefront metafield"
```


### Task 4: Storefront scripts and blocks read per-row items (and fix the first-paint variant)

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`
- Modify: `extensions/product-tier-pricing/assets/time-based-discount.js`
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid`
- Modify: `extensions/product-tier-pricing/blocks/time-based-discount.liquid`
- Modify: `extensions/product-tier-pricing-tests/tier-pricing.test.js`
- Modify: `extensions/product-tier-pricing-tests/time-based-discount.test.js`
- Create: `tests/storefront/time-discount-scripts.test.ts`

**Interfaces:**
- Consumes: the metafield shape from Task 3 (`items`), and the older top-level shape (`pricingMode`, `amount`, `variantIds`) still on discounts that have not been re-saved.
- Produces: in `tier-pricing.js` — `tierTimeDiscountItems(discount)`, `tierTimeDiscountItemFor(items, variantId)` and `timeDiscountSalePrice({ basePrice, discount, variantId })`; in `time-based-discount.js` — `countdownDiscountItems(discount)`, `countdownDiscountItemFor(items, variantId)` and `discountReducesPrice({ priceCents, discount, variantId })` (the old `isVariantCovered` is removed). The variant's own row wins over the whole-product row. Also: the tier block's container gets `data-selected-variant-id`, and the script uses it as the initial variant when the tier discount blob has none — this fixes the sale price being missing on first load for variant-specific discounts.

- [ ] **Step 1: Write the failing tests**

The browser-level test loads both real scripts into one jsdom window (as the theme does) and checks the rendered price/countdown behaviour:

`tests/storefront/time-discount-scripts.test.ts` (new file):

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Both storefront scripts are plain browser scripts that share ONE global
 * scope on the page, so they are evaluated together here the way the theme
 * loads them. The markup mirrors what tier-pricing.liquid and
 * time-based-discount.liquid render.
 */
const assets = path.resolve(__dirname, '../../extensions/product-tier-pricing/assets')
const tierScript = fs.readFileSync(path.join(assets, 'tier-pricing.js'), 'utf8')
const countdownScript = fs.readFileSync(path.join(assets, 'time-based-discount.js'), 'utf8')

const NOW = new Date('2026-10-05T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

type Item = { variantId: string | null; pricingMode: 'percent' | 'fixed'; amount: number }

function mount(discount: Record<string, unknown>, opts: { selectedVariantId?: number; basePrice?: number; variantPrices?: Record<string, number> } = {}) {
  const { selectedVariantId = 10, basePrice = 49.99, variantPrices = { '10': 4999, '11': 6000, '12': 3000 } } = opts
  const timeDiscount = JSON.stringify({ startsAt: discount.startsAt, endsAt: discount.endsAt, items: discount.items, pricingMode: discount.pricingMode, amount: discount.amount, variantIds: discount.variantIds })
  const countdownData = JSON.stringify({ ...discount, selectedVariantId, variantPrices })
  document.body.innerHTML = `
    <product-variants></product-variants>
    <input name="quantity" value="1">
    <div id="sparkly-tier-pricing-b1" class="sparkly-tier-pricing" data-sparkly-tier-pricing
      data-discount='{"tiers":[]}' data-time-discount='${timeDiscount}'
      data-product-handle='"bed"' data-product-id='"gid://shopify/Product/9"'
      data-selected-variant-id="${selectedVariantId}"
      data-base-price="${basePrice}" data-compare-at-price="0" data-money-format='"£{{amount}}"'>
      <div class="sparkly-tier-pricing__price-row">
        <span class="sparkly-tier-pricing__price sparkly-tier-pricing__original-price" data-tier-pricing-price data-original-price="true">£${basePrice}</span>
        <span class="sparkly-tier-pricing__price sparkly-tier-pricing__discounted-price" data-discounted-price hidden>£${basePrice}</span>
        <span class="sparkly-tier-pricing__each-label" data-tier-pricing-each-label>each</span>
      </div>
      <div class="sparkly-tier-pricing__card" data-tier-pricing-card hidden>
        <div data-tier-pricing-breakdown></div>
        <div class="sparkly-tier-pricing__bar-wrap"><div class="sparkly-tier-pricing__track"><div data-tier-pricing-fill></div></div><div data-tier-pricing-stops></div></div>
        <div data-tier-pricing-tiers></div>
      </div>
    </div>
    <div id="sparkly-time-discount-b1" class="sparkly-time-discount" data-sparkly-time-discount data-discount='${countdownData}' hidden>
      <p class="sparkly-time-discount__label" data-time-discount-label></p>
      <div class="sparkly-time-discount__boxes">
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-days>00</span><span class="sparkly-time-discount__unit">DAY</span></div>
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-hours>00</span><span class="sparkly-time-discount__unit">HRS</span></div>
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-minutes>00</span><span class="sparkly-time-discount__unit">MINS</span></div>
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-seconds>00</span><span class="sparkly-time-discount__unit">SECS</span></div>
      </div>
    </div>`
  // Same global scope for both, as on the storefront.
  ;(0, eval)(countdownScript)
  ;(0, eval)(tierScript)
}

function view() {
  const q = (selector: string) => document.querySelector(selector) as HTMLElement
  const sale = q('[data-discounted-price]')
  const regular = q('[data-original-price]')
  return {
    sale: sale.hidden ? null : sale.textContent!.trim(),
    regularStruck: regular.getAttribute('data-strike') === 'true',
    countdownVisible: !q('[data-sparkly-time-discount]').hidden,
    countdownLabel: q('[data-time-discount-label]').textContent,
  }
}

function changeVariant(id: number, price: number) {
  const el = document.querySelector('product-variants') as HTMLElement & { currentVariant?: unknown }
  el.currentVariant = { id, price }
  el.dispatchEvent(new Event('VARIANT_CHANGE'))
}

const live = { title: 'Summer Sale', startsAt: iso(-3_600_000), endsAt: iso(86_400_000) }
const fixed = (amount: number, variantId: string | null = null): Item => ({ variantId, pricingMode: 'fixed', amount })
const percent = (amount: number, variantId: string | null = null): Item => ({ variantId, pricingMode: 'percent', amount })

describe('time-based discount storefront scripts', () => {
  beforeEach(() => { vi.useFakeTimers({ now: NOW }) })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = '' })

  it('shows the sale price with the regular price struck, and the countdown, for a whole-product row', () => {
    mount({ ...live, items: [fixed(22)] })
    expect(view()).toEqual({ sale: '£22.00', regularStruck: true, countdownVisible: true, countdownLabel: 'Summer Sale ends in:' })
  })

  it('uses the selected variant from first paint, not only after a variant change', () => {
    mount({ ...live, items: [fixed(22, V10), percent(50, V11)] }, { selectedVariantId: 10 })
    expect(view().sale).toBe('£22.00')
  })

  it('gives each variant its own price as the customer switches variants', () => {
    mount({ ...live, items: [fixed(22, V10), percent(50, V11)] }, { selectedVariantId: 10 })
    changeVariant(11, 6000)
    expect(view().sale).toBe('£30.00')
    changeVariant(12, 3000) // no row for variant 12
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: false })
    changeVariant(10, 4999)
    expect(view().sale).toBe('£22.00')
  })

  it('lets a variant row beat the whole-product row', () => {
    mount({ ...live, items: [percent(10), fixed(5, V10)] }, { selectedVariantId: 10 })
    expect(view().sale).toBe('£5.00')
    changeVariant(11, 6000)
    expect(view().sale).toBe('£54.00')
  })

  it('shows nothing when the fixed price is not lower than the variant price', () => {
    mount({ ...live, items: [fixed(60)] })
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: false })
  })

  it('resets the price and hides the countdown when the discount ends, with no refresh', () => {
    mount({ ...live, endsAt: iso(3_000), items: [fixed(22)] })
    expect(view().sale).toBe('£22.00')
    vi.advanceTimersByTime(4_000)
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: false })
  })

  it('shows the price and countdown when the discount starts after the page was opened', () => {
    mount({ ...live, startsAt: iso(3_000), items: [fixed(22)] })
    expect(view()).toMatchObject({ sale: null, countdownVisible: false })
    vi.advanceTimersByTime(4_000)
    expect(view()).toMatchObject({ sale: '£22.00', regularStruck: true, countdownVisible: true })
  })

  it('still understands a metafield written before per-row pricing', () => {
    mount({ ...live, pricingMode: 'fixed', amount: 22, variantIds: [V10] }, { selectedVariantId: 10 })
    expect(view().sale).toBe('£22.00')
    changeVariant(12, 3000)
    expect(view()).toMatchObject({ sale: null, countdownVisible: false })
  })

  it('shows the countdown alone when a metafield has no pricing data', () => {
    mount({ ...live })
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: true })
  })
})
```

And the pure-function tests for the two scripts:

`extensions/product-tier-pricing-tests/tier-pricing.test.js` — apply this change:

```diff
diff --git a/extensions/product-tier-pricing-tests/tier-pricing.test.js b/extensions/product-tier-pricing-tests/tier-pricing.test.js
index 82f1091..27ae67e 100644
--- a/extensions/product-tier-pricing-tests/tier-pricing.test.js
+++ b/extensions/product-tier-pricing-tests/tier-pricing.test.js
@@ -1,6 +1,6 @@
 const test = require('node:test')
 const assert = require('node:assert/strict')
-const { isTimeDiscountWindowActive, timeDiscountSalePrice, computeTierState, perUnitPrice, extractNumericId, sumMemberQuantityInCart, resolveEligibility, unitPriceAtTier, totalAtTier, computeProgressState, computeProgressTrack, pluralizeTitle, formatAddMoreText, formatTempBoxLabel, joinNaturally, buildPromoText, computeOrderSummary, computeTierButtonsSignature, withUnitAnchor, cartBaselineOtherQty, clamp, sortTiersByMinQty, normalizeTierPricing, formatMoney, computeWidgetViewModel, buildMixMatchRows, buildDisplayMixMatchItems } = require('../product-tier-pricing/assets/tier-pricing.js')
+const { isTimeDiscountWindowActive, tierTimeDiscountItems, tierTimeDiscountItemFor, timeDiscountSalePrice, computeTierState, perUnitPrice, extractNumericId, sumMemberQuantityInCart, resolveEligibility, unitPriceAtTier, totalAtTier, computeProgressState, computeProgressTrack, pluralizeTitle, formatAddMoreText, formatTempBoxLabel, joinNaturally, buildPromoText, computeOrderSummary, computeTierButtonsSignature, withUnitAnchor, cartBaselineOtherQty, clamp, sortTiersByMinQty, normalizeTierPricing, formatMoney, computeWidgetViewModel, buildMixMatchRows, buildDisplayMixMatchItems } = require('../product-tier-pricing/assets/tier-pricing.js')
 
 test('below every tier: no discount, lists every tier as a delta from current quantity', () => {
   const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
@@ -830,42 +830,93 @@ test('computeWidgetViewModel: standalone mode (isGroup false) uses "Buy more" pr
   assert.equal(vm.promoText, 'Buy Canagan Tuna Soup and get 7 or more for £1.43')
 })
 
-// Time-based discount sale price (major currency unit, like basePrice)
+// Time-based discount rows and sale price (major currency unit, like basePrice)
+
+const V10 = 'gid://shopify/ProductVariant/10'
+const V11 = 'gid://shopify/ProductVariant/11'
+
+test('tierTimeDiscountItems: current metafields carry their own rows', () => {
+  const items = [{ variantId: V10, pricingMode: 'fixed', amount: 22 }, { variantId: null, pricingMode: 'percent', amount: 10 }]
+  assert.deepEqual(tierTimeDiscountItems({ items }), items)
+})
+
+test('tierTimeDiscountItems: an older metafield becomes one row per covered variant, or one whole-product row', () => {
+  assert.deepEqual(
+    tierTimeDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: null }),
+    [{ variantId: null, pricingMode: 'percent', amount: 20 }]
+  )
+  assert.deepEqual(
+    tierTimeDiscountItems({ pricingMode: 'fixed', amount: 22, variantIds: [V10, V11] }),
+    [{ variantId: V10, pricingMode: 'fixed', amount: 22 }, { variantId: V11, pricingMode: 'fixed', amount: 22 }]
+  )
+  assert.deepEqual(tierTimeDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: [] }), [{ variantId: null, pricingMode: 'percent', amount: 20 }])
+})
+
+test('tierTimeDiscountItems: no rows without pricing data', () => {
+  assert.deepEqual(tierTimeDiscountItems({ pricingMode: null, amount: null, variantIds: null }), [])
+  assert.deepEqual(tierTimeDiscountItems({}), [])
+})
+
+test('tierTimeDiscountItemFor: the variant\'s own row wins over the whole-product row; GIDs and numeric ids both match', () => {
+  const whole = { variantId: null, pricingMode: 'percent', amount: 10 }
+  const own = { variantId: V10, pricingMode: 'fixed', amount: 5 }
+  assert.equal(tierTimeDiscountItemFor([whole, own], '10'), own)
+  assert.equal(tierTimeDiscountItemFor([whole, own], 10), own)
+  assert.equal(tierTimeDiscountItemFor([whole, own], '11'), whole)
+  assert.equal(tierTimeDiscountItemFor([own], '11'), null)
+  assert.equal(tierTimeDiscountItemFor([], '10'), null)
+})
 
 test('timeDiscountSalePrice: fixed mode IS the final price, whatever the variant price is', () => {
-  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, pricingMode: 'fixed', amount: 22, variantIds: null, variantId: '1' }), 22)
-  assert.equal(timeDiscountSalePrice({ basePrice: 1000, pricingMode: 'fixed', amount: 22.5, variantIds: null, variantId: '1' }), 22.5)
+  const discount = { items: [{ variantId: null, pricingMode: 'fixed', amount: 22 }] }
+  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount, variantId: '1' }), 22)
+  assert.equal(timeDiscountSalePrice({ basePrice: 1000, discount: { items: [{ variantId: null, pricingMode: 'fixed', amount: 22.5 }] }, variantId: '1' }), 22.5)
 })
 
 test('timeDiscountSalePrice: percent mode takes the percentage off the variant\'s own price, rounded to pence', () => {
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'percent', amount: 20, variantIds: null, variantId: '1' }), 16)
-  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, pricingMode: 'percent', amount: 10, variantIds: null, variantId: '1' }), 44.99)
-  assert.equal(timeDiscountSalePrice({ basePrice: 59.99, pricingMode: 'percent', amount: 12.5, variantIds: null, variantId: '1' }), 52.49)
+  const pct = (amount) => ({ items: [{ variantId: null, pricingMode: 'percent', amount }] })
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: pct(20), variantId: '1' }), 16)
+  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: pct(10), variantId: '1' }), 44.99)
+  assert.equal(timeDiscountSalePrice({ basePrice: 59.99, discount: pct(12.5), variantId: '1' }), 52.49)
 })
 
 test('timeDiscountSalePrice: percent is clamped to 0-100', () => {
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'percent', amount: 150, variantIds: null, variantId: '1' }), 0)
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'percent', amount: -5, variantIds: null, variantId: '1' }), null)
+  const pct = (amount) => ({ items: [{ variantId: null, pricingMode: 'percent', amount }] })
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: pct(150), variantId: '1' }), 0)
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: pct(-5), variantId: '1' }), null)
+})
+
+test('timeDiscountSalePrice: every row has its own price — each variant gets its own rule', () => {
+  const discount = { items: [{ variantId: V10, pricingMode: 'fixed', amount: 22 }, { variantId: V11, pricingMode: 'percent', amount: 50 }] }
+  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount, variantId: '10' }), 22)
+  assert.equal(timeDiscountSalePrice({ basePrice: 60, discount, variantId: '11' }), 30)
+  assert.equal(timeDiscountSalePrice({ basePrice: 60, discount, variantId: '12' }), null)
+})
+
+test('timeDiscountSalePrice: a variant row beats the whole-product row', () => {
+  const discount = { items: [{ variantId: null, pricingMode: 'percent', amount: 10 }, { variantId: V10, pricingMode: 'fixed', amount: 5 }] }
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount, variantId: '10' }), 5)
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount, variantId: '11' }), 18)
 })
 
-test('timeDiscountSalePrice: null for a variant the discount does not cover; covered variants accept GIDs or numeric ids', () => {
-  const ids = ['gid://shopify/ProductVariant/10', 'gid://shopify/ProductVariant/11']
-  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, pricingMode: 'fixed', amount: 22, variantIds: ids, variantId: '12' }), null)
-  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, pricingMode: 'fixed', amount: 22, variantIds: ids, variantId: '10' }), 22)
-  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, pricingMode: 'fixed', amount: 22, variantIds: ids, variantId: 11 }), 22)
-  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, pricingMode: 'fixed', amount: 22, variantIds: [], variantId: '99' }), 22)
+test('timeDiscountSalePrice: an older single-rule metafield still works', () => {
+  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: null }, variantId: '1' }), 22)
+  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: [V10] }, variantId: '12' }), null)
+  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: [V10] }, variantId: 10 }), 22)
 })
 
 test('timeDiscountSalePrice: null when the price would not actually be lower (checkout applies no discount)', () => {
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'fixed', amount: 25, variantIds: null, variantId: '1' }), null)
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'fixed', amount: 20, variantIds: null, variantId: '1' }), null)
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'percent', amount: 0, variantIds: null, variantId: '1' }), null)
+  const fixed = (amount) => ({ items: [{ variantId: null, pricingMode: 'fixed', amount }] })
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: fixed(25), variantId: '1' }), null)
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: fixed(20), variantId: '1' }), null)
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: { items: [{ variantId: null, pricingMode: 'percent', amount: 0 }] }, variantId: '1' }), null)
 })
 
-test('timeDiscountSalePrice: null without pricing data (older metafield) or without a usable base price', () => {
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: null, amount: null, variantIds: null, variantId: '1' }), null)
-  assert.equal(timeDiscountSalePrice({ basePrice: 20, pricingMode: 'fixed', amount: undefined, variantIds: null, variantId: '1' }), null)
-  assert.equal(timeDiscountSalePrice({ basePrice: Number.NaN, pricingMode: 'fixed', amount: 5, variantIds: null, variantId: '1' }), null)
+test('timeDiscountSalePrice: null without pricing data, without a discount, or without a usable base price', () => {
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: { pricingMode: null, amount: null, variantIds: null }, variantId: '1' }), null)
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: null, variantId: '1' }), null)
+  assert.equal(timeDiscountSalePrice({ basePrice: Number.NaN, discount: { items: [{ variantId: null, pricingMode: 'fixed', amount: 5 }] }, variantId: '1' }), null)
+  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: { items: [{ variantId: null, pricingMode: 'fixed', amount: undefined }] }, variantId: '1' }), null)
 })
 
 // Time-based discount window
```
`extensions/product-tier-pricing-tests/time-based-discount.test.js` — apply this change:

```diff
diff --git a/extensions/product-tier-pricing-tests/time-based-discount.test.js b/extensions/product-tier-pricing-tests/time-based-discount.test.js
index 1fea06d..0615f8e 100644
--- a/extensions/product-tier-pricing-tests/time-based-discount.test.js
+++ b/extensions/product-tier-pricing-tests/time-based-discount.test.js
@@ -5,7 +5,8 @@ const {
   formatCountdownUnit,
   paintCountdown,
   computeDiscountedPriceCents,
-  isVariantCovered,
+  countdownDiscountItems,
+  countdownDiscountItemFor,
   discountReducesPrice,
   timeDiscountNumericId
 } = require('../product-tier-pricing/assets/time-based-discount.js')
@@ -88,34 +89,51 @@ test('computeDiscountedPriceCents: percent is clamped to 0-100 so the price neve
   assert.equal(computeDiscountedPriceCents(2000, 'percent', -10), 2000)
 })
 
-test('isVariantCovered: null or empty list covers every variant; otherwise only the listed ones (GIDs vs numeric ids)', () => {
-  assert.equal(isVariantCovered(null, '10'), true)
-  assert.equal(isVariantCovered([], '10'), true)
-  const ids = ['gid://shopify/ProductVariant/10', 'gid://shopify/ProductVariant/11']
-  assert.equal(isVariantCovered(ids, '10'), true)
-  assert.equal(isVariantCovered(ids, 11), true)
-  assert.equal(isVariantCovered(ids, '12'), false)
+const CV10 = 'gid://shopify/ProductVariant/10'
+
+test('countdownDiscountItems: current metafields carry rows; an older single-rule metafield becomes rows; no pricing means no rows', () => {
+  const items = [{ variantId: CV10, pricingMode: 'fixed', amount: 22 }]
+  assert.deepEqual(countdownDiscountItems({ items }), items)
+  assert.deepEqual(countdownDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: null }), [{ variantId: null, pricingMode: 'percent', amount: 20 }])
+  assert.deepEqual(countdownDiscountItems({ pricingMode: 'fixed', amount: 22, variantIds: [CV10] }), [{ variantId: CV10, pricingMode: 'fixed', amount: 22 }])
+  assert.deepEqual(countdownDiscountItems({ pricingMode: null, amount: null, variantIds: null }), [])
+})
+
+test('countdownDiscountItemFor: the variant\'s own row wins over the whole-product row', () => {
+  const whole = { variantId: null, pricingMode: 'percent', amount: 10 }
+  const own = { variantId: CV10, pricingMode: 'fixed', amount: 5 }
+  assert.equal(countdownDiscountItemFor([whole, own], '10'), own)
+  assert.equal(countdownDiscountItemFor([whole, own], 10), own)
+  assert.equal(countdownDiscountItemFor([whole, own], '11'), whole)
+  assert.equal(countdownDiscountItemFor([own], '11'), null)
+})
+
+test('discountReducesPrice: true for a variant with a row and a real saving (fixed price is the final price)', () => {
+  const fixed = { items: [{ variantId: null, pricingMode: 'fixed', amount: 22 }] }
+  const percent = { items: [{ variantId: null, pricingMode: 'percent', amount: 20 }] }
+  assert.equal(discountReducesPrice({ priceCents: 4999, discount: fixed, variantId: '1' }), true)
+  assert.equal(discountReducesPrice({ priceCents: 4999, discount: percent, variantId: '1' }), true)
 })
 
-test('discountReducesPrice: true for a covered variant with a real saving (fixed price is the final price)', () => {
-  assert.equal(discountReducesPrice({ priceCents: 4999, pricingMode: 'fixed', amount: 22, variantIds: null, variantId: '1' }), true)
-  assert.equal(discountReducesPrice({ priceCents: 4999, pricingMode: 'percent', amount: 20, variantIds: null, variantId: '1' }), true)
+test('discountReducesPrice: false for a variant with no row', () => {
+  const discount = { items: [{ variantId: CV10, pricingMode: 'percent', amount: 20 }] }
+  assert.equal(discountReducesPrice({ priceCents: 4999, discount, variantId: '12' }), false)
 })
 
-test('discountReducesPrice: false for a variant the discount does not cover', () => {
-  assert.equal(discountReducesPrice({
-    priceCents: 4999, pricingMode: 'percent', amount: 20,
-    variantIds: ['gid://shopify/ProductVariant/10'], variantId: '12'
-  }), false)
+test('discountReducesPrice: each variant is judged by its own row', () => {
+  const discount = { items: [{ variantId: CV10, pricingMode: 'fixed', amount: 25 }, { variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'fixed', amount: 5 }] }
+  assert.equal(discountReducesPrice({ priceCents: 2000, discount, variantId: '10' }), false) // £25 is not below £20
+  assert.equal(discountReducesPrice({ priceCents: 2000, discount, variantId: '11' }), true)
 })
 
 test('discountReducesPrice: false when a fixed price is not below the variant price (checkout applies no discount then)', () => {
-  assert.equal(discountReducesPrice({ priceCents: 2000, pricingMode: 'fixed', amount: 25, variantIds: null, variantId: '1' }), false)
-  assert.equal(discountReducesPrice({ priceCents: 2000, pricingMode: 'fixed', amount: 20, variantIds: null, variantId: '1' }), false)
+  const fixed = (amount) => ({ items: [{ variantId: null, pricingMode: 'fixed', amount }] })
+  assert.equal(discountReducesPrice({ priceCents: 2000, discount: fixed(25), variantId: '1' }), false)
+  assert.equal(discountReducesPrice({ priceCents: 2000, discount: fixed(20), variantId: '1' }), false)
 })
 
 test('discountReducesPrice: false for a 0% discount', () => {
-  assert.equal(discountReducesPrice({ priceCents: 2000, pricingMode: 'percent', amount: 0, variantIds: null, variantId: '1' }), false)
+  assert.equal(discountReducesPrice({ priceCents: 2000, discount: { items: [{ variantId: null, pricingMode: 'percent', amount: 0 }] }, variantId: '1' }), false)
 })
 
 test('timeDiscountNumericId: takes the trailing id of a GID and leaves numeric ids alone', () => {
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test extensions/product-tier-pricing-tests/*.test.js ; npx vitest run tests/storefront`
Expected: FAIL — `tierTimeDiscountItems`, `countdownDiscountItems` etc. are not exported, and the browser-level test finds no sale price for rows in `items`.

- [ ] **Step 3: Implement the scripts**

`extensions/product-tier-pricing/assets/tier-pricing.js` — apply this change:

```diff
diff --git a/extensions/product-tier-pricing/assets/tier-pricing.js b/extensions/product-tier-pricing/assets/tier-pricing.js
index 70f70cc..43e466d 100644
--- a/extensions/product-tier-pricing/assets/tier-pricing.js
+++ b/extensions/product-tier-pricing/assets/tier-pricing.js
@@ -378,20 +378,39 @@ function buildDisplayMixMatchItems(config) {
   return ownRows.concat(config.mixMatchListItems)
 }
 
+// Rows of a time-based discount for ONE product: [{ variantId: string|null,
+// pricingMode, amount }]. Current metafields carry `items`; metafields written
+// before per-row pricing carry one rule at the top level (pricingMode/amount)
+// plus `variantIds` (null/empty = every variant). Named with a tier prefix
+// because this file shares one global scope with time-based-discount.js.
+function tierTimeDiscountItems(discount) {
+  if (Array.isArray(discount.items)) return discount.items
+  if (discount.pricingMode !== 'percent' && discount.pricingMode !== 'fixed') return []
+  const rule = { pricingMode: discount.pricingMode, amount: discount.amount }
+  const ids = discount.variantIds
+  if (!ids || ids.length === 0) return [{ variantId: null, ...rule }]
+  return ids.map((id) => ({ variantId: id, ...rule }))
+}
+
+// The variant's own row wins; otherwise the whole-product row (variantId null).
+function tierTimeDiscountItemFor(items, variantId) {
+  const own = items.find((item) => item.variantId != null && extractNumericId(item.variantId) === String(variantId))
+  return own || items.find((item) => item.variantId == null) || null
+}
+
 // Sale price (in the shop currency's major unit, like basePrice) of an active
 // time-based discount for ONE variant, or null when there is no sale to show:
-// the variant isn't covered by the discount, the discount carries no pricing
-// data (older metafield), or the price wouldn't actually be lower — a fixed
-// price at or above the variant's price applies no discount at checkout, so
-// nothing is advertised. Percent: that much off the variant's own price.
-// Fixed: the amount IS the final price, whatever the variant's price is.
-// variantIds is null/empty when the discount covers every variant.
-function timeDiscountSalePrice({ basePrice, pricingMode, amount, variantIds, variantId }) {
-  if (pricingMode !== 'percent' && pricingMode !== 'fixed') return null
-  if (typeof amount !== 'number' || !(basePrice > 0)) return null
-  const covered = !variantIds || variantIds.length === 0 || variantIds.map(extractNumericId).includes(String(variantId))
-  if (!covered) return null
-  const sale = pricingMode === 'fixed' ? amount : basePrice * (1 - clamp(amount, 0, 100) / 100)
+// the variant has no row, the discount carries no pricing data, or the price
+// wouldn't actually be lower — a fixed price at or above the variant's price
+// applies no discount at checkout, so nothing is advertised. Percent: that
+// much off the variant's own price. Fixed: the amount IS the final price,
+// whatever the variant's price is.
+function timeDiscountSalePrice({ basePrice, discount, variantId }) {
+  if (!discount || !(basePrice > 0)) return null
+  const item = tierTimeDiscountItemFor(tierTimeDiscountItems(discount), variantId)
+  if (!item || typeof item.amount !== 'number') return null
+  if (item.pricingMode !== 'percent' && item.pricingMode !== 'fixed') return null
+  const sale = item.pricingMode === 'fixed' ? item.amount : basePrice * (1 - clamp(item.amount, 0, 100) / 100)
   const rounded = Math.round(sale * 100) / 100
   return rounded < basePrice ? rounded : null
 }
@@ -409,6 +428,8 @@ function isTimeDiscountWindowActive(discount, now) {
 if (typeof module !== 'undefined' && module.exports) {
   module.exports = {
     isTimeDiscountWindowActive,
+    tierTimeDiscountItems,
+    tierTimeDiscountItemFor,
     timeDiscountSalePrice,
     clamp,
     sortTiersByMinQty,
@@ -631,7 +652,12 @@ if (typeof document !== 'undefined') {
       hasTiers: !!(tiers && tiers.length > 0),
       ownVariantIds,
       ownVariantOptions,
-      initialVariantId: discount.selfVariantId ? extractNumericId(discount.selfVariantId) : null,
+      // A product with only a time-based discount has no tier discount blob
+      // (so no selfVariantId); the block still renders the selected variant's
+      // id on the container, and the sale price depends on it from first paint.
+      initialVariantId: discount.selfVariantId
+        ? extractNumericId(discount.selfVariantId)
+        : container.dataset.selectedVariantId || null,
       allMembers,
       mixMatchListItems: discount.siblings || [],
       isGroup: allMembers.length > 1,
@@ -828,13 +854,7 @@ if (typeof document !== 'undefined') {
     if (!originalPrice || !discountedPrice) return
 
     const discount = parseActiveTimeDiscount(timeDiscountJson)
-    const salePrice = discount && timeDiscountSalePrice({
-      basePrice,
-      pricingMode: discount.pricingMode,
-      amount: discount.amount,
-      variantIds: discount.variantIds,
-      variantId,
-    })
+    const salePrice = discount && timeDiscountSalePrice({ basePrice, discount, variantId })
 
     if (salePrice != null) {
       discountedPrice.textContent = formatMoneyFn(salePrice)
```
`extensions/product-tier-pricing/assets/time-based-discount.js` — apply this change:

```diff
diff --git a/extensions/product-tier-pricing/assets/time-based-discount.js b/extensions/product-tier-pricing/assets/time-based-discount.js
index 6149f6f..5206530 100644
--- a/extensions/product-tier-pricing/assets/time-based-discount.js
+++ b/extensions/product-tier-pricing/assets/time-based-discount.js
@@ -68,21 +68,35 @@ function computeDiscountedPriceCents(priceCents, pricingMode, amount) {
   return Math.round((priceCents * (100 - percent)) / 100)
 }
 
-// variantIds is null/empty when the discount covers every variant of the
-// product, otherwise the GIDs of the covered variants only.
-function isVariantCovered(variantIds, variantId) {
-  if (!variantIds || variantIds.length === 0) return true
-  return variantIds.map(timeDiscountNumericId).includes(String(variantId))
+// Rows of a time-based discount for ONE product: [{ variantId: string|null,
+// pricingMode, amount }]. Current metafields carry `items`; metafields written
+// before per-row pricing carry one rule at the top level (pricingMode/amount)
+// plus `variantIds` (null/empty = every variant). Named with a countdown
+// prefix because this file shares one global scope with tier-pricing.js.
+function countdownDiscountItems(discount) {
+  if (Array.isArray(discount.items)) return discount.items
+  if (discount.pricingMode !== 'percent' && discount.pricingMode !== 'fixed') return []
+  const rule = { pricingMode: discount.pricingMode, amount: discount.amount }
+  const ids = discount.variantIds
+  if (!ids || ids.length === 0) return [{ variantId: null, ...rule }]
+  return ids.map((id) => ({ variantId: id, ...rule }))
 }
 
-// Whether a sale actually applies to this variant: it must be covered by the
-// discount AND the discounted price must be genuinely lower — a fixed price at
-// or above the variant's price applies no discount at checkout (the Function
-// clamps it), so the widget must not advertise one. The sale price itself is
-// shown by the tier-pricing price block.
-function discountReducesPrice({ priceCents, pricingMode, amount, variantIds, variantId }) {
-  if (!isVariantCovered(variantIds, variantId)) return false
-  return computeDiscountedPriceCents(priceCents, pricingMode, amount) < priceCents
+// The variant's own row wins; otherwise the whole-product row (variantId null).
+function countdownDiscountItemFor(items, variantId) {
+  const own = items.find((item) => item.variantId != null && timeDiscountNumericId(item.variantId) === String(variantId))
+  return own || items.find((item) => item.variantId == null) || null
+}
+
+// Whether a sale actually applies to this variant: it must have a row AND the
+// discounted price must be genuinely lower — a fixed price at or above the
+// variant's price applies no discount at checkout (the Function clamps it), so
+// the widget must not advertise one. The sale price itself is shown by the
+// tier-pricing price block.
+function discountReducesPrice({ priceCents, discount, variantId }) {
+  const item = countdownDiscountItemFor(countdownDiscountItems(discount), variantId)
+  if (!item) return false
+  return computeDiscountedPriceCents(priceCents, item.pricingMode, item.amount) < priceCents
 }
 
 // `applies` is optional: null means "no pricing data" (older metafield) and
@@ -107,7 +121,8 @@ if (typeof module !== 'undefined' && module.exports) {
     formatCountdownUnit,
     paintCountdown,
     computeDiscountedPriceCents,
-    isVariantCovered,
+    countdownDiscountItems,
+    countdownDiscountItemFor,
     discountReducesPrice,
     timeDiscountNumericId
   }
@@ -149,14 +164,8 @@ if (typeof document !== 'undefined') {
       // null = no pricing data (older metafield): countdown only.
       function discountApplies() {
         const priceCents = discount.variantPrices && discount.variantPrices[variantId]
-        if (!discount.pricingMode || typeof priceCents !== 'number') return null
-        return discountReducesPrice({
-          priceCents,
-          pricingMode: discount.pricingMode,
-          amount: discount.amount,
-          variantIds: discount.variantIds,
-          variantId
-        })
+        if (countdownDiscountItems(discount).length === 0 || typeof priceCents !== 'number') return null
+        return discountReducesPrice({ priceCents, discount, variantId })
       }
 
       function tick() {
```

- [ ] **Step 4: Implement the Liquid changes**

The blocks pass `items` through (explicit `null` when absent — `nil | json` is not guaranteed to print `null`), keep the older top-level fields for discounts not yet re-saved, and the tier block exposes the selected variant:

`extensions/product-tier-pricing/blocks/tier-pricing.liquid` — apply this change:

```diff
diff --git a/extensions/product-tier-pricing/blocks/tier-pricing.liquid b/extensions/product-tier-pricing/blocks/tier-pricing.liquid
index 2e6918d..0098528 100644
--- a/extensions/product-tier-pricing/blocks/tier-pricing.liquid
+++ b/extensions/product-tier-pricing/blocks/tier-pricing.liquid
@@ -51,7 +51,8 @@
       "endsAt": {{ time_discount_metafield.value.endsAt | json }},
       "pricingMode": {% if time_discount_metafield.value.pricingMode != nil %}{{ time_discount_metafield.value.pricingMode | json }}{% else %}null{% endif %},
       "amount": {% if time_discount_metafield.value.amount != nil %}{{ time_discount_metafield.value.amount | json }}{% else %}null{% endif %},
-      "variantIds": {% if time_discount_metafield.value.variantIds != nil %}{{ time_discount_metafield.value.variantIds | json }}{% else %}null{% endif %}
+      "variantIds": {% if time_discount_metafield.value.variantIds != nil %}{{ time_discount_metafield.value.variantIds | json }}{% else %}null{% endif %},
+      "items": {% if time_discount_metafield.value.items != nil %}{{ time_discount_metafield.value.items | json }}{% else %}null{% endif %}
     }
   {%- endcapture -%}
   {%- assign time_discount_json = time_discount_data | strip | escape -%}
@@ -63,6 +64,7 @@
   data-sparkly-tier-pricing
   data-discount='{{ discount_json }}'
   data-time-discount='{{ time_discount_json }}'
+  data-selected-variant-id="{{ product.selected_or_first_available_variant.id }}"
   data-product-handle='{{ product.handle | json | escape }}'
   data-product-id='{{ product.id | prepend: "gid://shopify/Product/" | json }}'
   data-base-price="{{ product.selected_or_first_available_variant.price | divided_by: 100.0 | json }}"
```
`extensions/product-tier-pricing/blocks/time-based-discount.liquid` — apply this change:

```diff
diff --git a/extensions/product-tier-pricing/blocks/time-based-discount.liquid b/extensions/product-tier-pricing/blocks/time-based-discount.liquid
index 2627cc3..e9c4cd2 100644
--- a/extensions/product-tier-pricing/blocks/time-based-discount.liquid
+++ b/extensions/product-tier-pricing/blocks/time-based-discount.liquid
@@ -21,6 +21,7 @@
       "pricingMode": {% if discount_metafield.value.pricingMode != nil %}{{ discount_metafield.value.pricingMode | json }}{% else %}null{% endif %},
       "amount": {% if discount_metafield.value.amount != nil %}{{ discount_metafield.value.amount | json }}{% else %}null{% endif %},
       "variantIds": {% if discount_metafield.value.variantIds != nil %}{{ discount_metafield.value.variantIds | json }}{% else %}null{% endif %},
+      "items": {% if discount_metafield.value.items != nil %}{{ discount_metafield.value.items | json }}{% else %}null{% endif %},
       "selectedVariantId": {{ product.selected_or_first_available_variant.id | json }},
       "variantPrices": {
         {%- for variant in product.variants -%}
```

- [ ] **Step 5: Run everything**

Run: `node --test extensions/product-tier-pricing-tests/*.test.js && npx vitest run && npx tsc --noEmit -p .`  (use the glob: a directory argument fails on Node 22)
Expected: 135 `node --test` tests pass; vitest: 208 tests in 20 files pass (9 of them are the new browser-level tests); `tsc` prints nothing.

To see the first-paint fix is real, temporarily change `: container.dataset.selectedVariantId || null,` to `: null,` in `tier-pricing.js` and run `npx vitest run tests/storefront`: three tests fail ("uses the selected variant from first paint, not only after a variant change", "lets a variant row beat the whole-product row" and "still understands a metafield written before per-row pricing" — each needs the selected variant at first paint); put it back and all nine pass.

- [ ] **Step 6: Commit**

```bash
git add extensions/product-tier-pricing extensions/product-tier-pricing-tests tests/storefront
git commit -m "feat: storefront scripts and blocks read per-row items; fix initial variant on time-only products"
```

### PR 1 hand-off

- [ ] Run the full check once more: `npx vitest run && npx tsc --noEmit -p . && node --test extensions/product-tier-pricing-tests/*.test.js && (cd extensions/time-based-discount && cargo test)` — expect 208 / clean / 135 / 14 (209 once the final-review guard test below is added).
- [ ] `git push -u origin feat/per-row-time-discount-engine`, then open the PR (title: "Per-row pricing engine: Function, storefront sync and scripts (backwards compatible)"). Body: what changed per task, "no admin change", the deploy order above, and the first-paint variant fix.
- [ ] **Deploy the Shopify app BEFORE merging** (Vercel auto-deploys `main` on merge): from the PR branch run `shopify app deploy --config shopify.app.toml`; confirm with `shopify app versions list --config shopify.app.toml` that the new version is active.
- [ ] Get a non-author review, merge, and confirm Vercel has deployed `main`.
- [ ] Live check: in the existing admin re-save the active time discount (this rewrites its storefront metafield in the new shape), hard-refresh a covered product page and confirm the countdown and sale price still show; for a variant-specific discount, confirm the sale price shows **on first load**.

---

# PR 2 — Admin

Branch: `feat/per-row-time-discount-admin`, from the latest `main` **after PR 1 is merged and deployed** (so the Function and scripts already understand the new shapes this PR starts writing).

```bash
git checkout main && git pull origin main && git checkout -b feat/per-row-time-discount-admin
```


### Task 5: Per-row helpers — price display, validation, Function-config size

**Files:**
- Create: `src/timeDiscounts/items.ts`
- Test: `tests/timeDiscounts/items.test.ts`

**Interfaces:**
- Consumes: `fixedPriceNotLowerError` and `TimeDiscountItem` from `@/timeDiscounts/config`.
- Produces (all pure): `itemKey({ productId, variantId? }): string`; `discountedPrice({ pricingMode, amount }, regularPrice): number` (fixed is clamped to the regular price; percent is clamped 0–100; rounded to pence); `validateRule(rule, regularPrice | null): string | null`; `validateItemsStructure(items): string | null`; `functionConfigBytes(items): number`; `assertItemsFitFunctionConfig(items): void` (throws "…too many products/variants…"); `FUNCTION_CONFIG_MAX_BYTES = 9500`. Tasks 7, 8 and 9 consume them. (Task 9 adds `productAdminUrl`.)

- [ ] **Step 1: Write the failing tests**

`tests/timeDiscounts/items.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest'
import {
  itemKey, discountedPrice, validateRule, validateItemsStructure,
  functionConfigBytes, assertItemsFitFunctionConfig, FUNCTION_CONFIG_MAX_BYTES,
} from '@/timeDiscounts/items'
import type { TimeDiscountItem } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

describe('itemKey', () => {
  it('distinguishes a whole product from its variants', () => {
    expect(itemKey({ productId: P1 })).not.toBe(itemKey({ productId: P1, variantId: V10 }))
    expect(itemKey({ productId: P1, variantId: V10 })).toBe(itemKey({ productId: P1, variantId: V10 }))
  })
})

describe('discountedPrice', () => {
  it('takes the percentage off the regular price, rounded to pence', () => {
    expect(discountedPrice({ pricingMode: 'percent', amount: 20 }, 22)).toBe(17.6)
    expect(discountedPrice({ pricingMode: 'percent', amount: 12.5 }, 59.99)).toBe(52.49)
  })

  it('uses a fixed amount as the final price, whatever the regular price is', () => {
    expect(discountedPrice({ pricingMode: 'fixed', amount: 22 }, 49.99)).toBe(22)
  })

  it('never shows a fixed price above the regular price (checkout clamps it)', () => {
    expect(discountedPrice({ pricingMode: 'fixed', amount: 30 }, 25)).toBe(25)
  })

  it('clamps a percentage to 0-100', () => {
    expect(discountedPrice({ pricingMode: 'percent', amount: 150 }, 20)).toBe(0)
    expect(discountedPrice({ pricingMode: 'percent', amount: -5 }, 20)).toBe(20)
  })
})

describe('validateRule', () => {
  it('requires an amount above zero', () => {
    expect(validateRule({ pricingMode: 'percent', amount: 0 }, 20)).toBe('Enter an amount greater than zero')
    expect(validateRule({ pricingMode: 'fixed', amount: Number.NaN }, 20)).toBe('Enter an amount greater than zero')
  })

  it('caps a percentage at 100', () => {
    expect(validateRule({ pricingMode: 'percent', amount: 101 }, 20)).toBe('A percentage discount cannot exceed 100%')
    expect(validateRule({ pricingMode: 'percent', amount: 100 }, 20)).toBeNull()
  })

  it('rejects a fixed price not lower than the regular price, naming both', () => {
    expect(validateRule({ pricingMode: 'fixed', amount: 25 }, 20)).toContain('The fixed price (£25.00) is not lower than the regular price (£20.00)')
    expect(validateRule({ pricingMode: 'fixed', amount: 20 }, 20)).not.toBeNull()
    expect(validateRule({ pricingMode: 'fixed', amount: 19.99 }, 20)).toBeNull()
  })

  it('cannot judge a fixed price when the regular price is unknown', () => {
    expect(validateRule({ pricingMode: 'fixed', amount: 25 }, null)).toBeNull()
  })
})

describe('validateItemsStructure', () => {
  const row = (productId: string, variantId?: string): TimeDiscountItem => ({ productId, ...(variantId ? { variantId } : {}), pricingMode: 'percent', amount: 10 })

  it('accepts distinct products and distinct variants of one product', () => {
    expect(validateItemsStructure([row(P1, V10), row(P1, V11), row('gid://shopify/Product/2')])).toBeNull()
  })

  it('rejects the same product/variant twice', () => {
    expect(validateItemsStructure([row(P1, V10), row(P1, V10)])).toBe('This product or variant is already in the discount')
    expect(validateItemsStructure([row(P1), row(P1)])).toBe('This product or variant is already in the discount')
  })

  it('rejects a whole-product row alongside a variant row of the same product', () => {
    expect(validateItemsStructure([row(P1), row(P1, V10)])).toBe('A product cannot have both a whole-product row and variant rows')
    expect(validateItemsStructure([row(P1, V10), row(P1)])).toBe('A product cannot have both a whole-product row and variant rows')
  })
})

describe('function config size', () => {
  const rows = (n: number): TimeDiscountItem[] =>
    Array.from({ length: n }, (_, i) => ({
      productId: `gid://shopify/Product/${10_000_000_000_000 + i}`,
      variantId: `gid://shopify/ProductVariant/${50_000_000_000_000 + i}`,
      pricingMode: 'percent' as const,
      amount: 20.5,
    }))

  it('fits about 60 realistic variant rows under the guard', () => {
    expect(functionConfigBytes(rows(60))).toBeLessThan(FUNCTION_CONFIG_MAX_BYTES)
    expect(() => assertItemsFitFunctionConfig(rows(60))).not.toThrow()
  })

  it('rejects a discount that would exceed the guard, with a clear message', () => {
    expect(() => assertItemsFitFunctionConfig(rows(70))).toThrow('too many products/variants')
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/timeDiscounts/items.test.ts`
Expected: FAIL — `@/timeDiscounts/items` does not exist.

- [ ] **Step 3: Implement**

`src/timeDiscounts/items.ts` (new file):

```ts
import { fixedPriceNotLowerError, type TimeDiscountItem } from '@/timeDiscounts/config'

/**
 * Shopify never hands a Function a metafield value over 10,000 bytes — it
 * comes back as `null`, and the Function then silently applies NO discount at
 * checkout while the admin and storefront still show it as active. Guard well
 * below the real limit.
 */
export const FUNCTION_CONFIG_MAX_BYTES = 9500

type Rule = { pricingMode: 'percent' | 'fixed'; amount: number }
type Key = { productId: string; variantId?: string }

/** Stable identity of a row within a discount. */
export function itemKey(item: Key): string {
  return `${item.productId}|${item.variantId ?? ''}`
}

/**
 * What a customer pays for one unit, in major currency units, rounded to
 * pence. A fixed price at or above the regular price discounts nothing (the
 * checkout Function clamps it), so it never shows as higher than the regular
 * price.
 */
export function discountedPrice(rule: Rule, regularPrice: number): number {
  const price =
    rule.pricingMode === 'fixed'
      ? Math.min(rule.amount, regularPrice)
      : regularPrice * (1 - Math.min(Math.max(rule.amount, 0), 100) / 100)
  return Math.round(price * 100) / 100
}

/** The message to show for an invalid rule, or null when it is fine. `regularPrice` null = unknown. */
export function validateRule(rule: Rule, regularPrice: number | null): string | null {
  if (!(rule.amount > 0)) return 'Enter an amount greater than zero'
  if (rule.pricingMode === 'percent' && rule.amount > 100) return 'A percentage discount cannot exceed 100%'
  return fixedPriceNotLowerError(rule.pricingMode, rule.amount, regularPrice)
}

/**
 * Rules about the rows together: a product/variant appears once, and a
 * whole-product row cannot coexist with variant rows of the same product
 * (which one would apply to the variant?).
 */
export function validateItemsStructure(items: TimeDiscountItem[]): string | null {
  const seen = new Set<string>()
  for (const item of items) {
    const key = itemKey(item)
    if (seen.has(key)) return 'This product or variant is already in the discount'
    seen.add(key)
  }
  for (const item of items) {
    if (item.variantId == null) continue
    if (seen.has(itemKey({ productId: item.productId }))) {
      return 'A product cannot have both a whole-product row and variant rows'
    }
  }
  return null
}

/** Size, in bytes, of the Function config these rows serialize to. */
export function functionConfigBytes(items: TimeDiscountItem[]): number {
  return new TextEncoder().encode(JSON.stringify({ items })).length
}

export function assertItemsFitFunctionConfig(items: TimeDiscountItem[]): void {
  if (functionConfigBytes(items) > FUNCTION_CONFIG_MAX_BYTES) {
    throw new Error(
      `This discount has too many products/variants to fit in a single time-based discount (${items.length} rows; about 60 is the most). Split it into two discounts.`,
    )
  }
}
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run tests/timeDiscounts/items.test.ts && npx tsc --noEmit -p .`
Expected: 14 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/items.ts tests/timeDiscounts/items.test.ts
git commit -m "feat: per-row helpers — price display, validation, function-config size"
```


### Task 6: The "Saved" pill

**Files:**
- Create: `src/components/SavedToast.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/components/SavedToast.test.tsx`

**Interfaces:**
- Consumes: Tailwind theme colours already defined in `src/app/globals.css` (`bg-accent`).
- Produces: `SavedToastProvider` (wraps the app in the layout) and `useSavedToast(): { showSaved(): void }`; constants `SAVED_TOAST_VISIBLE_MS = 4000` and `SAVED_TOAST_SLIDE_MS = 300`. Task 9's editor calls `showSaved()` after each successful save.

- [ ] **Step 1: Write the failing test**

`tests/components/SavedToast.test.tsx` (new file):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SavedToastProvider, useSavedToast, SAVED_TOAST_VISIBLE_MS, SAVED_TOAST_SLIDE_MS } from '@/components/SavedToast'

function SaveButton() {
  const { showSaved } = useSavedToast()
  return <button onClick={showSaved}>save</button>
}

function setup() {
  render(<SavedToastProvider><SaveButton /></SavedToastProvider>)
}

const click = () => act(() => { screen.getByRole('button', { name: 'save' }).click() })
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('SavedToast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('is not in the page until something is saved', () => {
    setup()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appears above the top edge, then slides down to 50px', () => {
    setup()
    click()
    const pill = screen.getByText('Saved')
    expect(pill).toHaveClass('-translate-y-[120%]')
    advance(20)
    expect(pill).toHaveClass('translate-y-[50px]')
    expect(pill).not.toHaveClass('-translate-y-[120%]')
  })

  it('stays down for 4 seconds, then slides back above the top and is removed from the page', () => {
    setup()
    click()
    advance(SAVED_TOAST_VISIBLE_MS - 100)
    expect(screen.getByText('Saved')).toHaveClass('translate-y-[50px]')

    advance(100) // 4s reached: slides back up but is still mounted while it animates
    expect(screen.getByText('Saved')).toHaveClass('-translate-y-[120%]')

    advance(SAVED_TOAST_SLIDE_MS)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('is announced politely to assistive technology', () => {
    setup()
    click()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('restarts the 4 seconds on a second save instead of stacking another pill', () => {
    setup()
    click()
    advance(3000)
    click()
    advance(3000) // 6s after the first save, 3s after the second
    expect(screen.getAllByText('Saved')).toHaveLength(1)
    expect(screen.getByText('Saved')).toHaveClass('translate-y-[50px]')
    advance(1000 + SAVED_TOAST_SLIDE_MS)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('comes back down if saved again while it is already sliding out', () => {
    setup()
    click()
    advance(SAVED_TOAST_VISIBLE_MS + 100) // sliding out
    click()
    advance(20)
    expect(screen.getByText('Saved')).toHaveClass('translate-y-[50px]')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/components/SavedToast.test.tsx`
Expected: FAIL — `@/components/SavedToast` does not exist.

- [ ] **Step 3: Implement**

`src/components/SavedToast.tsx` (new file):

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/** How long the pill stays down, counted from the moment it is shown. */
export const SAVED_TOAST_VISIBLE_MS = 4000
/** Slide duration — must match the `duration-300` class below. */
export const SAVED_TOAST_SLIDE_MS = 300
/** One tick after mounting, so the browser paints the pill above the top edge before it slides down. */
const ENTER_DELAY_MS = 16

type Phase = 'hidden' | 'entering' | 'visible' | 'leaving'

const SavedToastContext = createContext<{ showSaved: () => void }>({ showSaved: () => {} })

/** Call `showSaved()` after a successful save. */
export function useSavedToast() {
  return useContext(SavedToastContext)
}

/**
 * Renders the "Saved" pill once for the whole app. It slides down from above
 * the top edge to ~50px, stays for 4 seconds, slides back up above the top of
 * the window, and is then removed from the DOM. Showing it again while it is
 * visible (or leaving) restarts the 4 seconds instead of stacking a second one.
 */
export function SavedToastProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('hidden')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const showSaved = useCallback(() => {
    clearTimers()
    setPhase((current) => (current === 'visible' || current === 'leaving' ? 'visible' : 'entering'))
    timers.current.push(setTimeout(() => setPhase('visible'), ENTER_DELAY_MS))
    timers.current.push(
      setTimeout(() => {
        setPhase('leaving')
        timers.current.push(setTimeout(() => setPhase('hidden'), SAVED_TOAST_SLIDE_MS))
      }, SAVED_TOAST_VISIBLE_MS),
    )
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])

  return (
    <SavedToastContext.Provider value={{ showSaved }}>
      {children}
      {phase !== 'hidden' && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
          <div
            className={`rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-opacity ${
              phase === 'visible'
                ? 'translate-y-[50px] opacity-100'
                : '-translate-y-[120%] opacity-0 motion-reduce:translate-y-[50px]'
            }`}
          >
            Saved
          </div>
        </div>
      )}
    </SavedToastContext.Provider>
  )
}
```
`src/app/layout.tsx` — apply this change:

```diff
diff --git a/src/app/layout.tsx b/src/app/layout.tsx
index 9a01a6c..dbe4945 100644
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -1,6 +1,7 @@
 import type { Metadata } from "next";
 import { headers } from "next/headers";
 import AuthTokenInit from "@/components/AuthTokenInit";
+import { SavedToastProvider } from "@/components/SavedToast";
 import packageJson from "../../package.json";
 import "./globals.css";
 
@@ -28,7 +29,7 @@ export default async function RootLayout({
         <div className="text-xs text-subtle text-right px-4 pt-1">
           v{packageJson.version}
         </div>
-        {children}
+        <SavedToastProvider>{children}</SavedToastProvider>
       </body>
     </html>
   );
```

- [ ] **Step 4: Run the test and the type-check**

Run: `npx vitest run tests/components/SavedToast.test.tsx && npx tsc --noEmit -p .`
Expected: 6 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/SavedToast.tsx src/app/layout.tsx tests/components/SavedToast.test.tsx
git commit -m "feat: Saved pill that slides in from the top and out again after 4 seconds"
```


### Task 7: Add-product picker that hands the chosen item back

**Files:**
- Create: `src/timeDiscounts/components/AddItemPicker.tsx`
- Test: `tests/timeDiscounts/components/AddItemPicker.test.tsx`

**Interfaces:**
- Consumes: `searchTimeDiscountProductsAction`, `getTimeDiscountProductVariantsAction`, `validateTimeDiscountMemberAction` from `@/timeDiscounts/pickerActions` (existing); `itemKey` from Task 5; `ProductSearchResult`, `ProductVariantOption` from `@/lib/products`.
- Produces: default export `AddItemPicker({ excludeDiscountId?, existingKeys: string[], onSelect(item: PickedItem) })` and `type PickedItem = { productId: string; variantId?: string; title: string; price: number }`. It keeps no list of its own and renders no hidden inputs; `existingKeys` (the `itemKey` of every current row) keeps already-added products out of the results. Task 9's editor uses it.

- [ ] **Step 1: Write the failing test**

`tests/timeDiscounts/components/AddItemPicker.test.tsx` (new file):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import AddItemPicker from '@/timeDiscounts/components/AddItemPicker'
import * as pickerActions from '@/timeDiscounts/pickerActions'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const SEARCH = 'Search for a product to add…'

async function search(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText(SEARCH), text)
  await vi.advanceTimersByTimeAsync(300)
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.pointer({ keys: '[MouseLeft]', target: await screen.findByText(name) })
}

describe('AddItemPicker', () => {
  it('hands a single-variant product to onSelect with its price, and keeps no list of its own', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([{ variantId: 'gid://shopify/ProductVariant/900', title: 'Default', price: 4.5 }])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: true })
    const onSelect = vi.fn()

    const { container } = render(<AddItemPicker existingKeys={[]} onSelect={onSelect} />)
    await search(user, 'tuna')
    await pick(user, 'Tuna Soup')

    expect(onSelect).toHaveBeenCalledWith({ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', price: 4.5 })
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
    expect(screen.getByPlaceholderText(SEARCH)).toHaveValue('')
  })

  it('expands a multi-variant product and hands the chosen variant to onSelect', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([{ id: 'gid://shopify/Product/2', title: 'Salmon Bowl', variantCount: 2 }])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/901', title: 'Small', price: 3 },
      { variantId: 'gid://shopify/ProductVariant/902', title: 'Large', price: 5 },
    ])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: true })
    const onSelect = vi.fn()

    render(<AddItemPicker existingKeys={[]} onSelect={onSelect} />)
    await search(user, 'salmon')
    await pick(user, 'Salmon Bowl')
    await user.click(await screen.findByRole('button', { name: /Large — £5.00/ }))

    expect(onSelect).toHaveBeenCalledWith({
      productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/902', title: 'Salmon Bowl – Large', price: 5,
    })
  })

  it('leaves products already in the discount out of the results, and variants already added out of the variant list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([
      { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 },
      { id: 'gid://shopify/Product/2', title: 'Salmon Bowl', variantCount: 2 },
    ])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/901', title: 'Small', price: 3 },
      { variantId: 'gid://shopify/ProductVariant/902', title: 'Large', price: 5 },
    ])

    render(
      <AddItemPicker
        existingKeys={['gid://shopify/Product/1|', 'gid://shopify/Product/2|gid://shopify/ProductVariant/901']}
        onSelect={vi.fn()}
      />,
    )
    await search(user, 'a food')

    expect(screen.queryByText('Tuna Soup')).not.toBeInTheDocument()
    await pick(user, 'Salmon Bowl')
    expect(screen.queryByRole('button', { name: /Small/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Large/ })).toBeInTheDocument()
  })

  it('shows the server\'s reason inline and does not select when the product belongs to another discount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: false, error: 'This product already belongs to another discount' })
    const onSelect = vi.fn()

    render(<AddItemPicker existingKeys={[]} onSelect={onSelect} />)
    await search(user, 'tuna')
    await pick(user, 'Tuna Soup')

    expect(await screen.findByRole('alert')).toHaveTextContent('This product already belongs to another discount')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/timeDiscounts/components/AddItemPicker.test.tsx`
Expected: FAIL — `@/timeDiscounts/components/AddItemPicker` does not exist.

- [ ] **Step 3: Implement**

`src/timeDiscounts/components/AddItemPicker.tsx` (new file):

```tsx
'use client'

import { useRef, useState } from 'react'
import {
  searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction, validateTimeDiscountMemberAction,
} from '@/timeDiscounts/pickerActions'
import { itemKey } from '@/timeDiscounts/items'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

export type PickedItem = { productId: string; variantId?: string; title: string; price: number }

/**
 * Search box that adds one product or variant at a time. It keeps no list of
 * its own: the chosen item is handed to `onSelect`, and `existingKeys` (the
 * itemKey of every row already in the discount) keeps already-added products
 * out of the results.
 */
export default function AddItemPicker({
  excludeDiscountId,
  existingKeys,
  onSelect,
}: {
  excludeDiscountId?: string
  existingKeys: string[]
  onSelect: (item: PickedItem) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanding, setExpanding] = useState<ProductSearchResult | null>(null)
  const [variantOptions, setVariantOptions] = useState<ProductVariantOption[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  const alreadyAdded = (productId: string, variantId?: string) => existingKeys.includes(itemKey({ productId, variantId }))
  const rowsForProduct = (productId: string) => existingKeys.filter((key) => key.startsWith(`${productId}|`)).length

  function handleQueryChange(value: string) {
    setQuery(value)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      ++generationRef.current
      return
    }

    setSearching(true)
    const generation = ++generationRef.current

    debounceRef.current = setTimeout(async () => {
      const matches = await searchTimeDiscountProductsAction(value, excludeDiscountId)
      if (generation === generationRef.current) {
        setResults(
          matches.filter((m) => (m.variantCount <= 1 ? !alreadyAdded(m.id) : rowsForProduct(m.id) < m.variantCount)),
        )
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  async function chooseProduct(candidate: ProductSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setError(null)

    if (candidate.variantCount > 1) {
      const options = await getTimeDiscountProductVariantsAction(candidate.id, excludeDiscountId)
      setExpanding(candidate)
      setVariantOptions(options.filter((o) => !alreadyAdded(candidate.id, o.variantId)))
      return
    }

    if (alreadyAdded(candidate.id)) {
      setError('This product is already added')
      return
    }

    const check = await validateTimeDiscountMemberAction(candidate.id, undefined, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }

    const [onlyVariant] = await getTimeDiscountProductVariantsAction(candidate.id)
    onSelect({ productId: candidate.id, title: candidate.title, price: onlyVariant?.price ?? 0 })
  }

  async function chooseVariant(option: ProductVariantOption) {
    if (!expanding) return

    if (alreadyAdded(expanding.id, option.variantId)) {
      setError('This variant is already added')
      return
    }

    const check = await validateTimeDiscountMemberAction(expanding.id, option.variantId, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }

    onSelect({ productId: expanding.id, variantId: option.variantId, title: `${expanding.title} – ${option.title}`, price: option.price })
    setExpanding(null)
    setVariantOptions([])
  }

  return (
    <div>
      {expanding && (
        <div className="border border-line rounded p-3 mb-2 space-y-2">
          <p className="text-sm font-medium">{expanding.title} — select a variant:</p>
          {variantOptions.map((option) => (
            <button
              key={option.variantId}
              type="button"
              onClick={() => chooseVariant(option)}
              className="w-full text-left px-3 py-2 border border-line rounded hover:bg-line transition-colors duration-200 text-sm"
            >
              {option.title} — £{option.price.toFixed(2)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setExpanding(null); setVariantOptions([]) }}
            className="text-xs text-muted hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="relative">
        <label htmlFor="time-discount-member-search" className="sr-only">
          Search for a product to add
        </label>
        <input
          id="time-discount-member-search"
          type="text"
          placeholder="Search for a product to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {error && <p role="alert" className="text-xs text-danger mt-1">{error}</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseDown={() => chooseProduct(product)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {product.title}
                  {product.variantCount > 1 && <span className="text-muted"> ({product.variantCount} variants)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test and the type-check**

Run: `npx vitest run tests/timeDiscounts/components/AddItemPicker.test.tsx && npx tsc --noEmit -p .`
Expected: 4 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/components/AddItemPicker.tsx tests/timeDiscounts/components/AddItemPicker.test.tsx
git commit -m "feat: add-product picker that hands the chosen item back"
```


### Task 8: The table row — display, inline edit, grey icon buttons

**Files:**
- Create: `src/timeDiscounts/components/ItemRow.tsx`
- Test: `tests/timeDiscounts/components/ItemRow.test.tsx`

**Interfaces:**
- Consumes: `discountedPrice`, `validateRule` from Task 5.
- Produces: default export `ItemRow({ row, editing, busy, error, onEdit, onCancel, onSave(rule), onDelete })` rendering table rows (`<tr>`), and `type DisplayRow = { productId; variantId?; title; adminUrl; regularPrice: number | null; pricingMode; amount; isNew? }`. Display mode: product link (new tab), type, discounted price, regular price, grey pencil and bin buttons labelled "Edit {title}" / "Delete {title}". Edit mode: type select + amount input + live preview + Save/Cancel, with the validation message inline and Save disabled while invalid. It does not confirm deletes or talk to the server — the editor (Task 9) does.

- [ ] **Step 1: Write the failing test**

`tests/timeDiscounts/components/ItemRow.test.tsx` (new file):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import ItemRow, { type DisplayRow } from '@/timeDiscounts/components/ItemRow'

afterEach(cleanup)

const row: DisplayRow = {
  productId: 'gid://shopify/Product/1',
  title: 'Water Resistant Roll Up Travel Pet Bed',
  adminUrl: 'https://shop.myshopify.com/admin/products/1',
  regularPrice: 22,
  pricingMode: 'percent',
  amount: 20,
}

function renderRow(overrides: Partial<React.ComponentProps<typeof ItemRow>> = {}) {
  const props = {
    row, editing: false, busy: false, error: null,
    onEdit: vi.fn(), onCancel: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  }
  render(<table><tbody><ItemRow {...props} /></tbody></table>)
  return props
}

describe('ItemRow — display', () => {
  it('shows name (linked to the admin product page), type, discounted price and regular price', () => {
    renderRow()
    const link = screen.getByRole('link', { name: 'Water Resistant Roll Up Travel Pet Bed' })
    expect(link).toHaveAttribute('href', 'https://shop.myshopify.com/admin/products/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText('20% off')).toBeInTheDocument()
    expect(screen.getByText('£17.60')).toBeInTheDocument()
    expect(screen.getByText('£22.00')).toBeInTheDocument()
  })

  it('shows a fixed price row as "Fixed price" with the fixed amount as the discounted price', () => {
    renderRow({ row: { ...row, pricingMode: 'fixed', amount: 15.5 } })
    expect(screen.getByText('Fixed price')).toBeInTheDocument()
    expect(screen.getByText('£15.50')).toBeInTheDocument()
  })

  it('shows dashes when the product could not be looked up', () => {
    renderRow({ row: { ...row, regularPrice: null } })
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('has labelled edit and delete icon buttons that call back', async () => {
    const user = userEvent.setup()
    const props = renderRow()
    await user.click(screen.getByRole('button', { name: 'Edit Water Resistant Roll Up Travel Pet Bed' }))
    await user.click(screen.getByRole('button', { name: 'Delete Water Resistant Roll Up Travel Pet Bed' }))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('disables both icon buttons while busy', () => {
    renderRow({ busy: true })
    expect(screen.getByRole('button', { name: /^Edit / })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Delete / })).toBeDisabled()
  })

  it('shows a save/delete error under the row', () => {
    renderRow({ error: 'This product already belongs to another discount' })
    expect(screen.getByRole('alert')).toHaveTextContent('This product already belongs to another discount')
  })
})

describe('ItemRow — editing', () => {
  it('replaces the type and price cells with inputs, starting from the saved rule', () => {
    renderRow({ editing: true })
    expect(screen.getByLabelText(/Discount type for/)).toHaveValue('percent')
    expect(screen.getByLabelText(/Percent off for/)).toHaveValue(20)
    expect(screen.queryByText('20% off')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('previews the discounted price as you type', async () => {
    const user = userEvent.setup()
    renderRow({ editing: true })
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '50')
    expect(screen.getByText('→ £11.00')).toBeInTheDocument()
  })

  it('saves the chosen type and a pence-rounded amount', async () => {
    const user = userEvent.setup()
    const props = renderRow({ editing: true })
    await user.selectOptions(screen.getByLabelText(/Discount type for/), 'fixed')
    await user.clear(screen.getByLabelText(/Fixed price for/))
    await user.type(screen.getByLabelText(/Fixed price for/), '17.567')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledWith({ pricingMode: 'fixed', amount: 17.57 })
  })

  it('blocks saving a fixed price that is not lower than the regular price, and says why', async () => {
    const user = userEvent.setup()
    const props = renderRow({ editing: true })
    await user.selectOptions(screen.getByLabelText(/Discount type for/), 'fixed')
    await user.clear(screen.getByLabelText(/Fixed price for/))
    await user.type(screen.getByLabelText(/Fixed price for/), '25')
    expect(screen.getByRole('alert')).toHaveTextContent('The fixed price (£25.00) is not lower than the regular price (£22.00)')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('blocks a percentage over 100', async () => {
    const user = userEvent.setup()
    renderRow({ editing: true })
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '120')
    expect(screen.getByRole('alert')).toHaveTextContent('A percentage discount cannot exceed 100%')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('starts a new row empty, with Save disabled and no error until something is typed', () => {
    renderRow({ editing: true, row: { ...row, isNew: true, amount: 0 } })
    expect(screen.getByLabelText(/Percent off for/)).toHaveValue(null)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cancels', async () => {
    const user = userEvent.setup()
    const props = renderRow({ editing: true })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables Save and Cancel while a save is in flight', () => {
    renderRow({ editing: true, busy: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/timeDiscounts/components/ItemRow.test.tsx`
Expected: FAIL — `@/timeDiscounts/components/ItemRow` does not exist.

- [ ] **Step 3: Implement**

Task 9 makes one small styling tweak to this file (price cells stay on one line); the version below is the Task 8 state.

`src/timeDiscounts/components/ItemRow.tsx` (new file):

```tsx
'use client'

import { useState } from 'react'
import { discountedPrice, validateRule } from '@/timeDiscounts/items'

export type DisplayRow = {
  productId: string
  variantId?: string
  title: string
  /** Link to the product in the Shopify admin. */
  adminUrl: string
  /** null when the product could not be looked up. */
  regularPrice: number | null
  pricingMode: 'percent' | 'fixed'
  amount: number
  /** Added in this session and not saved yet. */
  isNew?: boolean
}

type Rule = { pricingMode: 'percent' | 'fixed'; amount: number }

const money = (value: number) => `£${value.toFixed(2)}`

const iconButton =
  'rounded p-2 text-foreground/40 transition-colors duration-200 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50'

function PencilIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

function BinIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function ProductLink({ row }: { row: DisplayRow }) {
  return (
    <a href={row.adminUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
      {row.title}
    </a>
  )
}

/** One table row of a time-based discount; swaps its cells for an inline form while editing. */
export default function ItemRow({
  row, editing, busy, error, onEdit, onCancel, onSave, onDelete,
}: {
  row: DisplayRow
  editing: boolean
  busy: boolean
  /** Server-side reason the last save/delete failed. */
  error: string | null
  onEdit: () => void
  onCancel: () => void
  onSave: (rule: Rule) => void
  onDelete: () => void
}) {
  return (
    <>
      {editing ? (
        <EditCells row={row} busy={busy} onCancel={onCancel} onSave={onSave} />
      ) : (
        <tr className="border-b border-line align-middle">
          <td className="py-3 pr-3"><ProductLink row={row} /></td>
          <td className="py-3 pr-3 text-sm">{row.pricingMode === 'fixed' ? 'Fixed price' : `${row.amount}% off`}</td>
          <td className="py-3 pr-3 text-sm font-medium">
            {row.regularPrice == null ? '—' : money(discountedPrice(row, row.regularPrice))}
          </td>
          <td className="py-3 pr-3 text-sm text-muted">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
          <td className="py-3 text-right">
            <button type="button" onClick={onEdit} disabled={busy} aria-label={`Edit ${row.title}`} className={iconButton}><PencilIcon /></button>
          </td>
          <td className="py-3 text-right">
            <button type="button" onClick={onDelete} disabled={busy} aria-label={`Delete ${row.title}`} className={iconButton}><BinIcon /></button>
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={6} role="alert" className="pb-3 text-xs text-danger">{error}</td>
        </tr>
      )}
    </>
  )
}

function EditCells({
  row, busy, onCancel, onSave,
}: {
  row: DisplayRow
  busy: boolean
  onCancel: () => void
  onSave: (rule: Rule) => void
}) {
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>(row.pricingMode)
  const [amountText, setAmountText] = useState(row.isNew ? '' : String(row.amount))

  const amount = Math.round(Number(amountText) * 100) / 100
  const rule: Rule = { pricingMode, amount }
  const message = validateRule(rule, row.regularPrice)
  const valid = amountText.trim() !== '' && message == null
  const label = pricingMode === 'percent' ? 'Percent off' : 'Fixed price'

  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-3"><ProductLink row={row} /></td>
      <td colSpan={2} className="py-3 pr-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Discount type for ${row.title}`}
            value={pricingMode}
            onChange={(e) => setPricingMode(e.target.value === 'fixed' ? 'fixed' : 'percent')}
            className="border border-line rounded px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed price</option>
          </select>
          <input
            type="number" min="0.01" max={pricingMode === 'percent' ? 100 : undefined} step="0.01"
            aria-label={`${label} for ${row.title}`}
            placeholder={pricingMode === 'percent' ? '% off (e.g. 20)' : 'Price each (e.g. 1.50)'}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="w-32 border border-line rounded px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {valid && row.regularPrice != null && (
            <span className="text-sm text-muted">→ {money(discountedPrice(rule, row.regularPrice))}</span>
          )}
        </div>
        {amountText.trim() !== '' && message && <p role="alert" className="mt-1 text-xs text-danger">{message}</p>}
      </td>
      <td className="py-3 pr-3 text-sm text-muted">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
      <td colSpan={2} className="py-3 text-right whitespace-nowrap">
        <button
          type="button" disabled={!valid || busy} onClick={() => onSave(rule)}
          className="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded text-sm mr-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button" disabled={busy} onClick={onCancel}
          className="bg-surface border border-line hover:bg-line px-3 py-2 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          Cancel
        </button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: Run the test and the type-check**

Run: `npx vitest run tests/timeDiscounts/components/ItemRow.test.tsx && npx tsc --noEmit -p .`
Expected: 14 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/components/ItemRow.tsx tests/timeDiscounts/components/ItemRow.test.tsx
git commit -m "feat: table row with inline edit and grey edit/delete icon buttons"
```


### Task 9: Cutover — stored model, row actions, the new page, autosave

This is **one atomic task by necessity**: the stored model, the server actions and the pages cannot be switched separately without leaving the build broken, so there is a single verification (Step 10) and a single commit. Work through Steps 1–9 in order, then run Step 10.

**Files:**
- Modify: `src/timeDiscounts/config.ts`, `src/timeDiscounts/metafieldSync.ts`, `src/timeDiscounts/actions.ts` (rewritten), `src/timeDiscounts/items.ts`, `src/timeDiscounts/pickerActions.ts`, `src/timeDiscounts/components/ItemRow.tsx`, `src/timeDiscounts/components/NewTimeDiscountForm.tsx` (rewritten), `src/app/time-discounts/[discountId]/page.tsx` (rewritten), `src/app/page.tsx`
- Create: `src/timeDiscounts/components/TimeDiscountEditor.tsx`, `src/timeDiscounts/components/useSaveQueue.ts`
- Delete: `src/timeDiscounts/components/TimeProductPicker.tsx`, `src/timeDiscounts/components/TimeCollectionPicker.tsx`, `src/timeDiscounts/components/PricingAmountFields.tsx`, `src/lib/collections.ts` (its only users were the collections picker and action)
- Test: `tests/timeDiscounts/config.test.ts`, `metafieldSync.test.ts`, `actions.test.ts` (rewritten), `items.test.ts`, `pickerActions.test.ts`, `tests/lib/discount-availability.test.ts`; create `tests/timeDiscounts/components/TimeDiscountEditor.test.tsx`, `useSaveQueue.test.ts`, `NewTimeDiscountForm.test.tsx` (replaces the old one); delete `tests/timeDiscounts/components/TimeProductPicker.test.tsx`, `TimeCollectionPicker.test.tsx`, `tests/lib/collections.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces:
  - `TimeDiscount` = `{ discountId, shopifyDiscountId, name, title, startsAt, endsAt, items: TimeDiscountItem[] }`; `StoredTimeDiscount` (what may be on disk); `normalizeTimeDiscount(stored): TimeDiscount` (replaces `getDiscountItems`); `getTimeDiscountsConfig()` returns normalized discounts; `isTimeDiscountMemberAvailable` checks rows.
  - `syncTimeDiscountMetafields(discount, timeZone, onlyProductIds?: string[])`.
  - Server actions (`src/timeDiscounts/actions.ts`): `createTimeDiscount(formData: FormData): Promise<void>` (fields `title`, `startsAt`, `endsAt`; redirects), `saveTimeDiscountTitle(discountId, title): Promise<SaveResult>`, `saveTimeDiscountSchedule(discountId, startsAt, endsAt): Promise<SaveResult>`, `saveTimeDiscountItem(discountId, { productId, variantId?, pricingMode, amount }): Promise<SaveResult>` (adds or replaces), `removeTimeDiscountItem(discountId, { productId, variantId? }): Promise<SaveResult>`, `deleteTimeDiscount(discountId): Promise<void>` (redirects); `type SaveResult = { ok: true } | { ok: false; error: string }`.
  - `productAdminUrl(baseUrl, productId)` in `items.ts`.
  - `TimeDiscountEditor` (client) with props `{ discountId, shopTimezone, adminProductBaseUrl, initialTitle, initialStartsAt, initialEndsAt, initialRows: DisplayRow[], deleteAction }` and `SCHEDULE_SAVE_DELAY_MS = 600`.

- [ ] **Step 1: Write the failing tests**

Tests for the model and sync (diffs against the PR 1 versions):

`tests/timeDiscounts/config.test.ts` — apply this change:

```diff
diff --git a/tests/timeDiscounts/config.test.ts b/tests/timeDiscounts/config.test.ts
index ae41742..458f8f2 100644
--- a/tests/timeDiscounts/config.test.ts
+++ b/tests/timeDiscounts/config.test.ts
@@ -1,7 +1,7 @@
 import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
 import {
-  getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, pricesUniform, fixedPriceNotLowerError, getDiscountItems,
-  computeTimeDiscountStatusLabel, type TimeDiscountsConfig,
+  getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, fixedPriceNotLowerError, normalizeTimeDiscount,
+  computeTimeDiscountStatusLabel, type TimeDiscountsConfig, type StoredTimeDiscount,
 } from '@/timeDiscounts/config'
 import * as shopifyClient from '@/lib/shopify-client'
 
@@ -13,9 +13,8 @@ describe('getTimeDiscountsConfig', () => {
       discounts: [
         {
           discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash Sale', title: 'Flash Sale',
-          pricingMode: 'percent', amount: 20, startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
-          selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
-          resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
+          startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
+          items: [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 }],
         },
       ],
     }
@@ -25,6 +24,24 @@ describe('getTimeDiscountsConfig', () => {
     expect(config).toEqual(stored)
   })
 
+  it('converts a discount saved before per-row pricing into rows as it reads it', async () => {
+    const legacy = {
+      discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash Sale', title: 'Flash Sale',
+      pricingMode: 'fixed', amount: 22, startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
+      selection: { mode: 'collections', collectionIds: ['gid://shopify/Collection/1'] },
+      resolvedMembers: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
+    }
+    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify({ discounts: [legacy] }) } } })
+
+    const [discount] = (await getTimeDiscountsConfig()).discounts
+    expect(discount.items).toEqual([
+      { productId: 'gid://shopify/Product/1', pricingMode: 'fixed', amount: 22 },
+      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'fixed', amount: 22 },
+    ])
+    expect(discount).not.toHaveProperty('selection')
+    expect(discount).not.toHaveProperty('resolvedMembers')
+  })
+
   it('returns an empty discount list when no metafield exists yet', async () => {
     vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })
     expect(await getTimeDiscountsConfig()).toEqual({ discounts: [] })
@@ -76,18 +93,16 @@ describe('isTimeDiscountMemberAvailable', () => {
   const baseConfig: TimeDiscountsConfig = {
     discounts: [
       {
-        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
+        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X',
         startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
-        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
-        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
+        items: [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 10 }],
       },
       {
-        discountId: 'time_disc_2', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/2', name: 'Y', title: 'Y', pricingMode: 'percent', amount: 10,
+        discountId: 'time_disc_2', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/2', name: 'Y', title: 'Y',
         startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
-        selection: { mode: 'collections', collectionIds: ['gid://shopify/Collection/1'] },
-        resolvedMembers: [
-          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
-          { productId: 'gid://shopify/Product/3' },
+        items: [
+          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'percent', amount: 10 },
+          { productId: 'gid://shopify/Product/3', pricingMode: 'fixed', amount: 5 },
         ],
       },
     ],
@@ -114,21 +129,6 @@ describe('isTimeDiscountMemberAvailable', () => {
   })
 })
 
-describe('pricesUniform', () => {
-  it('is true for zero or one price', () => {
-    expect(pricesUniform([])).toBe(true)
-    expect(pricesUniform([1.49])).toBe(true)
-  })
-
-  it('is true when prices match within floating-point tolerance', () => {
-    expect(pricesUniform([1.1 + 0.39, 1.49])).toBe(true)
-  })
-
-  it('is false when any price differs', () => {
-    expect(pricesUniform([1.49, 1.59])).toBe(false)
-  })
-})
-
 describe('computeTimeDiscountStatusLabel', () => {
   const TIME_ZONE = 'UTC'
   const startsAt = '2026-01-01T00:00'
@@ -187,34 +187,37 @@ describe('fixedPriceNotLowerError', () => {
   })
 })
 
-describe('getDiscountItems', () => {
-  const base = {
-    pricingMode: 'fixed' as const,
-    amount: 22,
-    resolvedMembers: [
-      { productId: 'gid://shopify/Product/1' },
-      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
-    ],
+describe('normalizeTimeDiscount', () => {
+  const base: StoredTimeDiscount = {
+    discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Old name', title: 'Summer Sale',
+    startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
   }
 
   it('turns each resolved member of an older discount into a row carrying the discount\'s one shared rule', () => {
-    expect(getDiscountItems(base)).toEqual([
+    const result = normalizeTimeDiscount({
+      ...base, pricingMode: 'fixed', amount: 22,
+      resolvedMembers: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
+    })
+    expect(result.items).toEqual([
       { productId: 'gid://shopify/Product/1', pricingMode: 'fixed', amount: 22 },
       { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'fixed', amount: 22 },
     ])
   })
 
   it('omits variantId on whole-product rows instead of writing undefined', () => {
-    const [whole] = getDiscountItems(base)
+    const [whole] = normalizeTimeDiscount({ ...base, pricingMode: 'percent', amount: 10, resolvedMembers: [{ productId: 'gid://shopify/Product/1' }] }).items
     expect('variantId' in whole).toBe(false)
   })
 
-  it('returns stored items as they are, ignoring the older fields', () => {
+  it('keeps stored items as they are, ignoring the older fields', () => {
     const items = [{ productId: 'gid://shopify/Product/9', pricingMode: 'percent' as const, amount: 10 }]
-    expect(getDiscountItems({ ...base, items })).toBe(items)
+    expect(normalizeTimeDiscount({ ...base, items, pricingMode: 'fixed', amount: 99, resolvedMembers: [{ productId: 'gid://shopify/Product/1' }] }).items).toBe(items)
   })
 
-  it('returns no rows for a discount with no members', () => {
-    expect(getDiscountItems({ ...base, resolvedMembers: [] })).toEqual([])
+  it('gives a discount with no members no rows, and keeps the name, title and schedule', () => {
+    expect(normalizeTimeDiscount({ ...base, pricingMode: 'percent', amount: 10, resolvedMembers: [] })).toEqual({
+      discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Old name', title: 'Summer Sale',
+      startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items: [],
+    })
   })
 })
```
`tests/timeDiscounts/metafieldSync.test.ts` (new file):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import * as shopifyClient from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'
import type { TimeDiscount } from '@/timeDiscounts/config'

const TIME_ZONE = 'Europe/London'

const discount: TimeDiscount = {
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale',
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  items: [
    { productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 },
    { productId: 'gid://shopify/Product/2', pricingMode: 'fixed', amount: 22.5 },
  ],
}

type MetafieldCall = { ownerId: string; namespace: string; key: string; type: string; value: string }

function writtenMetafields(spy: { mock: { calls: unknown[][] } }): MetafieldCall[] {
  return spy.mock.calls.map((c) => (c[1] as { metafields: MetafieldCall[] }).metafields[0])
}

describe('syncTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one metafield per unique product to the namespace/key the Liquid blocks read, with dates as real UTC instants', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount, TIME_ZONE)

    expect(spy).toHaveBeenCalledTimes(2)
    const written = writtenMetafields(spy).find((m) => m.ownerId === 'gid://shopify/Product/1')!
    expect(written.namespace).toBe('sparkly_product_discounts')
    expect(written.key).toBe('time_based_discount')
    expect(written.type).toBe('json')
    expect(JSON.parse(written.value)).toEqual({
      discountId: 'time_disc_1', title: 'Flash Sale',
      startsAt: zonedTimeToUtc('2026-01-01T00:00', TIME_ZONE), endsAt: zonedTimeToUtc('2026-01-02T00:00', TIME_ZONE),
      items: [{ variantId: null, pricingMode: 'percent', amount: 20 }],
    })
  })

  it('carries each product\'s own rule as-is — no price lookup, the scripts derive the display from the live variant price', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount, TIME_ZONE)

    const byProduct = Object.fromEntries(writtenMetafields(spy).map((m) => [m.ownerId, JSON.parse(m.value).items]))
    expect(byProduct['gid://shopify/Product/1']).toEqual([{ variantId: null, pricingMode: 'percent', amount: 20 }])
    expect(byProduct['gid://shopify/Product/2']).toEqual([{ variantId: null, pricingMode: 'fixed', amount: 22.5 }])
  })

  it('writes one metafield for a product with several variant rows, each with its own rule', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields({
      ...discount,
      items: [
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'fixed', amount: 22 },
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 50 },
      ],
    }, TIME_ZONE)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writtenMetafields(spy)[0].value).items).toEqual([
      { variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'fixed', amount: 22 },
      { variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 50 },
    ])
  })

  it('can be limited to some products, so changing one row does not rewrite every product', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount, TIME_ZONE, ['gid://shopify/Product/2'])

    expect(spy).toHaveBeenCalledTimes(1)
    expect(writtenMetafields(spy)[0].ownerId).toBe('gid://shopify/Product/2')
  })

  it('writes nothing for a discount with no rows', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    await syncTimeDiscountMetafields({ ...discount, items: [] }, TIME_ZONE)
    expect(spy).not.toHaveBeenCalled()
  })

  it('aggregates and throws on any rejected write instead of swallowing it', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })
    spy.mockRejectedValueOnce(new Error('boom'))
    await expect(syncTimeDiscountMetafields(discount, TIME_ZONE)).rejects.toThrow('boom')
  })

  it('throws on Shopify userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [{ field: ['x'], message: 'bad value' }] } })
    await expect(syncTimeDiscountMetafields(discount, TIME_ZONE)).rejects.toThrow('bad value')
  })
})

describe('clearTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the metafield from every unique product', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })
    await clearTimeDiscountMetafields([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/1' }])
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0][1] as { metafields: unknown[] }).metafields).toEqual([
      { ownerId: 'gid://shopify/Product/1', namespace: 'sparkly_product_discounts', key: 'time_based_discount' },
    ])
  })
})
```
`tests/timeDiscounts/items.test.ts` — apply this change:

```diff
diff --git a/tests/timeDiscounts/items.test.ts b/tests/timeDiscounts/items.test.ts
index a0d2129..0cd7b90 100644
--- a/tests/timeDiscounts/items.test.ts
+++ b/tests/timeDiscounts/items.test.ts
@@ -1,6 +1,6 @@
 import { describe, it, expect } from 'vitest'
 import {
-  itemKey, discountedPrice, validateRule, validateItemsStructure,
+  itemKey, productAdminUrl, discountedPrice, validateRule, validateItemsStructure,
   functionConfigBytes, assertItemsFitFunctionConfig, FUNCTION_CONFIG_MAX_BYTES,
 } from '@/timeDiscounts/items'
 import type { TimeDiscountItem } from '@/timeDiscounts/config'
@@ -16,6 +16,12 @@ describe('itemKey', () => {
   })
 })
 
+describe('productAdminUrl', () => {
+  it('links to the product\'s admin page by its numeric id', () => {
+    expect(productAdminUrl('https://shop.myshopify.com/admin/products/', 'gid://shopify/Product/9876543210')).toBe('https://shop.myshopify.com/admin/products/9876543210')
+  })
+})
+
 describe('discountedPrice', () => {
   it('takes the percentage off the regular price, rounded to pence', () => {
     expect(discountedPrice({ pricingMode: 'percent', amount: 20 }, 22)).toBe(17.6)
```
`tests/lib/discount-availability.test.ts` — apply this change:

```diff
diff --git a/tests/lib/discount-availability.test.ts b/tests/lib/discount-availability.test.ts
index dc21c6f..19e51cf 100644
--- a/tests/lib/discount-availability.test.ts
+++ b/tests/lib/discount-availability.test.ts
@@ -14,10 +14,9 @@ const productConfig: Config = {
 const timeConfig: TimeDiscountsConfig = {
   discounts: [
     {
-      discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Y', title: 'Y', pricingMode: 'percent', amount: 10,
+      discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Y', title: 'Y',
       startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
-      selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/2' }] },
-      resolvedMembers: [{ productId: 'gid://shopify/Product/2' }],
+      items: [{ productId: 'gid://shopify/Product/2', pricingMode: 'percent', amount: 10 }],
     },
   ],
 }
```
`tests/timeDiscounts/pickerActions.test.ts` — apply this change:

```diff
diff --git a/tests/timeDiscounts/pickerActions.test.ts b/tests/timeDiscounts/pickerActions.test.ts
index ff1b6d4..fc53f7a 100644
--- a/tests/timeDiscounts/pickerActions.test.ts
+++ b/tests/timeDiscounts/pickerActions.test.ts
@@ -1,10 +1,9 @@
 import { describe, it, expect, vi, beforeEach } from 'vitest'
 import {
   searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction,
-  validateTimeDiscountMemberAction, searchTimeDiscountCollectionsAction,
+  validateTimeDiscountMemberAction,
 } from '@/timeDiscounts/pickerActions'
 import * as productsLib from '@/lib/products'
-import * as collectionsLib from '@/lib/collections'
 import * as configLib from '@/lib/config'
 import * as timeConfigLib from '@/timeDiscounts/config'
 
@@ -32,10 +31,9 @@ describe('searchTimeDiscountProductsAction', () => {
     vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
     vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({
       discounts: [{
-        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
+        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X',
         startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
-        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
-        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
+        items: [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 10 }],
       }],
     })
     expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
@@ -45,10 +43,9 @@ describe('searchTimeDiscountProductsAction', () => {
     vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
     vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({
       discounts: [{
-        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
+        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X',
         startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
-        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
-        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
+        items: [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 10 }],
       }],
     })
     expect(await searchTimeDiscountProductsAction('tuna', 'time_disc_1')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
@@ -74,15 +71,3 @@ describe('validateTimeDiscountMemberAction', () => {
     expect(await validateTimeDiscountMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: true })
   })
 })
-
-describe('searchTimeDiscountCollectionsAction', () => {
-  it('returns [] instead of throwing when the search fails', async () => {
-    vi.spyOn(collectionsLib, 'searchCollections').mockRejectedValue(new Error('boom'))
-    expect(await searchTimeDiscountCollectionsAction('summer')).toEqual([])
-  })
-
-  it('passes through results on success', async () => {
-    vi.spyOn(collectionsLib, 'searchCollections').mockResolvedValue([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
-    expect(await searchTimeDiscountCollectionsAction('summer')).toEqual([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
-  })
-})
```

Tests for the server actions (this file replaces the old one entirely):

`tests/timeDiscounts/actions.test.ts` (new file):

```ts
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import {
  createTimeDiscount, saveTimeDiscountTitle, saveTimeDiscountSchedule,
  saveTimeDiscountItem, removeTimeDiscountItem, deleteTimeDiscount,
} from '@/timeDiscounts/actions'
import * as timeConfigLib from '@/timeDiscounts/config'
import * as configLib from '@/lib/config'
import * as productsLib from '@/lib/products'
import * as metafieldSync from '@/timeDiscounts/metafieldSync'
import * as authRedirect from '@/lib/auth-redirect'
import * as shopLib from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'
import type { TimeDiscount, TimeDiscountItem } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

function formData(entries: [string, string][]): FormData {
  const fd = new FormData()
  for (const [k, v] of entries) fd.append(k, v)
  return fd
}

function discountWith(items: TimeDiscountItem[], overrides: Partial<TimeDiscount> = {}): TimeDiscount {
  return {
    discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale',
    startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items,
    ...overrides,
  }
}

const pct = (productId: string, amount: number, variantId?: string): TimeDiscountItem => ({ productId, ...(variantId ? { variantId } : {}), pricingMode: 'percent', amount })

let saveSpy: MockInstance<typeof timeConfigLib.saveTimeDiscountsConfig>
let shopifyQuerySpy: MockInstance<typeof shopifyClient.shopifyQuery>
let redirectSpy: MockInstance<typeof authRedirect.redirectWithToken>

/** Sets up the stored config and a Shopify that accepts every mutation. */
function storedDiscounts(discounts: TimeDiscount[]) {
  vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockImplementation(async () => structuredClone({ discounts }))
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  redirectSpy = vi.spyOn(authRedirect, 'redirectWithToken').mockResolvedValue(undefined as never)
  vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([{ productId: P1, title: 'X', price: 10, handle: 'x', imageUrl: null }])
  vi.spyOn(shopLib, 'getShopTimezone').mockResolvedValue('Europe/London')
  vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockResolvedValue(undefined)
  vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields').mockResolvedValue(undefined)
  saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
  shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })
  storedDiscounts([])
})

/** The `automaticAppDiscount` input of the Shopify mutation call at `index`. */
function sentToShopify(index = 0) {
  return (shopifyQuerySpy.mock.calls[index][1] as { automaticAppDiscount: Record<string, unknown> }).automaticAppDiscount
}

function functionConfigSent(index = 0) {
  const metafields = sentToShopify(index).metafields as { namespace: string; key: string; value: string }[]
  return { metafield: metafields[0], parsed: JSON.parse(metafields[0].value) }
}

describe('createTimeDiscount', () => {
  const valid: [string, string][] = [['title', 'Summer Sale'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00']]

  it('rejects a submission with no title', async () => {
    await expect(createTimeDiscount(formData([['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00']]))).rejects.toThrow('A title is required')
  })

  it('rejects an end before the start, before anything is created in Shopify', async () => {
    await expect(createTimeDiscount(formData([['title', 'T'], ['startsAt', '2026-01-02T00:00'], ['endsAt', '2026-01-01T00:00']]))).rejects.toThrow('End must be after start')
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('creates the Shopify record with UTC dates and an empty function config, saves a discount with no rows, and opens it', async () => {
    shopifyQuerySpy.mockResolvedValueOnce({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })

    await createTimeDiscount(formData([['title', 'Summer Sale'], ['startsAt', '2026-07-01T12:00'], ['endsAt', '2026-07-02T12:00']]))

    const sent = sentToShopify()
    expect(sent.title).toBe('Summer Sale')
    expect(sent.startsAt).toBe('2026-07-01T11:00:00.000Z') // BST is UTC+1
    expect(sent.endsAt).toBe('2026-07-02T11:00:00.000Z')
    expect(sent.functionHandle).toBe('time-based-discount')
    expect(functionConfigSent().metafield).toMatchObject({ namespace: 'sparkly_time_discounts', key: 'function_config' })
    expect(functionConfigSent().parsed).toEqual({ items: [] })

    const [saved] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(saved).toMatchObject({
      shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/99', title: 'Summer Sale', name: 'Summer Sale',
      startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', items: [],
    })
    expect(redirectSpy).toHaveBeenCalledWith(`/time-discounts/${encodeURIComponent(saved.discountId)}`)
  })

  it('rolls back the Shopify record when saving the app config fails, so no invisible live discount is left behind', async () => {
    shopifyQuerySpy
      .mockResolvedValueOnce({ discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] } })
      .mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [] } })
    saveSpy.mockRejectedValueOnce(new Error('metafield write failed'))

    await expect(createTimeDiscount(formData(valid))).rejects.toThrow('metafield write failed')

    expect(shopifyQuerySpy).toHaveBeenLastCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/99' })
  })

  it('throws Shopify userErrors instead of saving anything', async () => {
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: ['x'], message: 'Title taken' }] } })
    await expect(createTimeDiscount(formData(valid))).rejects.toThrow('Title taken')
    expect(saveSpy).not.toHaveBeenCalled()
  })
})

describe('saveTimeDiscountTitle', () => {
  it('updates the Shopify record, the title and the legacy name, then re-syncs the storefront', async () => {
    storedDiscounts([discountWith([pct(P1, 20)], { name: 'Old internal name' })])

    expect(await saveTimeDiscountTitle('time_disc_1', '  Winter Sale ')).toEqual({ ok: true })

    expect(sentToShopify()).toEqual({ title: 'Winter Sale' })
    expect(saveSpy.mock.calls[0][0].discounts[0]).toMatchObject({ title: 'Winter Sale', name: 'Winter Sale' })
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.objectContaining({ title: 'Winter Sale' }), 'Europe/London', undefined)
  })

  it('refuses an empty title without touching Shopify', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountTitle('time_disc_1', '   ')).toEqual({ ok: false, error: 'A title is required' })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('reports an unknown discount as a result, not a thrown error', async () => {
    const result = await saveTimeDiscountTitle('nope', 'X')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('not found')
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppUpdate: { userErrors: [{ field: ['title'], message: 'Nope' }] } })
    expect(await saveTimeDiscountTitle('time_disc_1', 'X')).toEqual({ ok: false, error: 'Nope' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('still reports success when only the storefront sync fails (the discount is saved and live)', async () => {
    storedDiscounts([discountWith([pct(P1, 20)])])
    vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockRejectedValue(new Error('sync down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await saveTimeDiscountTitle('time_disc_1', 'X')).toEqual({ ok: true })
  })
})

describe('saveTimeDiscountSchedule', () => {
  it('sends UTC dates to Shopify, saves the shop-local dates, and re-syncs', async () => {
    storedDiscounts([discountWith([pct(P1, 20)])])

    expect(await saveTimeDiscountSchedule('time_disc_1', '2026-07-01T12:00', '2026-07-02T12:00')).toEqual({ ok: true })

    expect(sentToShopify()).toEqual({ startsAt: '2026-07-01T11:00:00.000Z', endsAt: '2026-07-02T11:00:00.000Z' })
    expect(saveSpy.mock.calls[0][0].discounts[0]).toMatchObject({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00' })
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalled()
  })

  it('rejects an end that is not after the start, without touching Shopify', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountSchedule('time_disc_1', '2026-07-02T12:00', '2026-07-02T12:00')).toEqual({ ok: false, error: 'End must be after start' })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('rejects a missing date', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountSchedule('time_disc_1', '', '2026-07-02T12:00')).toEqual({ ok: false, error: 'Start and end date/time are required' })
  })
})

describe('saveTimeDiscountItem', () => {
  it('adds a new row: updates the Shopify function config, saves, and syncs only that product', async () => {
    storedDiscounts([discountWith([pct(P2, 10)])])

    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })).toEqual({ ok: true })

    expect(functionConfigSent().parsed).toEqual({ items: [pct(P2, 10), pct(P1, 20)] })
    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([pct(P2, 10), pct(P1, 20)])
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.anything(), 'Europe/London', [P1])
  })

  it('replaces the rule of an existing row instead of adding a second one', async () => {
    storedDiscounts([discountWith([pct(P1, 10, V10), pct(P1, 30, V11)])])

    await saveTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10, pricingMode: 'fixed', amount: 5 })

    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([
      { productId: P1, variantId: V10, pricingMode: 'fixed', amount: 5 },
      pct(P1, 30, V11),
    ])
  })

  it('rounds the amount to pence', async () => {
    storedDiscounts([discountWith([])])
    await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 12.345 })
    expect(saveSpy.mock.calls[0][0].discounts[0].items[0].amount).toBe(12.35)
  })

  it('accepts a fixed price below the regular price', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'fixed', amount: 9.99 })).toEqual({ ok: true })
    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([{ productId: P1, pricingMode: 'fixed', amount: 9.99 }])
  })

  it.each([['higher than', 12], ['equal to', 10]])('rejects a fixed price %s the regular price, before anything is sent to Shopify', async (_label, amount) => {
    storedDiscounts([discountWith([])])
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'fixed', amount })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('is not lower than the regular price (£10.00)') })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('judges each row against its own regular price', async () => {
    storedDiscounts([discountWith([])])
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([{ productId: P1, variantId: V10, title: 'X – Large', price: 60, handle: 'x', imageUrl: null }])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10, pricingMode: 'fixed', amount: 50 })).toEqual({ ok: true })
    expect(productsLib.getMemberInfo).toHaveBeenCalledWith([{ productId: P1, variantId: V10 }])
  })

  it('does not look up a price for a percentage row', async () => {
    storedDiscounts([discountWith([])])
    await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(productsLib.getMemberInfo).not.toHaveBeenCalled()
  })

  it('reports a product Shopify cannot find', async () => {
    storedDiscounts([discountWith([])])
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'fixed', amount: 5 })).toEqual({ ok: false, error: 'This product could not be found in Shopify' })
  })

  it.each([[0], [-5], [Number.NaN]])('rejects an amount of %s', async (amount) => {
    storedDiscounts([discountWith([])])
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount })
    expect(result).toEqual({ ok: false, error: 'Enter an amount greater than zero' })
  })

  it('rejects a percentage over 100', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 101 })).toEqual({ ok: false, error: 'A percentage discount cannot exceed 100%' })
  })

  it('rejects a product that already belongs to another discount', async () => {
    storedDiscounts([
      discountWith([]),
      discountWith([pct(P1, 10)], { discountId: 'time_disc_2' }),
    ])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })).toEqual({ ok: false, error: 'This product already belongs to another discount' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('rejects a product that already belongs to a tier discount', async () => {
    storedDiscounts([discountWith([])])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'tier_1', name: 'Tiers', status: 'active', pricingMode: 'percent', tiers: [], members: [{ productId: P1 }] }],
    } as never)
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(result).toEqual({ ok: false, error: 'This product already belongs to another discount' })
  })

  it('does not re-check availability when only editing a row already in this discount', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    // The only discount holding P1 is this one, so availability would pass anyway; make the check observable instead.
    const availability = await import('@/lib/discount-availability')
    const spy = vi.spyOn(availability, 'isAvailableEverywhere')
    await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 30 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a variant row next to a whole-product row of the same product', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10, pricingMode: 'percent', amount: 20 })).toEqual({
      ok: false, error: 'A product cannot have both a whole-product row and variant rows',
    })
  })

  it('rejects a row that would not fit the Function config, leaving everything unchanged', async () => {
    const many: TimeDiscountItem[] = Array.from({ length: 70 }, (_, i) => ({
      productId: `gid://shopify/Product/${10_000_000_000_000 + i}`,
      variantId: `gid://shopify/ProductVariant/${50_000_000_000_000 + i}`,
      pricingMode: 'percent', amount: 20.5,
    }))
    storedDiscounts([discountWith(many)])
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('too many products/variants')
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppUpdate: { userErrors: [{ field: ['metafields'], message: 'Function failed' }] } })
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })).toEqual({ ok: false, error: 'Function failed' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('reports an unknown discount as a result', async () => {
    const result = await saveTimeDiscountItem('nope', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(result.ok).toBe(false)
  })
})

describe('removeTimeDiscountItem', () => {
  it('removes the row, updates Shopify and the app config, and clears the product\'s storefront metafield when it has no rows left', async () => {
    storedDiscounts([discountWith([pct(P1, 10), pct(P2, 20)])])

    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: true })

    expect(functionConfigSent().parsed).toEqual({ items: [pct(P2, 20)] })
    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([pct(P2, 20)])
    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }])
    expect(metafieldSync.syncTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('re-syncs instead of clearing when the product still has other variant rows', async () => {
    storedDiscounts([discountWith([pct(P1, 10, V10), pct(P1, 20, V11)])])

    await removeTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10 })

    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([pct(P1, 20, V11)])
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.anything(), 'Europe/London', [P1])
    expect(metafieldSync.clearTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('removing a row that is already gone is a harmless no-op', async () => {
    storedDiscounts([discountWith([pct(P2, 20)])])
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: true })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('can remove the last row, leaving a valid discount that applies to nothing', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: true })
    expect(functionConfigSent().parsed).toEqual({ items: [] })
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppUpdate: { userErrors: [{ field: ['x'], message: 'Nope' }] } })
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: false, error: 'Nope' })
    expect(saveSpy).not.toHaveBeenCalled()
  })
})

describe('deleteTimeDiscount', () => {
  it('deletes the Shopify record first, then the app entry, clears every product\'s metafield, and returns to the list', async () => {
    storedDiscounts([discountWith([pct(P1, 10), pct(P2, 20)]), discountWith([], { discountId: 'time_disc_2' })])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [] } })

    await deleteTimeDiscount('time_disc_1')

    expect(shopifyQuerySpy).toHaveBeenCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/1' })
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ discountId: 'time_disc_2' })] })
    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([pct(P1, 10), pct(P2, 20)])
    expect(redirectSpy).toHaveBeenCalledWith('/')
  })

  it('keeps the app entry when Shopify refuses the delete, so the merchant can retry', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Locked' }] } })
    await expect(deleteTimeDiscount('time_disc_1')).rejects.toThrow('Locked')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('treats a Shopify record that is already gone as deleted', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Discount not found' }] } })
    await expect(deleteTimeDiscount('time_disc_1')).resolves.toBeUndefined()
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
  })
})
```

Tests for the autosave queue, the editor and the new-discount form:

`tests/timeDiscounts/components/useSaveQueue.test.ts` (new file):

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useSaveQueue', () => {
  it('starts the next save only after the previous one has finished', async () => {
    const { result } = renderHook(() => useSaveQueue())
    const first = deferred<string>()
    const events: string[] = []

    const a = result.current(() => { events.push('start a'); return first.promise })
    const b = result.current(async () => { events.push('start b'); return 'b' })

    await Promise.resolve()
    expect(events).toEqual(['start a'])

    first.resolve('a')
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(events).toEqual(['start a', 'start b'])
  })

  it('runs saves in the order they were requested', async () => {
    const { result } = renderHook(() => useSaveQueue())
    const order: number[] = []
    await Promise.all([1, 2, 3].map((n) => result.current(async () => { order.push(n) })))
    expect(order).toEqual([1, 2, 3])
  })

  it('does not let a failed save block the ones behind it, and still reports the failure to its caller', async () => {
    const { result } = renderHook(() => useSaveQueue())
    const failing = result.current(async () => { throw new Error('boom') })
    const next = result.current(async () => 'ok')

    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('ok')
  })
})
```
`tests/timeDiscounts/components/TimeDiscountEditor.test.tsx` (new file):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import TimeDiscountEditor, { SCHEDULE_SAVE_DELAY_MS } from '@/timeDiscounts/components/TimeDiscountEditor'
import { SavedToastProvider } from '@/components/SavedToast'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import * as actions from '@/timeDiscounts/actions'

vi.mock('@/timeDiscounts/actions', () => ({
  saveTimeDiscountTitle: vi.fn(),
  saveTimeDiscountSchedule: vi.fn(),
  saveTimeDiscountItem: vi.fn(),
  removeTimeDiscountItem: vi.fn(),
}))

// The search box has its own tests; here it is a button that picks a fixed product.
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect, existingKeys }: { onSelect: (item: object) => void; existingKeys: string[] }) => (
    <div data-testid="picker" data-existing={existingKeys.join(',')}>
      <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/3', title: 'New Bed', price: 30 })}>stub-add</button>
    </div>
  ),
}))

const BASE = 'https://shop.myshopify.com/admin/products/'
const rows: DisplayRow[] = [
  { productId: 'gid://shopify/Product/1', title: 'Scruffs Boucle Cat Bed', adminUrl: `${BASE}1`, regularPrice: 49.99, pricingMode: 'fixed', amount: 22 },
  { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Roll Up Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 22, pricingMode: 'percent', amount: 20 },
]

const ok = { ok: true as const }
const mocked = vi.mocked(actions)

function setup(props: Partial<React.ComponentProps<typeof TimeDiscountEditor>> = {}) {
  const deleteAction = vi.fn().mockResolvedValue(undefined)
  render(
    <SavedToastProvider>
      <TimeDiscountEditor
        discountId="time_disc_1" shopTimezone="Europe/London" adminProductBaseUrl={BASE}
        initialTitle="Summer Sale" initialStartsAt="2026-07-01T12:00" initialEndsAt="2026-07-02T12:00"
        initialRows={rows} deleteAction={deleteAction}
        {...props}
      />
    </SavedToastProvider>,
  )
  return { deleteAction }
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocked.saveTimeDiscountTitle.mockResolvedValue(ok)
  mocked.saveTimeDiscountSchedule.mockResolvedValue(ok)
  mocked.saveTimeDiscountItem.mockResolvedValue(ok)
  mocked.removeTimeDiscountItem.mockResolvedValue(ok)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const userNow = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('TimeDiscountEditor — layout', () => {
  it('shows title, schedule, then the products table, then Delete', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
    expect(screen.getByLabelText(/Starts/)).toHaveValue('2026-07-01T12:00')
    expect(screen.getByLabelText(/Ends/)).toHaveValue('2026-07-02T12:00')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Product', 'Discount type', 'Discounted price', 'Regular price', 'Edit', 'Delete'])
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toHaveAttribute('href', `${BASE}1`)
    expect(within(rowOf('Scruffs Boucle Cat Bed')).getByText('£22.00')).toBeInTheDocument()
    expect(within(rowOf('Roll Up Bed – Grey')).getByText('£17.60')).toBeInTheDocument()
    const order = ['Title', 'Schedule', 'Products'].map((name) => screen.getByText(name, { selector: 'label, h2' }))
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('has no page-wide Save button', () => {
    setup()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })

  it('invites you to add a product when there are no rows', () => {
    setup({ initialRows: [] })
    expect(screen.getByText('No products yet — add one below.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('tells the picker which rows already exist, so they are not offered again', () => {
    setup()
    expect(screen.getByTestId('picker').dataset.existing).toBe('gid://shopify/Product/1|,gid://shopify/Product/2|gid://shopify/ProductVariant/20')
  })
})

describe('TimeDiscountEditor — title', () => {
  it('saves when the field loses focus, then shows the Saved pill', async () => {
    const user = userNow()
    setup()
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), '  Winter Sale ')
    await user.tab()

    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledWith('time_disc_1', 'Winter Sale')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Winter Sale')
  })

  it('does not save an unchanged title', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByLabelText('Title'))
    await user.tab()
    expect(mocked.saveTimeDiscountTitle).not.toHaveBeenCalled()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('does not save an empty title and says one is required', async () => {
    const user = userNow()
    setup()
    await user.clear(screen.getByLabelText('Title'))
    await user.tab()
    expect(mocked.saveTimeDiscountTitle).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A title is required')
  })

  it('shows a server error inline and no Saved pill', async () => {
    const user = userNow()
    mocked.saveTimeDiscountTitle.mockResolvedValue({ ok: false, error: 'Shopify said no' })
    setup()
    await user.type(screen.getByLabelText('Title'), '!')
    await user.tab()
    expect(await screen.findByText('Shopify said no')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — schedule', () => {
  async function changeEnd(user: ReturnType<typeof userNow>, value: string) {
    const input = screen.getByLabelText(/Ends/)
    await user.clear(input)
    await user.type(input, value)
  }

  it('saves once after the dates settle, then shows the Saved pill', async () => {
    const user = userNow()
    setup()
    await changeEnd(user, '2026-07-03T12:00')
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })

    expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledTimes(1)
    expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledWith('time_disc_1', '2026-07-01T12:00', '2026-07-03T12:00')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('does not save an end that is not after the start, and says so', async () => {
    const user = userNow()
    setup()
    await changeEnd(user, '2026-06-30T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS * 2) })
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.')
  })

  it('does not save when the dates are unchanged', async () => {
    setup()
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS * 2) })
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()
  })

  it('shows a server error inline', async () => {
    const user = userNow()
    mocked.saveTimeDiscountSchedule.mockResolvedValue({ ok: false, error: 'Could not update' })
    setup()
    await changeEnd(user, '2026-07-03T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })
    expect(await screen.findByText('Could not update')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — editing a row', () => {
  it('turns the row into an inline form, saves the new rule, and shows the Saved pill', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '50')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', {
      productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'percent', amount: 50,
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const row = rowOf('Roll Up Bed – Grey')
    expect(within(row).getByText('50% off')).toBeInTheDocument()
    expect(within(row).getByText('£11.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('keeps the form open and shows the reason inline when the server refuses the save', async () => {
    const user = userNow()
    mocked.saveTimeDiscountItem.mockResolvedValue({ ok: false, error: 'This discount has too many products/variants' })
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('This discount has too many products/variants')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('cancel restores the saved rule without calling the server', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '99')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled()
    expect(within(rowOf('Roll Up Bed – Grey')).getByText('20% off')).toBeInTheDocument()
  })

  it('edits one row at a time', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.click(screen.getByRole('button', { name: 'Edit Scruffs Boucle Cat Bed' }))
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    expect(screen.getByLabelText('Fixed price for Scruffs Boucle Cat Bed')).toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — adding a row', () => {
  it('appends the product already in edit mode with an empty amount, and saves it from its own Save button', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))

    const row = rowOf('New Bed')
    expect(within(row).getByLabelText(/Percent off for New Bed/)).toHaveValue(null)
    expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled() // never saved until Save is pressed
    expect(screen.getByRole('link', { name: 'New Bed' })).toHaveAttribute('href', `${BASE}3`)

    await user.type(within(row).getByLabelText(/Percent off for New Bed/), '10')
    await user.click(within(row).getByRole('button', { name: 'Save' }))

    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', { productId: 'gid://shopify/Product/3', variantId: undefined, pricingMode: 'percent', amount: 10 })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(within(rowOf('New Bed')).getByText('£27.00')).toBeInTheDocument()
  })

  it('removes an added row again if it is cancelled before saving', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))
    await user.click(within(rowOf('New Bed')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('link', { name: 'New Bed' })).not.toBeInTheDocument()
    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled()
  })

  it('keeps an added row with its error when the server refuses it', async () => {
    const user = userNow()
    mocked.saveTimeDiscountItem.mockResolvedValue({ ok: false, error: 'This product already belongs to another discount' })
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))
    await user.type(within(rowOf('New Bed')).getByLabelText(/Percent off for New Bed/), '10')
    await user.click(within(rowOf('New Bed')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This product already belongs to another discount')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New Bed' })).toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — deleting', () => {
  it('asks for confirmation, and does nothing when declined', async () => {
    const user = userNow()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Scruffs Boucle Cat Bed' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Scruffs Boucle Cat Bed from this discount?')
    expect(mocked.removeTimeDiscountItem).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toBeInTheDocument()
  })

  it('removes the row, tells the server, and shows the Saved pill when confirmed', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Roll Up Bed – Grey' }))
    expect(mocked.removeTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Roll Up Bed – Grey' })).not.toBeInTheDocument()
  })

  it('keeps the row and shows the reason when the server refuses', async () => {
    const user = userNow()
    mocked.removeTimeDiscountItem.mockResolvedValue({ ok: false, error: 'Shopify said no' })
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Scruffs Boucle Cat Bed' }))
    expect(await screen.findByText('Shopify said no')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toBeInTheDocument()
  })

  it('deleting the whole discount asks for confirmation first', async () => {
    const user = userNow()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { deleteAction } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith('Delete this discount entirely? This cannot be undone.')
    expect(deleteAction).not.toHaveBeenCalled()
  })

  it('deletes the whole discount once confirmed', async () => {
    const user = userNow()
    const { deleteAction } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteAction).toHaveBeenCalledTimes(1)
  })
})

describe('TimeDiscountEditor — saving one request at a time', () => {
  it('does not start a row save until the title save has finished', async () => {
    const user = userNow()
    let finishTitle!: (value: { ok: true }) => void
    mocked.saveTimeDiscountTitle.mockReturnValue(new Promise((resolve) => { finishTitle = resolve }))
    setup()

    await user.type(screen.getByLabelText('Title'), '!')
    await user.tab() // title save starts and stays in flight
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledTimes(1)
    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled()

    await act(async () => { finishTitle({ ok: true }) })
    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledTimes(1)
  })
})
```
`tests/timeDiscounts/components/NewTimeDiscountForm.test.tsx` (new file):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'

afterEach(cleanup)

describe('NewTimeDiscountForm', () => {
  it('asks only for a title and a schedule — no products, collections or prices', () => {
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText(/Starts/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Ends/)).toBeInTheDocument()
    expect(screen.queryByText(/Collections/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()
    expect(screen.getByText(/add products on the next screen/)).toBeInTheDocument()
  })

  it('disables Create until there is a title and a valid schedule', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    const create = screen.getByRole('button', { name: 'Create discount' })
    expect(create).toBeDisabled()

    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    expect(create).toBeDisabled()

    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(create).toBeEnabled()
  })

  it('stays disabled and says why when the end is not after the start', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-02T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-01T12:00')

    expect(screen.getByText('End must be after start.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()
  })

  it('stays disabled for a blank title', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    await user.type(screen.getByLabelText('Title'), '   ')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()
  })
})
```

Delete the tests of the removed components and library:

```bash
git rm tests/timeDiscounts/components/TimeProductPicker.test.tsx tests/timeDiscounts/components/TimeCollectionPicker.test.tsx tests/lib/collections.test.ts
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/timeDiscounts tests/lib/discount-availability.test.ts`
Expected: FAIL — `normalizeTimeDiscount`, `saveTimeDiscountItem`, `TimeDiscountEditor`, `useSaveQueue` and `productAdminUrl` do not exist, and fixtures that use `items` do not type-check against the old `TimeDiscount`.

- [ ] **Step 3: Switch the stored model**

`src/timeDiscounts/config.ts` — apply this change:

```diff
diff --git a/src/timeDiscounts/config.ts b/src/timeDiscounts/config.ts
index c6b3c44..13c6055 100644
--- a/src/timeDiscounts/config.ts
+++ b/src/timeDiscounts/config.ts
@@ -1,9 +1,9 @@
 import { shopifyQuery } from '@/lib/shopify-client'
 import { zonedTimeToUtc } from '@/lib/shop'
 
+/** A product/variant as stored by discounts saved before per-row pricing. Only read when normalizing them. */
 export interface DiscountMember {
   productId: string
-  /** Omitted for a whole-product member (single-variant products, or Collections-mode resolution — see spec §3, §5). */
   variantId?: string
 }
 
@@ -17,34 +17,64 @@ export interface TimeDiscountItem {
   amount: number
 }
 
-export type TimeDiscountSelection =
-  | { mode: 'products'; members: DiscountMember[] }
-  | { mode: 'collections'; collectionIds: string[] }
-
 export interface TimeDiscount {
   discountId: string
-  /** GID of the real Shopify DiscountAutomaticApp record this discount owns — see spec §5. Shopify's own native startsAt/endsAt on that record govern activation; this app has no local status field. */
+  /** GID of the real Shopify DiscountAutomaticApp record this discount owns. Shopify's own native startsAt/endsAt on that record govern activation; this app has no local status field. */
+  shopifyDiscountId: string
+  /** Legacy internal label — kept equal to `title` on every title save and never shown. */
+  name: string
+  /** Shown to customers in the countdown widget and used as the admin label. */
+  title: string
+  /** Naive (no offset) ISO datetime; entered/displayed in shop timezone by the admin UI. Converted to UTC only at the Admin API boundary, when writing this discount's native startsAt/endsAt. */
+  startsAt: string
+  endsAt: string
+  /** The rows: each product/variant with its own price rule. */
+  items: TimeDiscountItem[]
+}
+
+/**
+ * What may be on disk: a discount saved before per-row pricing has one shared
+ * `pricingMode`/`amount` plus `resolvedMembers` (and a `selection`, ignored)
+ * instead of `items`.
+ */
+export interface StoredTimeDiscount {
+  discountId: string
   shopifyDiscountId: string
-  /** Internal admin-facing label. */
   name: string
-  /** Customer-facing copy shown in the countdown widget. */
   title: string
-  pricingMode: 'percent' | 'fixed'
-  /** Single flat value — percent-off, or the fixed price. No tiers (see spec §2). */
-  amount: number
-  /** Naive (no offset) ISO datetime; entered/displayed in shop timezone by the admin UI. Converted to UTC only at the Admin API boundary, when writing this discount's native startsAt/endsAt (see spec §5). */
   startsAt: string
   endsAt: string
-  /** Admin source of truth: how the merchant chose members — shown/edited on the discount page. */
-  selection: TimeDiscountSelection
-  /** Function-facing snapshot, recomputed at save time from `selection` (see spec §3, §5). The Function only ever reads this. */
-  resolvedMembers: DiscountMember[]
-  /**
-   * Per-row pricing. Not stored yet — a discount saved before per-row pricing
-   * has none, and its resolvedMembers all share the discount's one
-   * pricingMode/amount. Always read it through getDiscountItems().
-   */
   items?: TimeDiscountItem[]
+  pricingMode?: 'percent' | 'fixed'
+  amount?: number
+  resolvedMembers?: DiscountMember[]
+}
+
+/**
+ * Converts a stored discount to the current shape, in memory only (nothing is
+ * rewritten until the discount is next saved): an older discount becomes one
+ * row per product/variant it covered, each carrying its one shared rule. A
+ * collection discount needs no lookup — resolvedMembers already is the
+ * snapshot of the products it covered.
+ */
+export function normalizeTimeDiscount(stored: StoredTimeDiscount): TimeDiscount {
+  const items: TimeDiscountItem[] =
+    stored.items ??
+    (stored.resolvedMembers ?? []).map((member) => ({
+      productId: member.productId,
+      ...(member.variantId ? { variantId: member.variantId } : {}),
+      pricingMode: stored.pricingMode ?? 'percent',
+      amount: stored.amount ?? 0,
+    }))
+  return {
+    discountId: stored.discountId,
+    shopifyDiscountId: stored.shopifyDiscountId,
+    name: stored.name,
+    title: stored.title,
+    startsAt: stored.startsAt,
+    endsAt: stored.endsAt,
+    items,
+  }
 }
 
 export interface TimeDiscountsConfig {
@@ -72,8 +102,8 @@ export async function getTimeDiscountsConfig(): Promise<TimeDiscountsConfig> {
 
   if (!data.shop.metafield) return { discounts: [] }
 
-  const parsed = JSON.parse(data.shop.metafield.value) as Partial<TimeDiscountsConfig>
-  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts : [] }
+  const parsed = JSON.parse(data.shop.metafield.value) as { discounts?: StoredTimeDiscount[] }
+  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts.map(normalizeTimeDiscount) : [] }
 }
 
 export async function saveTimeDiscountsConfig(config: TimeDiscountsConfig): Promise<void> {
@@ -100,25 +130,8 @@ export async function saveTimeDiscountsConfig(config: TimeDiscountsConfig): Prom
 }
 
 /**
- * The discount's price rows: its stored `items`, or — for a discount saved
- * before per-row pricing — one row per resolved member carrying the
- * discount's single shared pricingMode/amount.
- */
-export function getDiscountItems(
-  discount: Pick<TimeDiscount, 'pricingMode' | 'amount' | 'resolvedMembers' | 'items'>,
-): TimeDiscountItem[] {
-  if (discount.items) return discount.items
-  return discount.resolvedMembers.map((member) => ({
-    productId: member.productId,
-    ...(member.variantId ? { variantId: member.variantId } : {}),
-    pricingMode: discount.pricingMode,
-    amount: discount.amount,
-  }))
-}
-
-/**
- * True when (productId, variantId) isn't already a resolvedMembers entry of
- * another time discount. Same matching rule as the existing app's
+ * True when (productId, variantId) isn't already a row of another time
+ * discount. Same matching rule as the existing app's
  * isProductAvailable: a whole-product claim blocks every variant and vice
  * versa. Pass the discount's own id as excludeDiscountId when validating an
  * in-progress edit.
@@ -131,7 +144,7 @@ export function isTimeDiscountMemberAvailable(
 ): boolean {
   return !config.discounts.some((discount) => {
     if (discount.discountId === excludeDiscountId) return false
-    return discount.resolvedMembers.some((member) => {
+    return discount.items.some((member) => {
       if (member.productId !== productId) return false
       if (member.variantId == null || variantId == null) return true
       return member.variantId === variantId
@@ -139,17 +152,6 @@ export function isTimeDiscountMemberAvailable(
   })
 }
 
-/**
- * True when every price in the list is equal, within floating-point
- * rounding. Deliberately redefined here rather than imported from
- * @/lib/config — see this plan's Global Constraints for why.
- */
-export function pricesUniform(prices: number[]): boolean {
-  if (prices.length <= 1) return true
-  const [first, ...rest] = prices
-  return rest.every((p) => Math.abs(p - first) <= 0.001)
-}
-
 /**
  * A fixed price at or above the products' regular price discounts nothing
  * (checkout clamps it), so it is almost certainly a typo — returns the
```

- [ ] **Step 4: Update the storefront sync, helpers and picker actions**

`src/timeDiscounts/metafieldSync.ts` — apply this change:

```diff
diff --git a/src/timeDiscounts/metafieldSync.ts b/src/timeDiscounts/metafieldSync.ts
index ebf11c7..deeb331 100644
--- a/src/timeDiscounts/metafieldSync.ts
+++ b/src/timeDiscounts/metafieldSync.ts
@@ -1,6 +1,6 @@
 import { shopifyQuery } from '@/lib/shopify-client'
 import { zonedTimeToUtc } from '@/lib/shop'
-import { getDiscountItems, type TimeDiscount } from '@/timeDiscounts/config'
+import type { TimeDiscount } from '@/timeDiscounts/config'
 
 const NAMESPACE = 'sparkly_product_discounts'
 
@@ -24,6 +24,8 @@ interface TimeDiscountMetafieldValue {
 /**
  * Writes the `time_based_discount` metafield to every unique product in the
  * discount's rows — the storefront scripts read this, keyed per product.
+ * `onlyProductIds` limits the writes to those products (a single-row change
+ * need not rewrite every product).
  *
  * The metafield carries each row's rule (pricingMode, amount, variant), not a
  * computed price: the scripts derive the displayed price from the live variant
@@ -38,12 +40,13 @@ interface TimeDiscountMetafieldValue {
  * instant here (the same conversion used at the Shopify Admin API boundary)
  * makes `new Date(...)` parse correctly in any browser, in any timezone.
  */
-export async function syncTimeDiscountMetafields(discount: TimeDiscount, timeZone: string): Promise<void> {
+export async function syncTimeDiscountMetafields(discount: TimeDiscount, timeZone: string, onlyProductIds?: string[]): Promise<void> {
   const startsAt = zonedTimeToUtc(discount.startsAt, timeZone)
   const endsAt = zonedTimeToUtc(discount.endsAt, timeZone)
 
   const itemsByProduct = new Map<string, TimeDiscountMetafieldItem[]>()
-  for (const item of getDiscountItems(discount)) {
+  for (const item of discount.items) {
+    if (onlyProductIds && !onlyProductIds.includes(item.productId)) continue
     const row: TimeDiscountMetafieldItem = { variantId: item.variantId ?? null, pricingMode: item.pricingMode, amount: item.amount }
     itemsByProduct.set(item.productId, [...(itemsByProduct.get(item.productId) ?? []), row])
   }
```
`src/timeDiscounts/items.ts` — apply this change:

```diff
diff --git a/src/timeDiscounts/items.ts b/src/timeDiscounts/items.ts
index 933b19d..a935354 100644
--- a/src/timeDiscounts/items.ts
+++ b/src/timeDiscounts/items.ts
@@ -16,6 +16,11 @@ export function itemKey(item: Key): string {
   return `${item.productId}|${item.variantId ?? ''}`
 }
 
+/** Link to a product's Shopify admin page; `baseUrl` ends with `/admin/products/`. */
+export function productAdminUrl(baseUrl: string, productId: string): string {
+  return `${baseUrl}${productId.split('/').pop()}`
+}
+
 /**
  * What a customer pays for one unit, in major currency units, rounded to
  * pence. A fixed price at or above the regular price discounts nothing (the
```
`src/timeDiscounts/pickerActions.ts` — apply this change:

```diff
diff --git a/src/timeDiscounts/pickerActions.ts b/src/timeDiscounts/pickerActions.ts
index 3bfabb0..a50c70c 100644
--- a/src/timeDiscounts/pickerActions.ts
+++ b/src/timeDiscounts/pickerActions.ts
@@ -1,7 +1,6 @@
 'use server'
 
 import { searchProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
-import { searchCollections, type CollectionSearchResult } from '@/lib/collections'
 import { isAvailableEverywhere, fetchAvailabilityConfigs } from '@/lib/discount-availability'
 
 /**
@@ -60,13 +59,3 @@ export async function validateTimeDiscountMemberAction(
   }
   return { ok: true }
 }
-
-/** Backs the Collections-mode picker's search box. */
-export async function searchTimeDiscountCollectionsAction(query: string): Promise<CollectionSearchResult[]> {
-  try {
-    return await searchCollections(query)
-  } catch (err) {
-    console.error('[searchTimeDiscountCollectionsAction] search failed:', err)
-    return []
-  }
-}
```
`src/timeDiscounts/components/ItemRow.tsx` — apply this change:

```diff
diff --git a/src/timeDiscounts/components/ItemRow.tsx b/src/timeDiscounts/components/ItemRow.tsx
index 8831c73..78a1b02 100644
--- a/src/timeDiscounts/components/ItemRow.tsx
+++ b/src/timeDiscounts/components/ItemRow.tsx
@@ -74,10 +74,10 @@ export default function ItemRow({
         <tr className="border-b border-line align-middle">
           <td className="py-3 pr-3"><ProductLink row={row} /></td>
           <td className="py-3 pr-3 text-sm">{row.pricingMode === 'fixed' ? 'Fixed price' : `${row.amount}% off`}</td>
-          <td className="py-3 pr-3 text-sm font-medium">
+          <td className="py-3 pr-3 text-sm font-medium whitespace-nowrap">
             {row.regularPrice == null ? '—' : money(discountedPrice(row, row.regularPrice))}
           </td>
-          <td className="py-3 pr-3 text-sm text-muted">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
+          <td className="py-3 pr-3 text-sm text-muted whitespace-nowrap">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
           <td className="py-3 text-right">
             <button type="button" onClick={onEdit} disabled={busy} aria-label={`Edit ${row.title}`} className={iconButton}><PencilIcon /></button>
           </td>
@@ -140,7 +140,7 @@ function EditCells({
         </div>
         {amountText.trim() !== '' && message && <p role="alert" className="mt-1 text-xs text-danger">{message}</p>}
       </td>
-      <td className="py-3 pr-3 text-sm text-muted">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
+      <td className="py-3 pr-3 text-sm text-muted whitespace-nowrap">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
       <td colSpan={2} className="py-3 text-right whitespace-nowrap">
         <button
           type="button" disabled={!valid || busy} onClick={() => onSave(rule)}
```

- [ ] **Step 5: Rewrite the server actions**

Replace the whole of `src/timeDiscounts/actions.ts` with:

```ts
'use server'

import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig,
  type TimeDiscount, type TimeDiscountItem, type TimeDiscountsConfig,
} from '@/timeDiscounts/config'
import { isAvailableEverywhere, fetchAvailabilityConfigs } from '@/lib/discount-availability'
import { getMemberInfo } from '@/lib/products'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { shopifyQuery } from '@/lib/shopify-client'
import { redirectWithToken } from '@/lib/auth-redirect'
import { itemKey, validateRule, validateItemsStructure, assertItemsFitFunctionConfig } from '@/timeDiscounts/items'

const METAFIELD_NAMESPACE = 'sparkly_time_discounts'
/** Must match the `handle` in extensions/time-based-discount/shopify.extension.toml. */
const FUNCTION_HANDLE = 'time-based-discount'

/** What the autosaving page shows: success, or the reason to display inline. */
export type SaveResult = { ok: true } | { ok: false; error: string }

export type SaveItemInput = {
  productId: string
  variantId?: string
  pricingMode: 'percent' | 'fixed'
  amount: number
}

type ProductKey = { productId: string; variantId?: string }

interface FunctionConfigMetafield {
  namespace: string
  key: string
  type: string
  value: string
}

/** The Function's own per-discount config, written atomically as part of the DiscountAutomaticAppInput on create/update. */
function buildFunctionConfigMetafield(items: TimeDiscountItem[]): FunctionConfigMetafield {
  assertItemsFitFunctionConfig(items)
  return { namespace: METAFIELD_NAMESPACE, key: 'function_config', type: 'json', value: JSON.stringify({ items }) }
}

async function createShopifyDiscountRecord(input: {
  title: string
  startsAtUtc: string
  endsAtUtc: string
  items: TimeDiscountItem[]
}): Promise<string> {
  const data = await shopifyQuery<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation createTimeDiscountRecord($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      automaticAppDiscount: {
        title: input.title,
        functionHandle: FUNCTION_HANDLE,
        discountClasses: ['PRODUCT'],
        startsAt: input.startsAtUtc,
        endsAt: input.endsAtUtc,
        metafields: [buildFunctionConfigMetafield(input.items)],
      },
    },
  )

  if (data.discountAutomaticAppCreate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppCreate.userErrors.map((e) => e.message).join('; '))
  }
  if (!data.discountAutomaticAppCreate.automaticAppDiscount) {
    throw new Error('Shopify did not return the created discount')
  }
  return data.discountAutomaticAppCreate.automaticAppDiscount.discountId
}

interface ShopifyDiscountRecordUpdate {
  title?: string
  startsAtUtc?: string
  endsAtUtc?: string
  items?: TimeDiscountItem[]
}

/** Partial update — only the fields present in `update` are sent, matching Shopify's own documented partial-update behavior for this mutation. */
async function updateShopifyDiscountRecord(shopifyDiscountId: string, update: ShopifyDiscountRecordUpdate): Promise<void> {
  const automaticAppDiscount: Record<string, unknown> = {}
  if (update.title !== undefined) automaticAppDiscount.title = update.title
  if (update.startsAtUtc !== undefined) automaticAppDiscount.startsAt = update.startsAtUtc
  if (update.endsAtUtc !== undefined) automaticAppDiscount.endsAt = update.endsAtUtc
  if (update.items !== undefined) automaticAppDiscount.metafields = [buildFunctionConfigMetafield(update.items)]

  const data = await shopifyQuery<{
    discountAutomaticAppUpdate: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation updateTimeDiscountRecord($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId, automaticAppDiscount },
  )

  if (data.discountAutomaticAppUpdate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppUpdate.userErrors.map((e) => e.message).join('; '))
  }
}

/**
 * Uses the generic discountAutomaticDelete mutation — there is no
 * discount-type-specific delete mutation. A "not found"/"does not
 * exist"-shaped userError is treated as a successful no-op rather than an
 * error: it means Shopify's side of a previous delete already succeeded
 * (e.g. this delete is a retry after saveTimeDiscountsConfig failed on a
 * prior attempt), so retrying must not get permanently stuck.
 */
async function deleteShopifyDiscountRecord(shopifyDiscountId: string): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteTimeDiscountRecord($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId },
  )

  const realErrors = data.discountAutomaticDelete.userErrors.filter(
    (e) => !/not found|does not exist/i.test(e.message),
  )
  if (realErrors.length > 0) {
    throw new Error(realErrors.map((e) => e.message).join('; '))
  }
}

function parseSchedule(startsAtRaw: string, endsAtRaw: string): { startsAt: string; endsAt: string } {
  const startsAt = startsAtRaw.trim()
  const endsAt = endsAtRaw.trim()
  if (!startsAt || !endsAt) throw new Error('Start and end date/time are required')
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('End must be after start')
  return { startsAt, endsAt }
}

function findDiscountOrThrow(config: TimeDiscountsConfig, discountId: string): TimeDiscount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Time discount ${discountId} not found`)
  return discount
}

/** Runs a save and turns a thrown error into the result the page shows inline. */
async function guarded(save: () => Promise<void>): Promise<SaveResult> {
  try {
    await save()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong — please try again' }
  }
}

/** The storefront sync runs after the discount is already saved and live, so a failure is logged, not surfaced as a failed save. */
async function syncBestEffort(label: string, discount: TimeDiscount, timezone: string, onlyProductIds?: string[]): Promise<void> {
  try {
    await syncTimeDiscountMetafields(discount, timezone, onlyProductIds)
  } catch (err) {
    console.error(`[${label}] storefront metafield sync failed (discount is saved and live; the storefront may be stale for some products):`, err)
  }
}

async function regularPriceOf(key: ProductKey): Promise<number> {
  const [info] = await getMemberInfo([key])
  if (!info) throw new Error('This product could not be found in Shopify')
  return info.price
}

async function assertAvailable(key: ProductKey, discountId: string): Promise<void> {
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()
  if (!isAvailableEverywhere(productConfig, timeConfig, key.productId, key.variantId, discountId)) {
    throw new Error(`This ${key.variantId ? 'variant' : 'product'} already belongs to another discount`)
  }
}

export async function createTimeDiscount(formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const { startsAt, endsAt } = parseSchedule(String(formData.get('startsAt') ?? ''), String(formData.get('endsAt') ?? ''))

  const timezone = await getShopTimezone()
  const shopifyDiscountId = await createShopifyDiscountRecord({
    title,
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    items: [],
  })

  const discountId = `time_disc_${crypto.randomUUID()}`
  const newDiscount: TimeDiscount = { discountId, shopifyDiscountId, name: title, title, startsAt, endsAt, items: [] }

  try {
    const config = await getTimeDiscountsConfig()
    await saveTimeDiscountsConfig({ discounts: [...config.discounts, newDiscount] })
  } catch (err) {
    // The Shopify discount record already exists and is live at checkout —
    // if we can't save it into this app's own config, it becomes an
    // orphan the merchant has no way to find or manage through this admin.
    // Best-effort compensating delete so a failed create doesn't silently
    // leave a live, invisible discount running.
    try {
      await deleteShopifyDiscountRecord(shopifyDiscountId)
    } catch (cleanupErr) {
      console.error(
        `[createTimeDiscount] FAILED TO ROLL BACK an orphaned Shopify discount record (id: ${shopifyDiscountId}) after the local config save failed — this discount is live at checkout but invisible in this app; delete it manually via Shopify Admin → Discounts.`,
        cleanupErr,
      )
      throw new Error(
        `Failed to save the discount, and automatic cleanup also failed. A live Shopify discount (id: ${shopifyDiscountId}) may still exist — please check Shopify Admin → Discounts and delete it manually if present.`,
      )
    }
    throw err
  }

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function saveTimeDiscountTitle(discountId: string, rawTitle: string): Promise<SaveResult> {
  return guarded(async () => {
    const title = rawTitle.trim()
    if (!title) throw new Error('A title is required')

    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)
    const timezone = await getShopTimezone()

    // Shopify's own record is updated FIRST — if it fails, the local config
    // is never saved, so the two never disagree.
    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { title })

    discount.title = title
    discount.name = title
    await saveTimeDiscountsConfig(config)
    await syncBestEffort('saveTimeDiscountTitle', discount, timezone)
  })
}

export async function saveTimeDiscountSchedule(discountId: string, startsAtRaw: string, endsAtRaw: string): Promise<SaveResult> {
  return guarded(async () => {
    const { startsAt, endsAt } = parseSchedule(startsAtRaw, endsAtRaw)

    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)
    const timezone = await getShopTimezone()

    await updateShopifyDiscountRecord(discount.shopifyDiscountId, {
      startsAtUtc: zonedTimeToUtc(startsAt, timezone),
      endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    })

    discount.startsAt = startsAt
    discount.endsAt = endsAt
    await saveTimeDiscountsConfig(config)
    await syncBestEffort('saveTimeDiscountSchedule', discount, timezone)
  })
}

/** Adds a row or replaces the rule of an existing one (same product/variant). */
export async function saveTimeDiscountItem(discountId: string, input: SaveItemInput): Promise<SaveResult> {
  return guarded(async () => {
    const pricingMode = input.pricingMode === 'fixed' ? 'fixed' : 'percent'
    const amount = Math.round(Number(input.amount) * 100) / 100
    const key: ProductKey = { productId: input.productId, ...(input.variantId ? { variantId: input.variantId } : {}) }

    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)

    const regularPrice = pricingMode === 'fixed' ? await regularPriceOf(key) : null
    const ruleError = validateRule({ pricingMode, amount }, regularPrice)
    if (ruleError) throw new Error(ruleError)

    const item: TimeDiscountItem = { ...key, pricingMode, amount }
    const exists = discount.items.some((existing) => itemKey(existing) === itemKey(key))
    const nextItems = exists
      ? discount.items.map((existing) => (itemKey(existing) === itemKey(key) ? item : existing))
      : [...discount.items, item]

    const structureError = validateItemsStructure(nextItems)
    if (structureError) throw new Error(structureError)
    if (!exists) await assertAvailable(key, discountId)

    const timezone = await getShopTimezone()
    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { items: nextItems })

    discount.items = nextItems
    await saveTimeDiscountsConfig(config)
    await syncBestEffort('saveTimeDiscountItem', discount, timezone, [key.productId])
  })
}

export async function removeTimeDiscountItem(discountId: string, key: ProductKey): Promise<SaveResult> {
  return guarded(async () => {
    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)

    const nextItems = discount.items.filter((existing) => itemKey(existing) !== itemKey(key))
    if (nextItems.length === discount.items.length) return // already gone — removing twice is a no-op

    const timezone = await getShopTimezone()
    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { items: nextItems })

    discount.items = nextItems
    await saveTimeDiscountsConfig(config)

    try {
      if (nextItems.some((existing) => existing.productId === key.productId)) {
        await syncTimeDiscountMetafields(discount, timezone, [key.productId])
      } else {
        await clearTimeDiscountMetafields([{ productId: key.productId }])
      }
    } catch (err) {
      console.error('[removeTimeDiscountItem] storefront metafield update failed (row is removed and no longer discounted at checkout; the storefront may be stale for this product):', err)
    }
  })
}

export async function deleteTimeDiscount(discountId: string): Promise<void> {
  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  // Shopify's own record is deleted FIRST — if it fails, the app hasn't yet
  // forgotten the discount exists, so the merchant can retry rather than
  // being left with a discount that discounts forever with no way to see
  // or remove it. deleteShopifyDiscountRecord itself treats "already gone"
  // as success, so a retry after a prior partial failure still succeeds.
  await deleteShopifyDiscountRecord(discount.shopifyDiscountId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveTimeDiscountsConfig({ discounts: remaining })

  try {
    await clearTimeDiscountMetafields(discount.items)
  } catch (err) {
    console.error('[deleteTimeDiscount] storefront metafield clear failed (discount is deleted and no longer live; the storefront may be stale for some products until the next successful save):', err)
  }

  await redirectWithToken('/')
}
```

- [ ] **Step 6: Add the save queue and the editor**

`src/timeDiscounts/components/useSaveQueue.ts` (new file):

```ts
import { useCallback, useRef } from 'react'

/**
 * Runs saves one at a time, in the order they were requested. All time-based
 * discounts live in ONE shop metafield and every save rewrites it, so two
 * overlapping saves (a title blur and a row save) could overwrite each
 * other. A failed task never blocks the ones queued behind it.
 */
export function useSaveQueue() {
  const tail = useRef<Promise<unknown>>(Promise.resolve())

  return useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(task, task)
    tail.current = run.catch(() => undefined)
    return run
  }, [])
}
```
`src/timeDiscounts/components/TimeDiscountEditor.tsx` (new file):

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import ConfirmForm from '@/components/ConfirmForm'
import { useSavedToast } from '@/components/SavedToast'
import {
  saveTimeDiscountTitle, saveTimeDiscountSchedule, saveTimeDiscountItem, removeTimeDiscountItem,
} from '@/timeDiscounts/actions'
import { itemKey, productAdminUrl } from '@/timeDiscounts/items'
import AddItemPicker, { type PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import ItemRow, { type DisplayRow } from '@/timeDiscounts/components/ItemRow'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'

/** How long after the last change to either date the schedule is saved. */
export const SCHEDULE_SAVE_DELAY_MS = 600

function without(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record }
  delete next[key]
  return next
}

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/**
 * The discount page: title, schedule and the products table. Every part saves
 * itself (no page-wide Save button) and shows the "Saved" pill on success;
 * failures are shown inline next to the part that failed. Saves are queued so
 * only one request is in flight at a time.
 */
export default function TimeDiscountEditor({
  discountId, shopTimezone, adminProductBaseUrl, initialTitle, initialStartsAt, initialEndsAt, initialRows, deleteAction,
}: {
  discountId: string
  shopTimezone: string
  /** Ends with `/admin/products/` — used to link newly added rows. */
  adminProductBaseUrl: string
  initialTitle: string
  initialStartsAt: string
  initialEndsAt: string
  initialRows: DisplayRow[]
  deleteAction: () => Promise<void>
}) {
  const { showSaved } = useSavedToast()
  const enqueue = useSaveQueue()

  const [title, setTitle] = useState(initialTitle)
  const [titleError, setTitleError] = useState<string | null>(null)
  const savedTitle = useRef(initialTitle)

  const [startsAt, setStartsAt] = useState(initialStartsAt)
  const [endsAt, setEndsAt] = useState(initialEndsAt)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const savedSchedule = useRef({ startsAt: initialStartsAt, endsAt: initialEndsAt })
  const scheduleInvalid = startsAt !== '' && endsAt !== '' && endsAt <= startsAt ? 'End must be after start.' : null

  const [rows, setRows] = useState<DisplayRow[]>(initialRows)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  function saveTitle() {
    const next = title.trim()
    if (!next) {
      setTitleError('A title is required')
      return
    }
    if (next === savedTitle.current) return
    setTitleError(null)
    enqueue(() => saveTimeDiscountTitle(discountId, next)).then((result) => {
      if (result.ok) {
        savedTitle.current = next
        setTitle(next)
        showSaved()
      } else {
        setTitleError(result.error)
      }
    })
  }

  // The schedule saves itself once both dates are valid and have settled.
  useEffect(() => {
    if (!startsAt || !endsAt || endsAt <= startsAt) return
    if (startsAt === savedSchedule.current.startsAt && endsAt === savedSchedule.current.endsAt) return

    const timer = setTimeout(() => {
      enqueue(() => saveTimeDiscountSchedule(discountId, startsAt, endsAt)).then((result) => {
        if (result.ok) {
          savedSchedule.current = { startsAt, endsAt }
          setScheduleError(null)
          showSaved()
        } else {
          setScheduleError(result.error)
        }
      })
    }, SCHEDULE_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [startsAt, endsAt, discountId, enqueue, showSaved])

  function withoutUnsavedRows(list: DisplayRow[], keep?: string) {
    return list.filter((row) => !row.isNew || itemKey(row) === keep)
  }

  function startEdit(row: DisplayRow) {
    setRows((current) => withoutUnsavedRows(current, itemKey(row)))
    setEditingKey(itemKey(row))
  }

  function cancelEdit(row: DisplayRow) {
    setRows((current) => withoutUnsavedRows(current))
    setRowErrors((errors) => without(errors, itemKey(row)))
    setEditingKey(null)
  }

  function saveRow(row: DisplayRow, rule: { pricingMode: 'percent' | 'fixed'; amount: number }) {
    const key = itemKey(row)
    setBusyKey(key)
    setRowErrors((errors) => without(errors, key))
    enqueue(() => saveTimeDiscountItem(discountId, { productId: row.productId, variantId: row.variantId, ...rule })).then((result) => {
      setBusyKey(null)
      if (result.ok) {
        setRows((current) => current.map((r) => (itemKey(r) === key ? { ...r, ...rule, isNew: false } : r)))
        setEditingKey(null)
        showSaved()
      } else {
        setRowErrors((errors) => ({ ...errors, [key]: result.error }))
      }
    })
  }

  function deleteRow(row: DisplayRow) {
    if (!window.confirm(`Remove ${row.title} from this discount?`)) return
    if (row.isNew) {
      cancelEdit(row)
      return
    }
    const key = itemKey(row)
    setBusyKey(key)
    setRowErrors((errors) => without(errors, key))
    enqueue(() => removeTimeDiscountItem(discountId, { productId: row.productId, variantId: row.variantId })).then((result) => {
      setBusyKey(null)
      if (result.ok) {
        setRows((current) => current.filter((r) => itemKey(r) !== key))
        showSaved()
      } else {
        setRowErrors((errors) => ({ ...errors, [key]: result.error }))
      }
    })
  }

  function addRow(item: PickedItem) {
    const row: DisplayRow = {
      productId: item.productId,
      variantId: item.variantId,
      title: item.title,
      adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
      regularPrice: item.price,
      pricingMode: 'percent',
      amount: 0,
      isNew: true,
    }
    setRows((current) => [...withoutUnsavedRows(current), row])
    setEditingKey(itemKey(row))
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Time-based discount</h1>

      <section className="mb-8">
        <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
        <input
          id="title" type="text" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className={inputClass}
        />
        <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        {titleError && <p role="alert" className="text-xs text-danger mt-1">{titleError}</p>}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {(scheduleInvalid || scheduleError) && <p role="alert" className="text-xs text-danger mt-2">{scheduleInvalid ?? scheduleError}</p>}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Products</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted mb-3">No products yet — add one below.</p>
        ) : (
          <table className="w-full mb-3 text-left">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Product</th>
                <th scope="col" className="py-2 pr-3 font-medium">Discount type</th>
                <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">Discounted price</th>
                <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">Regular price</th>
                <th scope="col" className="py-2"><span className="sr-only">Edit</span></th>
                <th scope="col" className="py-2"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = itemKey(row)
                return (
                  <ItemRow
                    key={key}
                    row={row}
                    editing={editingKey === key}
                    busy={busyKey === key}
                    error={rowErrors[key] ?? null}
                    onEdit={() => startEdit(row)}
                    onCancel={() => cancelEdit(row)}
                    onSave={(rule) => saveRow(row, rule)}
                    onDelete={() => deleteRow(row)}
                  />
                )
              })}
            </tbody>
          </table>
        )}
        <AddItemPicker excludeDiscountId={discountId} existingKeys={rows.map(itemKey)} onSelect={addRow} />
      </section>

      <section className="flex gap-3">
        <ConfirmForm action={deleteAction} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </div>
  )
}
```

- [ ] **Step 7: Rewrite the new-discount form and the pages**

Replace the whole of `src/timeDiscounts/components/NewTimeDiscountForm.tsx` and `src/app/time-discounts/[discountId]/page.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { createTimeDiscount } from '@/timeDiscounts/actions'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/** Title and schedule only — the discount is created empty and opens on its own page, where products are added. */
export default function NewTimeDiscountForm({ shopTimezone }: { shopTimezone: string }) {
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const hasValidSchedule = startsAt !== '' && endsAt !== '' && endsAt > startsAt
  const canSubmit = title.trim() !== '' && hasValidSchedule

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <form action={createTimeDiscount} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
          <input
            id="title" name="title" type="text" required placeholder="e.g. Spring Flash Sale"
            value={title} onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" name="endsAt" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {startsAt !== '' && endsAt !== '' && endsAt <= startsAt && (
          <p className="text-xs text-danger -mt-4">End must be after start.</p>
        )}

        <div>
          <button
            type="submit" disabled={!canSubmit}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Create discount
          </button>
          <p className="text-xs text-muted mt-2">You&apos;ll add products on the next screen.</p>
        </div>
      </form>
    </main>
  )
}
```
```tsx
// src/app/time-discounts/[discountId]/page.tsx
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { deleteTimeDiscount } from '@/timeDiscounts/actions'
import { getShopTimezone } from '@/lib/shop'
import { getMemberInfo } from '@/lib/products'
import { itemKey, productAdminUrl } from '@/timeDiscounts/items'
import TimeDiscountEditor from '@/timeDiscounts/components/TimeDiscountEditor'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import AuthLink from '@/components/AuthLink'

export default async function TimeDiscountPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getTimeDiscountsConfig()
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) notFound()

  const shopTimezone = await getShopTimezone()
  const adminProductBaseUrl = `https://${process.env.SHOPIFY_SHOP}/admin/products/`

  // A product that can no longer be looked up still gets a row, so it can be removed.
  const info = new Map((await getMemberInfo(discount.items)).map((m) => [itemKey(m), m]))
  const rows: DisplayRow[] = discount.items.map((item) => {
    const found = info.get(itemKey(item))
    return {
      productId: item.productId,
      variantId: item.variantId,
      title: found?.title ?? `Product ${item.productId.split('/').pop()}`,
      adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
      regularPrice: found?.price ?? null,
      pricingMode: item.pricingMode,
      amount: item.amount,
    }
  })

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <TimeDiscountEditor
        discountId={discountId}
        shopTimezone={shopTimezone}
        adminProductBaseUrl={adminProductBaseUrl}
        initialTitle={discount.title}
        initialStartsAt={discount.startsAt}
        initialEndsAt={discount.endsAt}
        initialRows={rows}
        deleteAction={deleteTimeDiscount.bind(null, discountId)}
      />
    </main>
  )
}
```

`src/app/time-discounts/new/page.tsx` needs no change (it already renders `NewTimeDiscountForm` with the shop timezone). The discount list:

`src/app/page.tsx` — apply this change:

```diff
diff --git a/src/app/page.tsx b/src/app/page.tsx
index 88bb7cf..e49068e 100644
--- a/src/app/page.tsx
+++ b/src/app/page.tsx
@@ -78,10 +78,10 @@ export default async function Home() {
                 token={token}
                 className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
               >
-                {row.name}
+                {row.title}
               </AuthLink>
               <p className="text-sm text-muted">
-                {scheduleLabel(row.startsAt, row.endsAt)} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.startsAt} → {row.endsAt} · {row.resolvedMembers.length} product{row.resolvedMembers.length === 1 ? '' : 's'}
+                {scheduleLabel(row.startsAt, row.endsAt)} · {row.startsAt} → {row.endsAt} · {row.items.length} product{row.items.length === 1 ? '' : 's'}
               </p>
             </li>
           ))}
```

- [ ] **Step 8: Delete the replaced components and the unused library**

```bash
git rm src/timeDiscounts/components/TimeProductPicker.tsx src/timeDiscounts/components/TimeCollectionPicker.tsx src/timeDiscounts/components/PricingAmountFields.tsx src/lib/collections.ts
```

- [ ] **Step 9: Check nothing else referenced what was removed**

Run: `npx tsc --noEmit -p . ; grep -rn "pricesUniform\|getDiscountItems\|TimeProductPicker\|TimeCollectionPicker\|PricingAmountFields\|lib/collections\|updateTimeDiscountSelection\|updateTimeDiscountSchedule\|updateTimeDiscountTitle" src tests`
Expected: `tsc` prints nothing; the `grep` matches only the tier-discount module's own, unrelated `pricesUniform` (in `src/lib/config.ts`, `src/actions/discountActions.ts`, `src/app/discounts/new/page.tsx`, `src/app/discounts/[discountId]/page.tsx` and `tests/lib/config.test.ts`) — nothing under `src/timeDiscounts`, `src/app/time-discounts` or `tests/timeDiscounts`.

- [ ] **Step 10: Run everything**

Run: `npx vitest run && npx tsc --noEmit -p . && node --test extensions/product-tier-pricing-tests/*.test.js && NEXT_PUBLIC_SHOPIFY_API_KEY=x SHOPIFY_SHOP=x.myshopify.com npx next build`
Expected: vitest 261 tests in 23 files pass (260 plus the shared-scope guard test PR 1's final review added); `tsc` prints nothing; 135 extension tests pass; the build lists `/time-discounts/[discountId]` and `/time-discounts/new` without errors. (If Turbopack objects to your `node_modules`, add `--webpack` to `next build`.) `npx eslint src/timeDiscounts src/components/SavedToast.tsx src/app/time-discounts tests/timeDiscounts tests/components tests/storefront` prints nothing; `npx eslint src` still reports 4 errors in files this PR does not touch (the tier-discount pages, `layout.tsx`'s script tag and `PricingModeTierFields.tsx`).

- [ ] **Step 11: Commit**

```bash
git add -A src tests
git commit -m "feat: per-row products table page, row actions, autosave and the Saved pill"
```

### PR 2 hand-off

- [ ] `git push -u origin feat/per-row-time-discount-admin`, open the PR (title: "Per-row pricing admin: products table, autosave, Saved pill"). Body: the spec link, "collections removed; old discounts are converted to rows on read", the hand-off checks below, and the deploy command.
- [ ] Get a non-author review, merge, then deploy the app (Vercel) and, if the extension changed, the Shopify app with `shopify app deploy --config shopify.app.toml`.
- [ ] **Manual checks on the live store** (spec §9):
  - Create a discount from "Add time-based discount" (title + schedule only); you land on its page with an empty table.
  - Add a fixed-price row and a percent row; each shows the right discounted and regular price; "Saved" slides in from the top, stays 4 seconds, slides out and disappears.
  - Try a fixed price at or above the regular price: the row shows the message and Save stays disabled.
  - Edit a row (inline), cancel another, delete a row (confirm appears), delete the discount (confirm appears).
  - Reload the page: everything persisted; change the title (click away) and the dates (wait ~1 s): each shows "Saved".
  - Storefront: for each row's product, the sale price and countdown match that row's rule, per variant; the checkout price matches too.
  - An existing discount created before this change opens as a table of rows with its old shared price.
  - A discount that contains a product deleted in Shopify still shows that row (with dashes) so it can be removed.
  - Open the same discount in two tabs and save in both close together: the second save should not undo the first (known limit: saves from two tabs at the same instant are not coordinated).

