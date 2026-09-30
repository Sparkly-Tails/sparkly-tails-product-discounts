use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::HashMap;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Member {
    product_id: String,
    #[shopify_function(default)]
    variant_id: Option<String>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    #[shopify_function(default)]
    resolved_members: Vec<Member>,
    /// "percent" | "fixed" — mirrors TimeDiscount.pricingMode (admin, Task 1).
    #[shopify_function(default)]
    pricing_mode: String,
    /// Percent-off, or the fixed per-unit price — meaning depends on pricing_mode.
    #[shopify_function(default)]
    amount: f64,
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

    if config.resolved_members.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    // Build a product_id -> members index once, so each cart line does an
    // O(1) HashMap lookup instead of a full linear scan of resolved_members.
    // This is the checkout hot path (invoked on every cart recalculation),
    // and a collections-mode discount can have hundreds of resolved_members.
    let mut members_by_product: HashMap<&str, Vec<&Member>> = HashMap::new();
    for member in &config.resolved_members {
        members_by_product.entry(member.product_id.as_str()).or_default().push(member);
    }

    let mut candidates = vec![];

    for line in input.cart().lines().iter() {
        let variant = match line.merchandise() {
            schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
            _ => continue,
        };
        let product_id = variant.product().id();
        let variant_id = variant.id();

        let matches_member = members_by_product
            .get(product_id.as_str())
            .map(|members| {
                members.iter().any(|m| match &m.variant_id {
                    Some(vid) => vid == variant_id,
                    None => true,
                })
            })
            .unwrap_or(false);
        if !matches_member {
            continue;
        }

        let price = line.cost().amount_per_quantity().amount().as_f64();

        if config.pricing_mode == "fixed" {
            // Clamp to the line's own price, same fail-safe as the existing
            // Function: never produce a negative discount (a markup).
            let fixed_price = config.amount.min(price);
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
                message: Some(format!("{}% off", config.amount)),
                value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(config.amount),
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
}
