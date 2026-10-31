# The widget script: small readable modules, minified and split when built

Date: 2026-10-31. Status: approved by the owner on 2026-10-31 and built (plan: `docs/superpowers/plans/2026-10-31-widget-script-split-and-minify.md`). The sections "What was built" and "Differences from the first draft" at the end say where the build differs from the draft below.

## Why

`extensions/product-tier-pricing/assets/tier-pricing.js` is one 59.7 KB file, shipped as written. Shopify's check for app block JavaScript (`AssetSizeAppBlockJavaScript`) flags any file over 10,000 bytes; it measures the raw file size and is a suggestion that Shopify does not enforce yet. The owner wants a lighter first load: the production code minified, the rest of it split into small components that load only when a page needs them (the flash sale, the siblings list), and a readable version kept for editing.

Measured on 2026-10-31 (esbuild, gzip): the script is 59,680 B raw, 26,241 B minified, 8,178 B minified and gzipped. The stylesheet is 24,071 B raw, 18,610 B minified, 3,497 B gzipped. Minifying alone is not enough for the check (26 KB raw), so the minified script is also split into files that are each under 10,000 B.

## What the owner decided

1. Split `tier-pricing.js` into small JavaScript components loaded on demand, for example the flash sale and the siblings product list.
2. Minify all the code that is served in production, and keep a raw (readable) version for editing.
3. **The minified files are built only when the app is deployed.** They are not committed to git.

## Behaviour

- **Readable source** lives in `extensions/product-tier-pricing/src/`: the core (tier maths, view model, painting), the flash sale component, the siblings (Mix & match) component, and the stylesheet. The time-based discount script and stylesheet move there too, so everything served is built the same way. Edits happen only here.
- **A build step** (`scripts/build-extension.mjs`, run by both deploy scripts) writes the minified files into `extensions/product-tier-pricing/assets/`, which is the only folder Shopify uploads. Those built files are git-ignored. The build fails if any built JavaScript file is over 10,000 bytes.
- **The core** is the one script the block loads (`"javascript"` in the block's schema). It is under 10,000 bytes minified, and does everything a plain discount needs.
- **The flash sale component** loads only for a discount that has a flash sale. **The siblings component** loads only for a discount with siblings, when its list is first opened. Each is a separate minified file. The block's Liquid passes their addresses to the core (the script cannot know Shopify's CDN addresses), and preloads the flash component so the bar does not appear late.
- **What customers see does not change**: the same prices, bar, chips, rail and list, with the same wording. A page whose discount has no flash sale and no siblings loads one file.
- **The admin form and the tests** read the readable source directly (not the built files), so the preview keeps deciding what to show with the widget's own functions, and the parity test against the script keeps passing.
- **Deploying (two scripts, one per environment, so the build is never forgotten):** `npm run deploy:dev` builds the extension and then runs `shopify app deploy --config shopify.app.dev.toml` (the dev app, "demo"). `npm run deploy:prod` builds the extension and then runs `shopify app deploy --config shopify.app.toml` (the production app, "st-product-discounts"). These are the only two npm scripts for this: each builds first, every time, and the build fails if a built JavaScript file is over 10,000 bytes. The Shopify CLI still asks for its own confirmation (no `--force`). Dev and production are built the same way (both minified), so what is tried on dev is what production ships; they differ only in the app they deploy to. The owner runs every deploy; I never do.

## Non-goals

