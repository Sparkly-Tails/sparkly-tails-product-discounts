use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Tier {
    min_qty: i32,
    #[shopify_function(default)]
    percent_off: Option<f64>,
    /// Optional exact total price for min_qty units (e.g. 10.00 for 7 units
    /// instead of a percentage's rounded 10.01). Absent entirely for a plain
    /// percentage-off tier, which keeps behaving exactly as before. percent
    /// mode only.
    #[shopify_function(default)]
    anchor_price: Option<f64>,
    /// Absolute price per unit for a fixed-price tier — every unit in the
    /// reached tier is charged this price directly. fixed mode only,
    /// mutually exclusive with percent_off/anchor_price (enforced by the
    /// admin app that writes this config, not by this struct).
    #[shopify_function(default)]
    fixed_price: Option<f64>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Member {
    product_id: String,
    #[shopify_function(default)]
    variant_id: Option<String>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct DiscountConfig {
    status: String,
    members: Vec<Member>,
    tiers: Vec<Tier>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    discounts: Vec<DiscountConfig>,
}

/// Splits a total discount amount across cart lines proportional to each
/// line's quantity share, in whole pence, using the largest-remainder
/// method: floor every line's exact share first, then hand out the
/// leftover pence one at a time to the lines with the largest fractional
/// remainder, ties broken toward the earliest line by order in
/// `quantities`. Deliberately NOT "round each share independently, then
/// dump the whole leftover onto one line" — that approach can go negative.
/// `discount_amount_total` must already be clamped to >= 0.
fn split_discount_by_largest_remainder(discount_amount_total: f64, quantities: &[i32]) -> Vec<i64> {
    let total_quantity: i32 = quantities.iter().sum();
    let total_pence = (discount_amount_total * 100.0).round() as i64;
    let shares: Vec<f64> = quantities
        .iter()
        .map(|qty| discount_amount_total * (*qty as f64 / total_quantity as f64) * 100.0)
        .collect();
    let mut pence_per_line: Vec<i64> = shares.iter().map(|s| s.floor() as i64).collect();

    let floor_sum: i64 = pence_per_line.iter().sum();
    let remainder = total_pence - floor_sum;
    if remainder > 0 {
        let mut order: Vec<usize> = (0..shares.len()).collect();
        order.sort_by(|&a, &b| {
            let frac_a = shares[a] - pence_per_line[a] as f64;
            let frac_b = shares[b] - pence_per_line[b] as f64;
            frac_b
                .partial_cmp(&frac_a)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.cmp(&b))
        });
        for &idx in order.iter().take(remainder as usize) {
            pence_per_line[idx] += 1;
        }
    }
    pence_per_line
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

    for discount in config.discounts.iter().filter(|d| d.status == "live") {
        let mut line_ids = vec![];
        let mut line_quantities: Vec<i32> = vec![];
        let mut line_unit_price: Option<f64> = None;

        for line in input.cart().lines().iter() {
            let variant = match line.merchandise() {
                schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
                _ => continue,
            };
            let product_id = variant.product().id();
            let variant_id = variant.id();

            let matches_member = discount.members.iter().any(|m| {
                if &m.product_id != product_id {
                    return false;
                }
                match &m.variant_id {
                    Some(vid) => vid == variant_id,
                    None => true,
                }
            });
            if !matches_member {
                continue;
            }

            let price = line.cost().amount_per_quantity().amount().as_f64();
            // Take the MINIMUM matching line's unit price, not simply the
            // last one seen in cart order — a fail-safe for the case where
            // the shared-price premise a fixed/anchor discount depends on
            // is somehow violated at checkout time (e.g. a differently
            // priced selling plan), even though the admin app only allows
            // fixed/anchor pricing when every member shares one price at
            // save time. Under-discounts rather than computing an
            // arbitrary or inflated total off whichever line happened to
            // be scanned last.
            line_unit_price = Some(match line_unit_price {
                Some(current) => current.min(price),
                None => price,
            });
            line_ids.push(line.id().clone());
            line_quantities.push(*line.quantity());
        }

        if line_ids.is_empty() {
            continue;
        }

        let line_unit_price = line_unit_price.unwrap_or(0.0);
        let total_quantity: i32 = line_quantities.iter().sum();

        let best_tier = discount
            .tiers
            .iter()
            .filter(|t| t.min_qty <= total_quantity)
            .max_by_key(|t| t.min_qty);

        let tier = match best_tier {
            Some(t) => t,
            None => continue,
        };

        if let Some(fixed_price) = tier.fixed_price {
            let discount_amount_total = ((line_unit_price - fixed_price) * total_quantity as f64 * 100.0).round() / 100.0;
            let discount_amount_total = discount_amount_total.max(0.0);

            let pence_per_line = split_discount_by_largest_remainder(discount_amount_total, &line_quantities);

            for (id, pence) in line_ids.iter().zip(pence_per_line.iter()) {
                if *pence == 0 {
                    continue;
                }
                candidates.push(schema::ProductDiscountCandidate {
                    targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                        schema::CartLineTarget { id: id.clone(), quantity: None },
                    )],
                    message: Some(format!("£{:.2} each", fixed_price)),
                    value: schema::ProductDiscountCandidateValue::FixedAmount(
                        schema::ProductDiscountCandidateFixedAmount {
                            amount: Decimal(*pence as f64 / 100.0),
                            applies_to_each_item: Some(false),
                        },
                    ),
                    associated_discount_code: None,
                    prerequisites: None,
                });
            }
        } else {
            let percent_off = tier.percent_off.unwrap_or(0.0);
            match tier.anchor_price {
                None => {
                    for id in &line_ids {
                        candidates.push(schema::ProductDiscountCandidate {
                            targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                                schema::CartLineTarget { id: id.clone(), quantity: None },
                            )],
                            message: Some(format!("{}% off", percent_off)),
                            value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                                value: Decimal(percent_off),
                            }),
                            associated_discount_code: None,
                            prerequisites: None,
                        });
                    }
                }
                Some(anchor_price) => {
                    let extra_units = (total_quantity - tier.min_qty) as f64;
                    let discount_amount_total = (line_unit_price * tier.min_qty as f64) - anchor_price
                        + extra_units * line_unit_price * (percent_off / 100.0);
                    let discount_amount_total = (discount_amount_total * 100.0).round() / 100.0;
                    let discount_amount_total = discount_amount_total.max(0.0);

                    let pence_per_line = split_discount_by_largest_remainder(discount_amount_total, &line_quantities);

                    for (id, pence) in line_ids.iter().zip(pence_per_line.iter()) {
                        if *pence == 0 {
                            continue;
                        }
                        candidates.push(schema::ProductDiscountCandidate {
                            targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                                schema::CartLineTarget { id: id.clone(), quantity: None },
                            )],
                            message: Some(format!("{}% off", percent_off)),
                            value: schema::ProductDiscountCandidateValue::FixedAmount(
                                schema::ProductDiscountCandidateFixedAmount {
                                    amount: Decimal(*pence as f64 / 100.0),
                                    applies_to_each_item: Some(false),
                                },
                            ),
                            associated_discount_code: None,
                            prerequisites: None,
                        });
                    }
                }
            }
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/999" }
                            }
                        }
                    ]
                },
                "shop": { "metafield": { "jsonValue": { "discounts": [] } } },
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "draft",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 20,
                            "cost": { "amountPerQuantity": { "amount": "2.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 5, "percentOff": 8.0 }]
                                },
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/2" }],
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
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
        // charging the customer MORE than sticker price). Now that the
        // single-member and multi-member cases share one loop, a
        // clamped-to-zero anchor discount goes through the same
        // zero-pence-skip as every other discount (see
        // split_discount_by_largest_remainder call sites): it must emit no
        // candidate at all, not a £0.00 FixedAmount one, exactly like
        // a_fixed_price_above_sticker_price_never_produces_a_markup below.
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0, "anchorPrice": 50.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0, "a clamped-to-zero anchor discount must emit no candidates and no operations, same as any other zero-discount cart");
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
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

    #[test]
    fn applies_a_group_percent_tier_to_each_matching_line_independently() -> Result<()> {
        // Two different products, same price, combined quantity (4+3=7)
        // reaches the group's tier — each line gets its own Percentage
        // candidate, no split math since there's no anchor.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 4,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
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
                assert_eq!(op.selection_strategy, schema::ProductDiscountSelectionStrategy::All);
                for candidate in &op.candidates {
                    match &candidate.value {
                        schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 8.0),
                        _ => panic!("expected a Percentage value when the group tier has no anchor"),
                    }
                }
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_no_group_discount_below_the_combined_threshold() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
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
    fn ignores_a_draft_group() -> Result<()> {
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "draft",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
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
    fn defaults_groups_to_empty_when_the_stored_config_predates_the_field() -> Result<()> {
        // No "groups" key at all in shop.metafield.jsonValue — must not error,
        // for backward compatibility with configs saved before this feature.
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        Ok(())
    }

    #[test]
    fn splits_an_anchored_group_discount_proportionally_with_penny_remainder_to_the_earliest_line() -> Result<()> {
        // 3 lines, each quantity 1 (total 3, exactly the tier's min_qty, so
        // extra_units is 0). unit_price=1.00, anchor_price=2.50:
        // discount_amount_total = (1.00*3) - 2.50 = 0.50 (50 pence).
        // Using the largest-remainder split: each line's exact share is
        // 50 * (1/3) = 16.666... pence; flooring gives [16, 16, 16] (sum
        // 48), 2 pence short of the 50-penny total. All three lines have
        // the same fractional remainder (0.666...), so the tie-break
        // (earliest line by cart order) hands the 2 leftover pence to
        // lines 0 and 1 in turn, giving [17, 17, 16].
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/902",
                                "product": { "id": "gid://shopify/Product/3" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" },
                                        { "productId": "gid://shopify/Product/3" }
                                    ],
                                    "tiers": [{ "minQty": 3, "percentOff": 10.0, "anchorPrice": 2.50 }]
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
                assert_eq!(op.candidates.len(), 3);
                let amounts: Vec<f64> = op
                    .candidates
                    .iter()
                    .map(|c| match &c.value {
                        schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
                        _ => panic!("expected a FixedAmount value when the group tier has an anchor"),
                    })
                    .collect();
                assert_eq!(amounts, vec![0.17, 0.17, 0.16]);
                let total: f64 = amounts.iter().sum();
                assert!((total - 0.50).abs() < 1e-9, "amounts must sum exactly to the total discount, got {}", total);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_group_discount_and_a_standalone_discount_coexist_in_one_cart() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "2.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/9" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 4,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/902",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/9" }],
                                    "tiers": [{ "minQty": 5, "percentOff": 25.0 }]
                                },
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
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
                assert_eq!(op.candidates.len(), 3);
                assert_eq!(op.selection_strategy, schema::ProductDiscountSelectionStrategy::All);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn never_splits_a_group_discount_into_a_negative_line_amount() -> Result<()> {
        // Regression test for a real bug: round-then-dump split math could
        // go negative for 4+ lines sharing a small total discount. Here, 6
        // products at 1.99 each, one of each in cart (total 6 * 1.99 =
        // 11.94), anchored to a clean 11.90 -> total discount is only 4
        // pence spread across 6 lines. Naive per-line rounding of each
        // 0.6666-pence share up to 1 pence would allocate 6 pence against a
        // 4-pence total, forcing a -2 correction onto one line. The
        // largest-remainder method must never produce a negative amount:
        // every line's floor share is >= 0, so only whole extra pence are
        // ever added, never subtracted.
        //
        // This same scenario also exercises the zero-pence skip: each
        // line's floored share is 0 (0.6666 pence floors to 0), and only 4
        // of the 6 leftover pence get distributed (the total is 4 pence),
        // so exactly 4 of the 6 lines end up with 1 pence and the other 2
        // stay at 0 pence — a zero-amount candidate is a pure no-op and
        // must not be emitted (Shopify's function-result validation may
        // reject a zero-amount candidate outright, failing the whole
        // discount operation, and even if accepted it would show as
        // "10% off — £0.00" at checkout).
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/902",
                                "product": { "id": "gid://shopify/Product/3" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/3",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/903",
                                "product": { "id": "gid://shopify/Product/4" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/4",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/904",
                                "product": { "id": "gid://shopify/Product/5" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/5",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/905",
                                "product": { "id": "gid://shopify/Product/6" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" },
                                        { "productId": "gid://shopify/Product/3" },
                                        { "productId": "gid://shopify/Product/4" },
                                        { "productId": "gid://shopify/Product/5" },
                                        { "productId": "gid://shopify/Product/6" }
                                    ],
                                    "tiers": [{ "minQty": 6, "percentOff": 10.0, "anchorPrice": 11.90 }]
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
                // Only 4 of the 6 matching lines get a nonzero pence share
                // (see comment above) — the other 2 must be skipped
                // entirely, not emitted as zero-amount candidates.
                assert_eq!(op.candidates.len(), 4, "zero-pence lines must be skipped, not emitted as £0.00 candidates");
                let amounts: Vec<f64> = op
                    .candidates
                    .iter()
                    .map(|c| match &c.value {
                        schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
                        _ => panic!("expected a FixedAmount value when the group tier has an anchor"),
                    })
                    .collect();
                for amount in &amounts {
                    assert!(*amount >= 0.0, "no per-line group discount amount may be negative, got {}", amount);
                    assert!(*amount > 0.0, "zero-amount candidates must not be emitted, got {}", amount);
                }
                let total: f64 = amounts.iter().sum();
                assert!((total - 0.04).abs() < 1e-9, "amounts must sum exactly to the total discount, got {}", total);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn assigns_the_largest_remainder_pence_by_fractional_share_not_by_quantity() -> Result<()> {
        // 3 lines with UNEQUAL quantities [1, 5, 1] (total 7, exactly
        // min_qty, so extra_units is 0). unit_price=1.00, anchor_price=6.90:
        // discount_amount_total = (1.00*7) - 6.90 = 0.10 (10 pence).
        // Exact per-line shares (in pence): line0 = 10*(1/7) = 1.4286,
        // line1 = 10*(5/7) = 7.1429, line2 = 10*(1/7) = 1.4286. Flooring
        // gives [1, 7, 1] (sum 9), one penny short of the 10-penny total.
        // Fractional remainders are [0.4286, 0.1429, 0.4286] — line1 (the
        // LARGEST quantity) has the SMALLEST fractional remainder and must
        // NOT receive the extra penny; it goes to whichever of line0/line2
        // has the largest fractional remainder, tied here, so the
        // earliest-line tie-break lands it on line0: [2, 7, 1].
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/902",
                                "product": { "id": "gid://shopify/Product/3" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" },
                                        { "productId": "gid://shopify/Product/3" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 10.0, "anchorPrice": 6.90 }]
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
                assert_eq!(op.candidates.len(), 3);
                let amounts: Vec<f64> = op
                    .candidates
                    .iter()
                    .map(|c| match &c.value {
                        schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
                        _ => panic!("expected a FixedAmount value when the group tier has an anchor"),
                    })
                    .collect();
                assert_eq!(amounts, vec![0.02, 0.07, 0.01]);
                let total: f64 = amounts.iter().sum();
                assert!((total - 0.10).abs() < 1e-9, "amounts must sum exactly to the total discount, got {}", total);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_a_fixed_price_tier_as_a_fixed_amount_discount() -> Result<()> {
        // basePrice 1.99, fixedPrice 1.50 at qty 3 → discount 0.49/unit * 3 = 1.47
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [
                                        { "minQty": 1, "fixedPrice": 1.70 },
                                        { "minQty": 3, "fixedPrice": 1.50 }
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
                assert_eq!(op.candidates.len(), 1);
                match &op.candidates[0].value {
                    schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                        assert!((f.amount.0 - 1.47).abs() < 1e-9, "expected 1.47, got {}", f.amount.0);
                    }
                    _ => panic!("expected a FixedAmount value for a fixed-price tier"),
                }
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn uses_the_lower_reached_fixed_price_tier_between_thresholds() -> Result<()> {
        // qty 2 hasn't reached the minQty:3 tier, so the minQty:1 tier (1.70)
        // still governs the WHOLE quantity — same "highest reached tier"
        // rule as percentage tiers. Discount = (1.99-1.70)*2 = 0.58.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [
                                        { "minQty": 1, "fixedPrice": 1.70 },
                                        { "minQty": 3, "fixedPrice": 1.50 }
                                    ]
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
                    assert!((f.amount.0 - 0.58).abs() < 1e-9, "expected 0.58, got {}", f.amount.0);
                }
                _ => panic!("expected a FixedAmount value"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_fixed_price_above_sticker_price_never_produces_a_markup() -> Result<()> {
        // fixedPrice 5.00 on a 1.49 product must clamp to 0 discount, not a
        // negative amount that would inflate the price the customer pays.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 1, "fixedPrice": 5.00 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0, "a clamped-to-zero discount must emit no candidates and no operations, same as any other zero-discount cart");
        Ok(())
    }

    #[test]
    fn defaults_fixed_price_to_none_when_the_stored_config_predates_the_field() -> Result<()> {
        // No "fixedPrice" key at all in the tier — must not error, for
        // backward compatibility with configs saved before this feature.
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
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
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
                schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 10.0),
                _ => panic!("expected Percentage — a tier with no fixedPrice key must behave exactly as before"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_a_fixed_price_group_tier_split_across_matching_lines() -> Result<()> {
        // 2 lines, qty 1 + qty 2 = 3 total, reaching minQty:3 (fixedPrice
        // 1.50). unit_price 1.99: discount_amount_total = (1.99-1.50)*3 =
        // 1.47. Split by quantity share: line0 (qty1) gets 1/3 = 49p, line1
        // (qty2) gets 2/3 = 98p — no remainder to distribute (49+98=147).
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/901",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2" }
                                    ],
                                    "tiers": [
                                        { "minQty": 1, "fixedPrice": 1.70 },
                                        { "minQty": 3, "fixedPrice": 1.50 }
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
                assert_eq!(op.candidates.len(), 2);
                let amounts: Vec<f64> = op
                    .candidates
                    .iter()
                    .map(|c| match &c.value {
                        schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
                        _ => panic!("expected a FixedAmount value for a fixed-price group tier"),
                    })
                    .collect();
                assert_eq!(amounts, vec![0.49, 0.98]);
                let total: f64 = amounts.iter().sum();
                assert!((total - 1.47).abs() < 1e-9, "amounts must sum exactly to the total discount, got {}", total);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_fixed_price_group_discount_never_produces_a_markup() -> Result<()> {
        // fixedPrice 5.00 on 1.99 products must clamp to 0, not a negative
        // total that would try to split a markup across the lines.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [{ "productId": "gid://shopify/Product/1" }],
                                    "tiers": [{ "minQty": 1, "fixedPrice": 5.00 }]
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
    fn variant_scoped_member_ignores_a_different_variant_of_the_same_product() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 7,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/999",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/500" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 4.0 }]
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
    fn variant_scoped_member_matches_its_exact_variant() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 7,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/500",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/500" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 4.0 }]
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
                    schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 4.0),
                    _ => panic!("expected a Percentage value"),
                }
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn mixed_members_combine_quantity_across_a_whole_product_and_a_specific_variant_of_another() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 4,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/500",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 10,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/501",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "discounts": [
                                {
                                    "status": "live",
                                    "members": [
                                        { "productId": "gid://shopify/Product/1" },
                                        { "productId": "gid://shopify/Product/2", "variantId": "gid://shopify/ProductVariant/500" }
                                    ],
                                    "tiers": [{ "minQty": 7, "percentOff": 4.0 }]
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
                // Line 0 (qty 4) + line 1 (qty 3, the matching variant of
                // Product/2) = 7, reaching the tier. Line 2 (the OTHER variant
                // of Product/2, qty 10) must NOT be discounted.
                assert_eq!(op.candidates.len(), 2);
                let targeted_line_ids: Vec<String> = op.candidates.iter().map(|c| {
                    match &c.targets[0] {
                        schema::ProductDiscountCandidateTarget::CartLine(t) => t.id.to_string(),
                    }
                }).collect();
                assert!(targeted_line_ids.contains(&"gid://shopify/CartLine/0".to_string()));
                assert!(targeted_line_ids.contains(&"gid://shopify/CartLine/1".to_string()));
                assert!(!targeted_line_ids.contains(&"gid://shopify/CartLine/2".to_string()));
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }
}
