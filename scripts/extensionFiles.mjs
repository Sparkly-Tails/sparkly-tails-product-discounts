// The files the theme extension serves, and what each is built from (relative to extensions/product-tier-pricing/src).
// The first script is the one the tier block loads; the others are components it loads when a page needs them.
export const EXTENSION_SCRIPTS = [
  { entry: 'entries/core.js', name: 'tier-pricing.js' },
  { entry: 'entries/model.js', name: 'tier-pricing-model.js' },
  { entry: 'entries/paint.js', name: 'tier-pricing-paint.js' },
  { entry: 'entries/flash.js', name: 'tier-pricing-flash.js' },
  { entry: 'entries/siblings.js', name: 'tier-pricing-siblings.js' },
  { entry: 'entries/currency.js', name: 'tier-pricing-currency.js' },
  // The script of the "Product card prices" app embed (blocks/card-prices.liquid), which has nothing to do with the tier block.
  { entry: 'entries/cards.js', name: 'card-prices.js' },
]

export const EXTENSION_STYLESHEETS = [
  { entry: 'tier-pricing.css', name: 'tier-pricing.css' },
  { entry: 'card-prices.css', name: 'card-prices.css' },
]

// Shopify flags an app block script over this many bytes (AssetSizeAppBlockJavaScript); the build refuses one.
export const EXTENSION_SCRIPT_BYTE_LIMIT = 10_000
