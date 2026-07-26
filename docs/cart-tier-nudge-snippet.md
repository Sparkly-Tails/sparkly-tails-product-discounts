# Cart tier-nudge snippet (deferred manual implementation)

**Status:** not yet applied. Paste manually into the live theme when ready — this repo's app cannot write to the live theme via the API.

## What this does

Shows "Add N (more) for X% Off" on cart line items that haven't yet reached
their discount tier. The product page already shows this live (see
`extensions/product-tier-pricing`); the cart currently only shows Shopify's
own native `item.line_level_discount_allocations` line once a tier is
actually crossed — there's no built-in "nudge toward a discount" in Shopify's
cart, so this needs new code either way.

This is Option A from that discussion (paste directly into theme files, low
effort, but a theme vendor update could later overwrite it). Option B (a
sitewide Theme App Extension "app embed" that survives theme updates and
needs no manual paste) is deferred to a future release — see
`sparkly-tails-product-discounts.md` in project memory for that plan.

## Where to paste it

Both `snippets/cart-form.liquid` (cart drawer) and
`snippets/cart-form-page.liquid` (full cart page) contain this identical
block:

```liquid
{%- if item.line_level_discount_allocations.size > 0 -%}
  {%- for discount_allocation in item.line_level_discount_allocations -%}
    <spann class="text-size--xsmall">{{ 'cart.discount' | t }} {{ discount_allocation.discount_application.title }} (-{{ discount_allocation.amount | money }})</spann>
  {%- endfor -%}
{%- endif -%}
```

Paste the snippet below **immediately after** that block, in **both** files
(same location in each — the surrounding markup is byte-identical).

## Steps

1. Shopify admin → **Online Store → Themes → ⋯ → Edit code** (on the live theme).
2. Open `snippets/cart-form.liquid`. Find the block above and paste the snippet immediately after it. Save.
3. Open `snippets/cart-form-page.liquid`. Same paste, same location. Save.
4. Verify: add a product with a live discount to the cart below its tier threshold — the nudge should appear in both the drawer and the full cart page. Add enough to cross the threshold — the nudge should switch to nudging toward the *next* tier (if one exists) or disappear (if that was the highest tier).

## The snippet

```liquid
{%- comment -%}
  Sparkly Tails Product Discounts — cart-line tier nudge ("Add N (more) for X% Off").
  Mirrors computeTierState() in extensions/product-tier-pricing/assets/tier-pricing.js
  (sparkly-tails-product-discounts app). The line_level_discount_allocations block
  above already shows the currently-applied discount, if any — this only adds a
  nudge toward tiers not yet reached.
{%- endcomment -%}
{%- assign sparkly_tiers_field = item.product.metafields.sparkly_product_discounts.tiers -%}
{%- if sparkly_tiers_field != blank -%}
  {%- assign sparkly_tiers = sparkly_tiers_field.value.tiers | sort: 'minQty' -%}
  {%- assign sparkly_reached_count = 0 -%}
  {%- for sparkly_tier in sparkly_tiers -%}
    {%- if sparkly_tier.minQty <= item.quantity -%}
      {%- assign sparkly_reached_count = sparkly_reached_count | plus: 1 -%}
    {%- endif -%}
  {%- endfor -%}

  {%- if sparkly_reached_count > 0 -%}
    {%- comment -%} already discounted; nudge toward the next higher tier only, if any {%- endcomment -%}
    {%- assign sparkly_found = false -%}
    {%- for sparkly_tier in sparkly_tiers -%}
      {%- if sparkly_tier.minQty > item.quantity and sparkly_found == false -%}
        {%- assign sparkly_found = true -%}
        {%- assign sparkly_delta = sparkly_tier.minQty | minus: item.quantity -%}
        <span class="text-size--xsmall">Add {{ sparkly_delta }} more for {{ sparkly_tier.percentOff }}% Off</span>
      {%- endif -%}
    {%- endfor -%}
  {%- else -%}
    {%- comment -%} below every tier: list all, joined with " or " {%- endcomment -%}
    {%- assign sparkly_parts = '' -%}
    {%- for sparkly_tier in sparkly_tiers -%}
      {%- assign sparkly_delta = sparkly_tier.minQty | minus: item.quantity -%}
      {%- capture sparkly_part -%}Add {{ sparkly_delta }} for {{ sparkly_tier.percentOff }}% Off{%- endcapture -%}
      {%- if forloop.first -%}
        {%- assign sparkly_parts = sparkly_part -%}
      {%- else -%}
        {%- assign sparkly_parts = sparkly_parts | append: ' or ' | append: sparkly_part -%}
      {%- endif -%}
    {%- endfor -%}
    <span class="text-size--xsmall">{{ sparkly_parts }}</span>
  {%- endif -%}
{%- endif -%}
```
