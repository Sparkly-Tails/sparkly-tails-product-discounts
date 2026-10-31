# The widget script: small readable modules, minified and split when built

Date: 2026-10-31. Status: draft, waiting for the owner's approval (all decisions made).

## Why

`extensions/product-tier-pricing/assets/tier-pricing.js` is one 59.7 KB file, shipped as written. Shopify's check for app block JavaScript (`AssetSizeAppBlockJavaScript`) flags any file over 10,000 bytes; it measures the raw file size and is a suggestion that Shopify does not enforce yet. The owner wants a lighter first load: the production code minified, the rest of it split into small components that load only when a page needs them (the flash sale, the siblings list), and a readable version kept for editing.

Measured on 2026-10-31 (esbuild, gzip): the script is 59,680 B raw, 26,241 B minified, 8,178 B minified and gzipped. The stylesheet is 24,071 B raw, 18,610 B minified, 3,497 B gzipped. Minifying alone is not enough for the check (26 KB raw), so the minified script is also split into files that are each under 10,000 B.

## What the owner decided

1. Split `tier-pricing.js` into small JavaScript components loaded on demand, for example the flash sale and the siblings product list.
2. Minify all the code that is served in production, and keep a raw (readable) version for editing.
3. **The minified files are built only when the app is deployed.** They are not committed to git.

## Behaviour

- **Readable source** lives in `extensions/product-tier-pricing/src/`: the core (tier maths, view model, painting), the flash sale component, the siblings (Mix & match) component, and the stylesheet. The time-based discount script and stylesheet move there too, so everything served is built the same way. Edits happen only here.
- **A build step** (`npm run build:extension`) writes the minified files into `extensions/product-tier-pricing/assets/`, which is the only folder Shopify uploads. Those built files are git-ignored. The build fails if any built JavaScript file is over 10,000 bytes.
- **The core** is the one script the block loads (`"javascript"` in the block's schema). It is under 10,000 bytes minified, and does everything a plain discount needs.
- **The flash sale component** loads only for a discount that has a flash sale. **The siblings component** loads only for a discount with siblings, when its list is first opened. Each is a separate minified file. The block's Liquid passes their addresses to the core (the script cannot know Shopify's CDN addresses), and preloads the flash component so the bar does not appear late.
- **What customers see does not change**: the same prices, bar, chips, rail and list, with the same wording. A page whose discount has no flash sale and no siblings loads one file.
- **The admin form and the tests** read the readable source directly (not the built files), so the preview keeps deciding what to show with the widget's own functions, and the parity test against the script keeps passing.
- **Deploying:** `npm run build:extension` must run before `shopify app deploy` and `shopify app dev`. A check (`npm run check:extension-built`) fails when the built files are missing or older than the source, so a deploy without a build is caught. The owner runs deploys; the exact command line is `npm run build:extension && npm run check:extension-built && shopify app deploy …`.

## Non-goals

- No change to what the widget shows or to the metafield, the form or the saved data.
- No change to how the stylesheet is loaded (still the block's `stylesheet`); it is minified, not split.
- No committed build output, no CI step: the build runs on the owner's machine at deploy time.
- No new request to our own server.

## Anti-goals

- A deploy that ships an old, missing or unminified file.
- The flash bar or the siblings list appearing late or flickering because their component loads after the page.
- Two copies of the same logic (the admin and the storefront must run the same functions).

## My calls (the owner can overrule)

- The source uses ES modules (named exports); esbuild builds the core as one classic script (IIFE) and each component as a self-contained ES module file loaded with `import()`. The core hands each component what it needs (the container, the view-model functions) when it calls it, so no component repeats shared code.
- `esbuild` is added as a development dependency (it is already present through the test tools; this names it).
- The flash component is preloaded from Liquid whenever the discount has a flash sale; the siblings component is loaded on the first open of the list, with the list showing nothing until it arrives.
- `lint:extensions` checks the readable source folder instead of `assets`.
- The file names of the built files stay `tier-pricing.js`, `tier-pricing.css`, `time-based-discount.js`, `time-based-discount.css`, plus `tier-pricing-flash.js` and `tier-pricing-siblings.js`.
- The cart-nudge document that mentions the asset path is updated to point at the new build.

## What is left to the builder

The exact module boundaries (which functions belong to the core, the flash and the siblings components), how `computeWidgetViewModel` gets the flash functions when only the flash component has them (the admin preview must still decide the flash bar with the same function), the staleness check's method (hashes or times), and the tests: each built file under 10,000 B; the core runs a plain discount on its own; the flash and siblings components load only when needed; the parity test and the existing storefront tests pass against the readable source.
