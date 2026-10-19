# Code guidelines review (2026-10-19)

Review of the TypeScript and JavaScript source against the owner's eight code guidelines (recorded in the owner's global Claude instructions). Measured on commit `2a8fd87` (the tree of PR #79: the widget redesign on top of the multi-store app). Scope: `src/**`, `extensions/**/assets/*.js`, `scripts/**`; tests excluded. 80 files, 614 functions in the TypeScript files.

## How it was measured

| Guideline | How checked | Reliability |
|---|---|---|
| 1 Variable names: 3+ letters, nouns | ESLint `id-length` (min 3, property names ignored) | exact for length; "noun" is not machine-checked |
| 2 Independent components that do one thing | by hand: file size and the responsibilities mixed in one file | judgement |
| 3 Function names are verbs | custom rule `verb-function-names` (first word must be on a list of about 330 verbs) | heuristic: a few false positives such as `proxy` or `messages`; names like `perUnitPrice` are real findings |
| 4 No outside variables | custom rule `no-outer-scope-reads`: globals (`document`, `window`, `process`, `crypto`, `Response`, `Date`), mutable module variables and enclosing-function variables. Allowed: built-ins (`Math`, `JSON`, ...) and constants (literal or UPPER_CASE `const`). Callbacks that read their enclosing function's variables are counted separately | heuristic; the "practical reading" the owner chose |
| 5 More than 2 parameters go in one object | ESLint `max-params` (2) | exact |
| 6 Simple parameters only | TypeScript syntax pass: a parameter is complex if its annotation is a named type, an array of objects or an object type with nested members | approximate: a named type can still be a flat object |
| 7 Called functions are passed in | custom rule `no-outer-scope-calls`: a call to a function declared outside the calling function (module function, import, global). React hooks (`useX`) are exempt | heuristic; includes React state setters called from event handlers |
| 8 At most 2 branches | ESLint `complexity` (max 3, which equals 2 decisions) | exact for what ESLint counts (`if`, ternary, loops, `case`, `catch`, `&&`, `||`, `??`) |

## Result

| Guideline | Findings |
|---|---|
| 1 names under 3 letters | 176 |
| 3 function names that are not verbs | 84 |
| 4 reads of outside variables (includes 344 in callbacks) | 611 |
| 5 functions with more than 2 parameters | 63 |
| 7 calls to outside functions | 882 |
| 8 functions with more than 2 branches | 127 |
| 6 functions with a complex parameter (TypeScript files) | 143 of 614 functions |

Only 4 of 80 files have no finding on rules 1, 3, 4, 5, 7 and 8; 76 files have findings.

## Files with the most findings

| File | Lines | Names | Verbs | Reads | Params | Calls | Branches | Complex params |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `extensions/product-tier-pricing/assets/tier-pricing.js` | 1205 | 30 | 10 | 150 | 19 | 133 | 33 | n/a |
| `src/timeDiscounts/actions.ts` | 320 | 1 | 2 | 26 | 1 | 79 | 5 | 6 |
| `src/components/MemberPicker.tsx` | 227 | 10 | 0 | 40 | 1 | 47 | 3 | 4 |
| `src/timeDiscounts/components/AddItemPicker.tsx` | 184 | 1 | 0 | 24 | 1 | 45 | 3 | 2 |
| `src/timeDiscounts/components/TimeDiscountEditor.tsx` | 172 | 3 | 0 | 25 | 0 | 43 | 1 | 6 |
| `src/actions/discountActions.ts` | 205 | 11 | 0 | 4 | 1 | 44 | 7 | 9 |
| `src/timeDiscounts/components/GroupDiscountEditor.tsx` | 162 | 3 | 1 | 29 | 0 | 25 | 2 | 2 |
| `src/timeDiscounts/group.ts` | 234 | 6 | 13 | 7 | 2 | 17 | 9 | 17 |
| `extensions/product-tier-pricing/assets/time-based-discount.js` | 208 | 2 | 5 | 18 | 2 | 18 | 5 | n/a |
| `src/timeDiscounts/components/NewTimeDiscountForm.tsx` | 140 | 2 | 0 | 16 | 0 | 30 | 1 | 5 |
| `src/timeDiscounts/components/useTitleSchedule.ts` | 84 | 0 | 0 | 31 | 0 | 17 | 1 | 1 |
| `src/lib/product-tiers.ts` | 209 | 21 | 2 | 9 | 1 | 12 | 1 | 7 |
| `src/timeDiscounts/components/CollectionPicker.tsx` | 101 | 1 | 0 | 16 | 0 | 24 | 1 | 3 |
| `src/timeDiscounts/groupServer.ts` | 116 | 7 | 2 | 1 | 2 | 24 | 2 | 5 |
| `src/components/TierFields.tsx` | 121 | 7 | 0 | 15 | 2 | 11 | 1 | 1 |
| `src/timeDiscounts/saveRequests.ts` | 43 | 0 | 1 | 22 | 6 | 6 | 0 | 6 |
| `src/lib/tierDiscount.ts` | 177 | 3 | 2 | 2 | 1 | 20 | 3 | 1 |
| `src/components/FixedPriceTierFields.tsx` | 98 | 6 | 0 | 13 | 1 | 10 | 0 | 1 |
| `src/timeDiscounts/pickerActions.ts` | 72 | 4 | 0 | 12 | 1 | 11 | 0 | 0 |
| `src/timeDiscounts/groupActions.ts` | 78 | 0 | 1 | 2 | 1 | 22 | 1 | 0 |
| `src/timeDiscounts/rows.ts` | 116 | 0 | 6 | 5 | 4 | 8 | 4 | 8 |
| `src/actions/memberPickerActions.ts` | 76 | 4 | 0 | 9 | 1 | 10 | 0 | 0 |
| `src/lib/webhookHandler.ts` | 99 | 0 | 3 | 8 | 1 | 8 | 4 | 1 |
| `src/timeDiscounts/components/useGroupPreview.ts` | 61 | 0 | 0 | 15 | 1 | 7 | 1 | 1 |
| `src/timeDiscounts/components/GroupPicks.tsx` | 64 | 0 | 0 | 8 | 0 | 14 | 1 | 2 |

The full per-file list is reproducible with the ESLint rules of the infrastructure PR (see the refactor series below).

## Findings by guideline

### 1 Names under 3 letters (176)
Mostly parameters and loop or callback variables (`a`, `b`, `t`, `s`, `m`, `el`, `fn`, `id`). Fix by renaming to nouns (`tierA`, `tier`, `message`). Two-letter names that are common vocabulary (`id`, `db`) are included on purpose: the rule says never under 3 letters.

### 3 Function names that are not verbs (84)
Names that describe a result rather than an action: `perUnitPrice`, `unitPriceAtTier`, `cartBaselineOtherQty`, `tierTimeDiscountItems`, `timeDiscountSalePrice`, `shopFromBody`, `itemKey`, `shopifyQuery`, `apiUrl`, `chunk`, `exists`. Fix by starting with a verb: `computeUnitPrice`, `findShopInBody`, `buildItemKey`, `runShopifyQuery`, `buildApiUrl`, `splitIntoChunks`, `checkExists`.

### 4 Reads from outside the function (267, plus 344 in callbacks)
The largest groups are `document` (30), `window` (12), `process.env` (11), `crypto` (8), `Response` (7) and variables of an enclosing function (row, elements, config, refs). The 344 callback cases are inline arrow functions passed to `map`, `filter`, `find` and event handlers that read a variable of the function around them; they are the most numerous and the cheapest to leave for last. The widget script reads `document` and `window` in most of its DOM functions.

### 5 More than 2 parameters (63)
Examples: `clamp(value, min, max)`, `computeProgressState`, the pricing strategies `(basePrice, quantity, state)`, `buildMixMatchRows(products, cartItems, pricing)`. Fix: one object parameter.

### 7 Calls to outside functions (882)
The biggest group: functions that call a module helper or an import directly (`itemKey` 37, `shopifyQuery` 32, `getConfig` 14, `findDiscountOrThrow` 11, `extractNumericId` 9, `getRequestShop` 8, `redirect` 8) and React state setters called from handlers (`setRows` 16, `setError` 13, `setOpen` 12). Making all of these parameters is the largest change in the series; the lowest-risk start is the pure logic modules, where the helpers are other pure functions.

### 8 More than 2 branches (127)
Concentrated in the widget script (33), `group.ts` (9), `discountActions.ts` (7) and the time-discount rows. Fix by splitting into smaller functions, a table of cases or a lookup object instead of chained `if`s.

### 2 Components that do one thing (by hand)
- `extensions/product-tier-pricing/assets/tier-pricing.js` (1205 lines) mixes price maths, tier state, progress bar, copy, view-model assembly, mix & match rows, cart requests, DOM painting and event wiring in one global scope. It shares that scope with `time-based-discount.js` (a test fails if a top-level name is declared in both). Splitting it into several assets needs the block to load several scripts; whether that is possible through the app block `javascript` setting is not verified (a block can also add `script` tags from Liquid).
- `src/timeDiscounts/actions.ts` (320 lines), `group.ts` (234), `src/components/MemberPicker.tsx` (227), `src/lib/products.ts` (213) and `src/lib/product-tiers.ts` (209) each mix request handling, Shopify calls and data shaping; they split along existing seams (query building, mapping, persistence).
- React page and component files keep the component signature and move their logic into small modules.

### 6 Complex parameters (143 of 614 functions)
Examples: functions taking lists of tiers, cart items, a discount or a product search result. The pure-maths modules (tiers, rows, groups) are the main users. Fix by passing the plain values a function needs (quantities, prices, minimum quantities) and building them at the boundary.

## Proposed refactor series (small PRs; the tests protect each step)

1. **Infrastructure:** the three custom rules plus `id-length`, `max-params` and `complexity` in `eslint.config.mjs`, as errors for new files and warnings for a legacy list of the files above (the list shrinks as files are refactored), and a `docs/coding-guidelines.md` with the eight rules. It needs the milestone merged into `dev` first so the version bumps do not collide.
2. **Pure TypeScript logic** with many tests and no I/O: the maths and mapping in `src/lib`, `src/timeDiscounts/rows.ts` and `group.ts`.
3. **Server modules that call Shopify:** pass the query function in (`shopifyQuery`, `getConfig`, `getRequestShop`), starting with `src/lib` and the webhook handler.
4. **Server actions and pages**, then React components (`MemberPicker`, `TierFields`, ...), moving logic out of the component bodies.
5. **The storefront widget script last:** it is live on the dev store and the biggest file; one responsibility per PR (maths, copy, view-model, DOM painting, cart), each checked in `theme dev` + `app dev`.

Each PR renames or splits without changing behaviour; the existing tests (761, including the jsdom tests of the widget) are the safety net.

## Not verified

- The verb list and the heuristics have false positives and negatives. Every finding above was produced by the rules, not read one by one; I spot-checked the first examples of each rule.
- Guidelines 2 and 6 are judged by file size and type annotations only.
- Rust Functions and tests are out of scope (the owner chose TypeScript and JavaScript).

