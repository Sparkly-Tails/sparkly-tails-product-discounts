# Live sibling data in the tier widget — design

**Date:** 2026-10-13
**Status:** awaiting review
**Branch:** `feat/live-sibling-data`

## Problem

For every product in a tier discount, `syncDiscountMetafields`
(`src/lib/product-tiers.ts`) writes a `sparkly_product_discounts.discount`
metafield. Its `siblings` list copies, for every OTHER member, the sibling's
`title`, `handle` and `imageUrl`, and `ownVariantOptions` copies this product's
own variant titles. The mix & match list in the widget is built from those
copies, so renaming a product, changing a handle or swapping an image leaves the
widget showing old data until the discount is saved again.

## What the user asked for / decided

- Store IDs and look the rest up, so the widget never goes stale.
- Live tier discounts exist on the real store, so the rollout must not blank the
  widget while it switches over: Liquid keeps a temporary fallback to the old
  copied fields. A later cleanup PR removes it.
- Merging and deploying are the user's actions.
- This work does not touch metafield namespaces; the move to `$app:smooth_discount`
  is on hold and independent.

## Design

### 1. What is stored

The `discount` metafield keeps `discountId`, `title`, `pricingMode`, `tiers`,
`ownVariantIds`. It changes:

- `siblings` becomes `[{ productId, variantId? }]` — IDs only, one entry per OTHER
  member, same order as today. `title`, `handle` and `imageUrl` are no longer
  written.
- `ownVariantOptions` is no longer written. This product's own variants are
  read live from `product.variants` in Liquid, matched by `ownVariantIds`.

Two new metafields are written on each product in the discount, in the same
namespace (`sparkly_product_discounts`):

| Key | Type | Content |
|---|---|---|
| `sibling_products` | `list.product_reference` | GIDs of the OTHER members that are whole products (no `variantId`), in member order |
| `sibling_variants` | `list.variant_reference` | GIDs of the OTHER members that are specific variants, in member order |

Shopify resolves references when the page renders, so Liquid sees the current
title, handle/URL and image. A key with no entries is deleted (not written as an
empty list), so a product that stops having siblings does not keep stale
references.

The writer (`syncDiscountMetafields`) no longer calls `getMemberInfo`, so a save
makes one fewer batch of API calls. `clearDiscountMetafields` also deletes the
two new keys.

### 2. Liquid (`blocks/tier-pricing.liquid`)

For each `siblings` entry in the JSON (the IDs), the block finds the matching
object in `sibling_variants` (by variant ID) or `sibling_products` (by product
ID) and emits, for the widget:

```
{ productId, variantId, title, url, imageUrl }
```

- Whole product: `title = product.title`, `url = product.url`, `imageUrl` from
  `product.featured_image | image_url`.
- Variant: `title = variant.product.title | append: ' – ' | append: variant.title`
  (the same "Product – Variant" label as today), `url = variant.product.url`
  with `?variant=<numeric id>`, image from `variant.featured_image`, else the
  product's.
- Own variants: for each `ownVariantIds` entry, `title` comes from the matching
  entry in `product.variants`.
- Unresolved reference (product deleted, unpublished or draft): the entry is
  kept in `siblings` with its IDs (so combined quantity still counts it) but is
  marked `listed: false`, and the widget leaves it out of the mix & match list.
- **Temporary fallback** (live discounts exist): when the reference does not
  resolve AND the old copied `title`/`handle`/`imageUrl` fields are present on
  that entry, they are used and the entry is `listed: true`. The fallback is
  one clearly marked block, removed by the cleanup PR.

### 3. Widget script (`assets/tier-pricing.js`)

- `parseWidgetConfig` reads `siblings` as before for counting (IDs), and builds
  the mix & match list from entries where `listed` is true.
- `buildMixMatchRows` uses the `url` Liquid provides instead of building
  `'/products/' + handle`, so links honor the storefront's URL structure.
- `buildDisplayMixMatchItems` keeps its own-variant rows; they now carry the
  live `title` and a `url`.
- No change to the pricing math, the tiers or the cart-quantity logic.

### 4. Time-based discount

Out of scope: the `time_based_discount` metafield stores prices and IDs only, no
copied titles or images.

## Rollout (all steps are the user's actions)

1. Merge the PR so Vercel deploys the admin (it writes the new shape on the next
   save).
2. Run `shopify app deploy --config shopify.app.toml` (the new Liquid, with
   the fallback).
3. Re-save each live tier discount in the admin. Its products' metafields are
   rewritten in the new shape.
4. Check a product page: rename a sibling product (or change its image), reload,
   and the mix & match list updates with no re-save. Also check a product that is
   a variant sibling, and a sibling that is unpublished (it must disappear from
   the list).
5. Later, the cleanup PR removes the fallback.

Either order of steps 1 and 2 is safe: new Liquid reads the old shape through the
fallback, and old Liquid keeps reading a product until it is re-saved (re-saving
before step 2 would give old Liquid entries with no titles, so re-save only after
step 2).

## Assumptions to prove in the first plan step

A throwaway test on the demo store, never production:

1. Liquid resolves a `list.product_reference` and a `list.variant_reference`
   metafield in the `sparkly_product_discounts` namespace with NO metafield
   definition, and the resolved object has `title`, `url` and `featured_image`.
2. A variant reference gives `variant.product.title`, `variant.title`, and an
   image (`variant.featured_image` or the product's).
3. A list of references can hold as many entries as a discount can have members
   (the metafield has a maximum list length; if a discount can exceed it, the
   design must split or cap it).
4. An unpublished or draft product's reference does not resolve in Liquid.

If assumption 1 fails (a definition is required), the plan adds definitions for
the two keys to `shopify.app.toml` (storefront read) as a step; the design
otherwise holds.

## Out of scope

- Removing the fallback (cleanup PR).
- Namespace changes (the on-hold `$app:smooth_discount` work).
- Webhook-based refreshing of copies.
- Group time discounts and the time-based widget.

## Testing

- vitest: the writer — IDs only in `siblings`; whole-product siblings go to
  `sibling_products` and variant siblings to `sibling_variants`, in member order;
  empty key deleted; `getMemberInfo` not called; `clearDiscountMetafields` also
  deletes both new keys; existing tests updated.
- Extension tests (`node --test extensions/product-tier-pricing-tests/*.test.js`):
  mix & match rows use the provided `url`, and a `listed: false` entry is left
  out of the list but still counted in the combined quantity.
- `tsc`, eslint on touched code, `next build --webpack`.
- Liquid has no automated test runner here; the live check in rollout step 4
  covers it.

## Delivery

Version bump to 0.22.0 in `package.json` and `package-lock.json` in each code
commit. One PR from `feat/live-sibling-data`; non-author review required; the PR
description states the rollout order.

## Risks

| Risk | Cost | Mitigation |
|---|---|---|
| Liquid does not resolve references without a definition | Mix & match list empty for re-saved products | Assumption 1, proved first; the fix is two TOML definitions |
| List length limit below a discount's member count | Writes fail on large discounts | Assumption 3, proved first; cap or split |
| Re-save before the Liquid deploy | Old Liquid shows rows without titles | Rollout says re-save only after the deploy |
| Resolved URL differs from the old `/products/<handle>` | None expected (it is the storefront's own URL) | Check in rollout step 4 |
