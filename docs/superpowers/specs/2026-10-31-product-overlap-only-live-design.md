# A product is blocked only while its other discount is active

Date: 2026-10-31. Status: approved by the owner in chat (approach, scope and the meaning of "active"; see Decisions).

## Why

In the tier discount form a product that sits in any other discount, even a draft or one taken offline, is hidden from the product search and refused on Save. The owner could not pick such a product and got no explanation. Only a discount that is actually running should keep a product away from another discount.

## What the owner decided

1. **Approach:** block only when the other discount is live. (The alternative, any product in any discount with a priority order, was rejected: it would also change the storefront widget and the checkout function.)
2. **Scope:** the tier discount form only. The time-based discount form keeps hiding any product that is in any discount, as today.
3. **Active for a time-based discount** means upcoming or running (not expired). It is used wherever the tier form checks time-based discounts.
4. **Process:** run end to end (design, plan, small test-first PRs) and stop at open PRs.

## Behaviour

- **Product search and Browse** list every product. Nothing is hidden.
- **Picking a product (or a variant)** that is in another *live* tier discount adds nothing and shows `Product already in discount "<discount name>"` (`Variant already in discount …` for a variant). A product in a draft or offline discount is added normally. A multi-variant product opens its variant list with every variant; the error shows when a variant that is claimed is picked.
- **A discount may be saved as a draft or offline** while it holds products that also sit in a live discount. Only what the discount is live with is checked.
- **Go live, and Save on a discount that is live,** check every member against every *other* live tier discount. A conflict refuses the save and names the product and the discount: `"<Product>" is already in live discount "<name>". A product can only be in one live discount: take "<name>" offline or remove the product here.` Nothing is saved.
- **A live flash sale** keeps its extra check against time-based discounts, now only against upcoming or running ones: `"<Product>" is already in time-based discount "<name>", which is upcoming or running. A flash sale cannot share a product with it.` Expired time-based discounts no longer refuse it.
- The overlap rule between a whole product and one of its variants is unchanged: they match.
- The discount being edited never conflicts with itself.

## Non-goals

- No priority order between overlapping discounts.
- No change to the time-based discount form or to how it checks tier discounts.
- No new check of time-based discounts in the tier picker (the tier form never checked them there).
- No data migration: stored discounts keep their shape.

## Anti-goals

- A live discount must never end up sharing a product with another live tier discount.
- A refusal must leave the stored discounts and the storefront exactly as they were.

## My calls (the owner can overrule)

- The picker check runs when a product is picked, as today's `validateMemberAction`; the search itself only lists.
- The save check reads the stored config at save time, so two forms open at once cannot both go live with the same product unless they save in the same instant (the same limit the old rule had).
- Product titles in refusals come from one Shopify lookup of the conflicting member only.
- The legacy `assertMembersAvailable` and `assertMembersAvailableEverywhere` steps are removed once nothing calls them; `isProductAvailable` stays (the time-based form uses it).
