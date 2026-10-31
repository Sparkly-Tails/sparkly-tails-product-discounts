# Widget script split and minify: implementation plan

**Goal:** serve the storefront widget as small minified files (each under 10,000 bytes), built at deploy time from readable source modules, with the flash sale, the siblings list and the time-based sale loaded only when a page needs them.

**Architecture:** readable ES modules in `extensions/product-tier-pricing/src/` (code moved as it is, not rewritten). `scripts/extensionBuild.mjs` (esbuild) bundles each entry into one classic script in the git-ignored `assets/` folder. The core script (`tier-pricing.js`) finds the widget on the page and loads the components it needs by adding a `<script src>`; each component registers its functions on one shared object, `window.SparklyTierPricing`. `npm run deploy:dev` and `npm run deploy:prod` build, then deploy.

**Tech stack:** esbuild, vitest + jsdom, Shopify theme app extension (Liquid), the existing `node --test` suites of `extensions/product-tier-pricing-tests/`.

**Spec:** `docs/superpowers/specs/2026-10-31-widget-script-split-and-minify-design.md` (approved by the owner on 2026-10-31).

## Global constraints

- Each built JavaScript file is at most 10,000 bytes; the build fails otherwise.
- What customers see does not change: same prices, bar, chips, rail, list and wording.
- Built files are never committed; the build runs only at deploy (and on demand for `shopify app dev`).
- Exactly two npm scripts for deploying: `deploy:dev` (`--config shopify.app.dev.toml`) and `deploy:prod` (`--config shopify.app.toml`); each builds first; no `--force`.
- The admin preview and every test run the readable source, never the built files, except the tests that check the built files themselves.
- New code follows the owner's code guidelines (lint errors). Code moved from `tier-pricing.js` and `time-based-discount.js` keeps its legacy warnings; it is moved, not rewritten.
- I never deploy.

## Rulings (differences from the design, for the owner to overrule)

1. **Components are classic scripts that register on `window.SparklyTierPricing`, not ES modules loaded with `import()`.** A module loaded from Shopify's CDN needs that CDN to send CORS headers, and the storefront tests run the scripts with `eval`, which cannot `import()`. A classic script needs neither. Cost: a few lines of registry in each file.
2. **A plain tier discount loads the core plus two always-needed components (`model`, `paint`), not one file.** Measured: a plain discount is about 19 KB minified, so no single file under 10,000 bytes can hold it. Flash sale, siblings and time-based sale stay on demand.
3. **Legacy lint list:** the two legacy entries (`assets/tier-pricing.js`, `assets/time-based-discount.js`) are replaced by the moved source files that still carry the old code. Nothing new is added for new code.

## File structure

| File | Responsibility |
|---|---|
| `src/tierMath.js` | shared helpers, tier maths, cart maths (moved) |
| `src/progress.js` | progress state, dot, semantics, offer state (moved) |
| `src/copy.js` | promo line, status copy, chips, tag (moved) |
| `src/flash.js` | flash sale: phase, countdown, bar (moved) + `paintFlashBar` (moved) |
| `src/viewModel.js` | `computeWidgetViewModel` (moved; flash functions arrive as `flashTools`) |
| `src/siblings.js` | siblings rows and list painting (moved) |
| `src/timeSale.js` | the time-based sale price in the tier price row (moved) |
| `src/paint.js` | card painters (moved) |
| `src/dom.js` | `setText`, `setQuantityInput` (moved) |
| `src/config.js` | `parseWidgetConfig`, `parseFlashConfig`, `listedMixMatchItems`, element query (moved) |
| `src/core/*.js` | cart, renderer, wiring, init (moved; renderer changed to wait for components) |
| `src/loader/registry.js` | new: `registerComponent`, `findComponent`, `loadComponent` |
| `src/entries/*.js` | one tiny entry per built file |
| `src/widgetFunctions.js` | one object of the widget's pure functions, for the admin and the node tests |
| `src/tier-pricing.css`, `src/time-based-discount.css`, `src/timeBasedDiscount.js` | moved from `assets/` |
| `scripts/extensionBuild.mjs` (+ `.d.mts`), `scripts/build-extension.mjs` | the build and its command-line entry |

## Tasks

### Task 1: the builder