- No change to what the widget shows or to the metafield, the form or the saved data.
- No change to how the stylesheet is loaded (still the block's `stylesheet`); it is minified, not split.
- No committed build output, no CI step: the build runs on the owner's machine at deploy time.
- No new request to our own server.

## Anti-goals

- A deploy through the scripts that ships an old, missing or unminified file.
- The flash bar or the siblings list appearing late or flickering because their component loads after the page.
- Two copies of the same logic (the admin and the storefront must run the same functions).

## My calls (the owner can overrule)

- The source uses ES modules (named exports); esbuild builds the core as one classic script (IIFE) and each component as a self-contained ES module file loaded with `import()`. The core hands each component what it needs (the container, the view-model functions) when it calls it, so no component repeats shared code.
- `esbuild` is added as a development dependency (it is already present through the test tools; this names it).
- The flash component is preloaded from Liquid whenever the discount has a flash sale; the siblings component is loaded on the first open of the list, with the list showing nothing until it arrives.
- `lint:extensions` checks the readable source folder instead of `assets`.
- The file names of the built files stay `tier-pricing.js`, `tier-pricing.css`, `time-based-discount.js`, `time-based-discount.css`, plus `tier-pricing-flash.js` and `tier-pricing-siblings.js`.
- A deploy typed by hand (`shopify app deploy` without the script) skips the build; that is the one way to ship an old or missing widget, and the two scripts are how it is avoided. `shopify app dev` also needs the built files: `node scripts/build-extension.mjs` builds them (there is no separate npm script for it, as the owner asked for only two).
- There is no staleness check: each deploy script rebuilds, so a check is not needed.
- The cart-nudge document that mentions the asset path is updated to point at the new build.

## What is left to the builder

The exact module boundaries (which functions belong to the core, the flash and the siblings components), how `computeWidgetViewModel` gets the flash functions when only the flash component has them (the admin preview must still decide the flash bar with the same function), and the tests: each built file under 10,000 B; the core runs a plain discount on its own; the flash and siblings components load only when needed; the parity test and the existing storefront tests pass against the readable source.

## What was built

Built files (all minified, all under 10,000 bytes; sizes of the first build): `tier-pricing.js` (core, 8,121), `tier-pricing-model.js` (7,578), `tier-pricing-paint.js` (3,687), `tier-pricing-flash.js` (2,664), `tier-pricing-siblings.js` (3,779), `tier-pricing-time-sale.js` (2,253), `time-based-discount.js` (2,611); stylesheets `tier-pricing.css` (18,279) and `time-based-discount.css` (871).

- **Source**: `extensions/product-tier-pricing/src/`, the old scripts moved into modules (`tierMath`, `progress`, `copy`, `flash`, `viewModel`, `siblings`, `timeSale`, `paint`, `dom`, `config`, `core/*`, `timeBasedDiscount*`), plus the new `loader/` and one entry file per built script in `entries/`. `widgetFunctions.js` gathers the pure functions for the admin preview and the node tests.
- **Loading**: the block hands the core script the address of each component (`data-component-urls`, from `asset_url`) and preloads `model` and `paint` (and `flash` or `time-sale` when the product has one). The core always loads `model` and `paint`, loads `flash` for a flash sale and `time-sale` for a time-based discount, and loads `siblings` the first time the list is opened.
- **A part that cannot load**: the page keeps the plain price the block rendered and nothing throws. A failed load can be tried again on the next request (opening the list again).
- **Upload**: `extensions/product-tier-pricing/.shopifyignore` holds `src/**`. The Shopify CLI collects every file one level inside each folder of an extension (it ignores only what it lists and what `.shopifyignore` names), so without it the readable source would be uploaded next to the built files.
- **Tests** run the built files: a Vitest global setup builds them once per run into a temporary folder (esbuild cannot run inside the jsdom environment), and the storefront suites run them in page order. The node suites run the source.

## Differences from the first draft

1. **Components are classic scripts that register on `window.SparklyTierPricing`, not ES modules loaded with `import()`.** A module loaded from Shopify's CDN needs CORS headers on that CDN, and the storefront tests run the scripts with `eval`, which cannot `import()`. A classic script needs neither.
2. **A plain tier discount loads three scripts (core, `model`, `paint`), not one.** A plain discount is about 19 KB minified, so no single file under 10,000 bytes can hold it. The flash sale, the time-based sale and the siblings list stay on demand. The three are fetched in parallel (two are preloaded).
3. **`computeWidgetViewModel` takes the flash functions as `flashTools`**, which the flash component provides; the admin preview and the node tests get them through `widgetFunctions.js`.
4. **Legacy lint list**: the two legacy entries for the old scripts became the 16 moved source files that still carry the old code (moved, not rewritten). The loader, the entries and the build are new and follow the guidelines.
5. **Dev and production builds are the same**: `deploy:dev` and `deploy:prod` both build first and differ only in the app config they deploy to.
