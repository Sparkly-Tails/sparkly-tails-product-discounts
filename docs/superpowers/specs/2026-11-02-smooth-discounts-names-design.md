# The widget's names: `smooth-discounts`

Date: 2026-11-02. Status: built (owner chose the full rename).

Every name of the storefront widget that started with `sparkly-tier` now starts with `smooth-discounts`:

| Before | After |
|---|---|
| `sparkly-tier-pricing` (the widget's root class) | `smooth-discounts` |
| `sparkly-tier-pricing__x` (elements) | `smooth-discounts__x` |
| `sparkly-tier-pricing--card` (modifier) | `smooth-discounts--card` |
| `data-sparkly-tier-pricing` (the marker the script looks for) | `data-smooth-discounts` |
| `--sparkly-tier-x` (CSS variables) | `--smooth-discounts-x` |
| `id="sparkly-tier-pricing-<block id>"`, `sparkly-tier-list-<block id>` | `smooth-discounts-<block id>`, `smooth-discounts-list-<block id>` |
| animations `sparklyTierFadeIn`, `sparklyTierPulse` | `smoothDiscountsFadeIn`, `smoothDiscountsPulse` |
| the scripts' shared object `window.SparklyTierPricing` | `window.SmoothDiscounts` |

Changed in the block, the extension source (script and stylesheet), the admin preview and the tests. Not changed: the `data-tier-pricing-*` attributes and the `data-flash-*` ones (they never had the prefix), the separate countdown widget (`sparkly-time-discount__…`), the old metafield namespaces and the cart snippet's `sparkly_tier…` Liquid variables (not widget names), and the plans and specs of earlier work (history).

Consequence: a theme or a merchant's own CSS that targets the old class names stops matching. The block's own "custom CSS" setting is unaffected, because it is wrapped in the block's id, which the block prints.

`tests/storefront/widgetNames.test.ts` fails if a `sparkly-tier` name comes back anywhere in the code, the stylesheet, the block or the tests.