**Files:** create `scripts/extensionBuild.mjs`, `scripts/extensionBuild.d.mts`, `scripts/build-extension.mjs`, `tests/scripts/extensionBuild.test.ts`; modify `package.json`, `.gitignore`.

- `buildExtension({ projectRoot, entries, stylesheets, maxScriptBytes, tools })` returns `{ files: [{ name, bytes }] }`; throws `Error` naming the file when a script is over `maxScriptBytes`.
- Test (red first): builds two fixture scripts and a stylesheet into a temp folder: output is minified (no comments, shorter than source), is an IIFE, the oversize one throws naming the file and its size, stale `*.js`/`*.css` in the output folder are removed.
- `package.json`: `esbuild` devDependency; scripts `deploy:dev` = `node scripts/build-extension.mjs && shopify app deploy --config shopify.app.dev.toml`, `deploy:prod` = `node scripts/build-extension.mjs && shopify app deploy --config shopify.app.toml`.
- `.gitignore`: `extensions/product-tier-pricing/assets/*`.

### Task 2: the readable source (pure move)

**Files:** create the `src/*.js` modules above from `assets/tier-pricing.js` and `assets/time-based-discount.js` (copy by line range, add `export`/`import`); modify `eslint.guidelines-legacy.mjs`, `eslint.extensions.config.mjs`, `tests`/admin imports.

- `src/widgetFunctions.js` exports every name `module.exports` had, with `computeWidgetViewModel` already given the flash functions.
- Node suites (`extensions/product-tier-pricing-tests`) require `src/widgetFunctions.js` (and `src/timeBasedDiscount.js`), unchanged assertions; they pass.
- Admin: `src/form/preview/widgetFunctions.ts` imports the source; `globals.css` imports `src/tier-pricing.css`; the module declaration follows.

### Task 3: components, loader, entries, Liquid

**Files:** create `src/loader/registry.js`, `src/entries/*.js`, `tests/storefront/componentLoader.test.ts`, `tests/scripts/builtWidget.test.ts`; modify `src/core/renderer.js`, `src/viewModel.js`, `blocks/tier-pricing.liquid`, `tests/storefront/*`, `tests/form/preview/*`, `extensions/product-tier-pricing-tests/*`.

- `registerComponent({ root, name, api })`, `findComponent({ root, name })`, `loadComponent({ root, document, name, url })` (promise; adds one `<script src>` per name, resolves when the component registers, rejects on error).
- Built files: `tier-pricing.js` (core), `tier-pricing-model.js`, `tier-pricing-paint.js`, `tier-pricing-flash.js`, `tier-pricing-siblings.js`, `tier-pricing-time-sale.js`, `time-based-discount.js`, and the two stylesheets.
- The block passes `data-component-urls` (JSON of names to `asset_url`s) and preloads `model`, `paint` and, with a flash sale, `flash`.
- The core loads `model` and `paint` always, `flash` when the discount has a flash sale, `time-sale` when it carries a time discount, `siblings` on the first open of the list. A component that cannot load leaves the server-rendered plain price on screen.
- Tests: loader (registers, resolves a waiting load, one script tag per component, rejects on error); the storefront suites run the real built scripts (components first, then the core) and keep passing; a built-file test checks every built script is at most 10,000 bytes, the core alone paints nothing without components, siblings are not requested until the list is opened, flash is not requested without a flash sale.

### Task 4: switch everything to the source, docs, version

- Tests that read `assets/tier-pricing.css` read `src/`; `docs/cart-tier-nudge-snippet.md` points at `src/tierMath.js`; `lint:extensions` lints `src/`; `package.json` version bumped per commit.
- Full run: vitest, the `node --test` suites, lint, `next build`, `shopify theme check`.

## Review focus

- A component fails to load (offline, blocked): the plain server-rendered price stays and the page does not throw. Test in Task 3.
- Two widgets on one page (two blocks): each component script is added once. Test in Task 3.
- The cart changes while the siblings list is closed: opening the list shows current counts. Test in Task 3.
- A product with only a time-based sale and no tier discount still shows the sale price. Existing `time-discount-scripts` suite, run against the built files.
- A flash sale ending while the page is open hides the bar without a reload. Existing `flash-sale-widget` suite, run against the built files.
