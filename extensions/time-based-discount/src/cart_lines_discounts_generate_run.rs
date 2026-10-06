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
            .and_then(|product_items| select_item(product_items, variant_id))
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

#[cfg(test)]
mod tests {
    use super::*;
    use shopify_function::{run_function_with_input, Result};

    #[test]
    fn applies_a_percent_discount_to_a_matching_line() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 25.0),
                _ => panic!("expected Percentage"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_a_fixed_price_discount_to_a_matching_line() -> Result<()> {
        // basePrice 10.00, fixedPrice 7.50, qty 2 -> discount (10.00-7.50)*2 = 5.00
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "fixed",
                            "amount": 7.50
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    assert!((f.amount.0 - 5.00).abs() < 1e-9, "expected 5.00, got {}", f.amount.0);
                    assert_eq!(f.applies_to_each_item, Some(false), "discount must apply once to the whole line, not per unit — if this flips to Some(true), Shopify takes the amount off EACH unit instead");
                }
                _ => panic!("expected FixedAmount"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_fixed_price_above_sticker_price_never_produces_a_markup() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "5.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "fixed",
                            "amount": 20.00
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_line_whose_product_is_not_in_resolved_members() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/999" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn matches_a_specific_variant_only_when_variant_id_is_present() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/901" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0, "variant 900 must not match a resolvedMembers entry pinned to variant 901");
        Ok(())
    }

    #[test]
    fn matches_a_specific_variant_when_the_ids_agree() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/901" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1, "variant 901 must match a resolvedMembers entry pinned to variant 901");
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 25.0),
                _ => panic!("expected Percentage"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn returns_no_operations_when_no_metafield_is_present() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": { "discountClasses": ["PRODUCT"], "metafield": null }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

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
}
