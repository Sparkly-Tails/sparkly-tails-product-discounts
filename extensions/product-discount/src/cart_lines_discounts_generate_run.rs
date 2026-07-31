use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Tier {
    min_qty: i32,
    percent_off: f64,
    /// Optional exact total price for min_qty units (e.g. 10.00 for 7 units
    /// instead of a percentage's rounded 10.01). Absent entirely for a plain
    /// percentage-off tier, which keeps behaving exactly as before.
    anchor_price: Option<f64>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct ProductConfig {
    product_id: String,
    status: String,
    tiers: Vec<Tier>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    products: Vec<ProductConfig>,
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

    let config: &Config = match input.shop().metafield() {
        Some(metafield) => metafield.json_value(),
        None => return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] }),
    };

    let mut candidates = vec![];

    for line in input.cart().lines().iter() {
        let variant = match line.merchandise() {
            schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
            _ => continue,
        };
        let product_id = variant.product().id();

        let product_config = config
            .products
            .iter()
            .find(|p| &p.product_id == product_id && p.status == "live");

        let product_config = match product_config {
            Some(pc) => pc,
            None => continue,
        };

        let quantity = *line.quantity();

        let best_tier = product_config
            .tiers
            .iter()
            .filter(|t| t.min_qty <= quantity)
            .max_by_key(|t| t.min_qty);

        if let Some(tier) = best_tier {
            let value = match tier.anchor_price {
                Some(anchor_price) => {
                    // Anchor the total for min_qty units to an exact price
                    // (e.g. £10.00 instead of a percentage's rounded
                    // £10.01); units beyond min_qty still accrue at the
                    // tier's normal per-unit percentage rate. Expressed as a
                    // single FixedAmount off the whole line, computed here,
                    // so Shopify's own percentage rounding never has a
                    // chance to drift the anchored total off by a penny.
                    let unit_price = line.cost().amount_per_quantity().amount().as_f64();
                    let extra_units = (quantity - tier.min_qty) as f64;
                    // Derivation: total_paid should be anchor_price +
                    // extra_units * unit_price * (1 - percent_off/100).
                    // discount_amount = full_price - total_paid, which
                    // simplifies to the line below (the qty*unit_price and
                    // -extra_units*unit_price terms cancel down to
                    // min_qty*unit_price).
                    let discount_amount = (unit_price * tier.min_qty as f64) - anchor_price
                        + extra_units * unit_price * (tier.percent_off / 100.0);
                    // Round to whole pence before clamping — this is real
                    // money, and TS/JS both round explicitly elsewhere in
                    // this codebase, so this f64 arithmetic shouldn't be the
                    // one place relying on Shopify's own downstream rounding
                    // to paper over floating-point remainders.
                    let discount_amount = (discount_amount * 100.0).round() / 100.0;
                    let discount_amount = discount_amount.max(0.0);
                    schema::ProductDiscountCandidateValue::FixedAmount(
                        schema::ProductDiscountCandidateFixedAmount {
                            amount: Decimal(discount_amount),
                            applies_to_each_item: Some(false),
                        },
                    )
                }
                None => schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(tier.percent_off),
                }),
            };

            candidates.push(schema::ProductDiscountCandidate {
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget {
                        id: line.id().clone(),
                        quantity: None,
                    },
                )],
                message: Some(format!("{}% off", tier.percent_off)),
                value,
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
    fn applies_the_matching_tier_for_a_live_product() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [
                                        { "minQty": 5, "percentOff": 10.0 },
                                        { "minQty": 10, "percentOff": 20.0 }
                                    ]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => {
                match &op.candidates[0].value {
                    schema::ProductDiscountCandidateValue::Percentage(p) => {
                        assert_eq!(p.value.0, 10.0);
                    }
                    _ => panic!("expected a Percentage value when no anchor_price is set"),
                }
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_no_discount_below_the_lowest_threshold() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_product_with_no_discount_configured() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 10,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/999" }
                            }
                        }
                    ]
                },
                "shop": { "metafield": { "jsonValue": { "products": [] } } },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_draft_product_discount() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 10,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "draft",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn applies_independent_tiers_to_two_different_products_in_one_cart() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 20,
                            "cost": { "amountPerQuantity": { "amount": "2.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 8.0 }]
                                },
                                {
                                    "productId": "gid://shopify/Product/2",
                                    "status": "live",
                                    "tiers": [{ "minQty": 10, "percentOff": 25.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => {
                assert_eq!(op.candidates.len(), 2);
                // selection_strategy::First would make Shopify apply only one
                // of these two candidates and silently drop the other one at
                // checkout — confirmed live: two different products, each
                // above their own threshold, in the same cart, and only the
                // first one in cart order actually got discounted. All is
                // required whenever more than one product can qualify at once.
                assert_eq!(
                    op.selection_strategy,
                    schema::ProductDiscountSelectionStrategy::All
                );
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn anchors_the_total_at_exactly_min_qty() -> Result<()> {
        // unit_price=2.00, min_qty=5, anchor_price=8.50 (instead of the plain
        // 10% off total of 9.00) — at exactly min_qty, extra_units is 0, so
        // discount_amount should bring the line to exactly the anchor price.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "2.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0, "anchorPrice": 8.50 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    // full_price (5 * 2.00 = 10.00) - discount_amount should equal 8.50
                    assert!((f.amount.0 - 1.50).abs() < 1e-9, "got {}", f.amount.0);
                    assert_eq!(f.applies_to_each_item, Some(false));
                }
                _ => panic!("expected a FixedAmount value when anchor_price is set"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn accrues_at_the_percent_rate_above_min_qty_with_an_anchor() -> Result<()> {
        // Same tier as above, but 2 extra units beyond min_qty (qty=7).
        // Expected total paid: anchor_price (8.50) + 2 * (2.00 * 0.90) = 8.50 + 3.60 = 12.10.
        // full_price = 7 * 2.00 = 14.00, so discount_amount should be 1.90.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 7,
                            "cost": { "amountPerQuantity": { "amount": "2.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0, "anchorPrice": 8.50 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    let full_price = 7.0 * 2.00;
                    let total_paid = full_price - f.amount.0;
                    assert!((total_paid - 12.10).abs() < 1e-9, "got {}", total_paid);
                }
                _ => panic!("expected a FixedAmount value when anchor_price is set"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn never_produces_a_negative_discount_amount() -> Result<()> {
        // A pathological anchor_price higher than the plain percentage total
        // must never result in a discount_amount below 0 (which would mean
        // charging the customer MORE than sticker price).
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "2.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0, "anchorPrice": 50.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    assert_eq!(f.amount.0, 0.0);
                }
                _ => panic!("expected a FixedAmount value when anchor_price is set"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn rounds_the_discount_amount_to_whole_pence() -> Result<()> {
        // unit_price=1.10, min_qty=3, percent_off=33.33, anchor=2.00, qty=4
        // (1 extra unit) produces a raw discount_amount of 1.66663 before
        // rounding — hand-derived independently of the implementation (see
        // project memory) to confirm this isn't just checking the formula
        // against itself. Every other test in this file happens to use
        // inputs that multiply out to a clean 2-decimal result, which is
        // exactly how an unrounded f64 remainder could have shipped unnoticed.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 4,
                            "cost": { "amountPerQuantity": { "amount": "1.10" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 3, "percentOff": 33.33, "anchorPrice": 2.00 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    assert_eq!(f.amount.0, 1.67, "expected the rounded 1.67, got {}", f.amount.0);
                }
                _ => panic!("expected a FixedAmount value when anchor_price is set"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }
}
