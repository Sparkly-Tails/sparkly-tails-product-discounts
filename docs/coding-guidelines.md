# Code guidelines

The owner's eight rules for TypeScript and JavaScript (set 2026-10-19). They apply to every function that is written or changed. Existing code is refactored in small PRs; see `docs/superpowers/reviews/2026-10-19-code-guidelines-review.md` for the measurement and the order.

1. **Variable names** are nouns, descriptive, and never fewer than 3 letters (`itemCount`, not `n`, `i` or `id`; write `productId`).
2. **Components**: code lives in independent components or modules that each do one thing.
3. **Function names** are verbs that say what the function does (`buildCartChange`, `paintStatus`).
4. **No outside variables**: a function never reads globals or anything outside its own scope. Language built-ins (`Math`, `JSON`, array methods) and unchanging constants (a `const` holding a literal, or `UPPER_CASE`) are allowed. Everything else it touches (the DOM, `fetch`, the cart, the clock, the database, environment variables, other functions) comes in as a parameter.
5. **More than 2 parameters** are passed as one object.
6. **Simple parameters**: pass plain values (numbers, strings, booleans), or one flat object of plain values and functions. Reduce domain objects (a tier, a cart line, a product) to plain values before the call.
7. **Inject called functions**: when a function needs to call another function (not a built-in), that function is passed in as a parameter.
8. **At most 2 branches** per function (`if`, `else if`, ternary, `&&`/`||` used for control flow, `case`, loop condition). Split into smaller functions instead of adding a third.

## How they are enforced

`npm run lint` runs ESLint for `src/**` and `scripts/**` and, through `npm run lint:extensions`, for the storefront scripts in `extensions/product-tier-pricing/assets`. Tests are not checked.

| Rule | ESLint rule | Notes |
|---|---|---|
| 1 | `id-length` (min 3) | the "noun" part is not checked by a tool |
| 3 | `guidelines/verb-function-names` | the first word must be on the verb list in `eslint-rules/guidelines.mjs`; add a verb there if it is missing |
| 4 | `guidelines/no-outer-scope-reads` | globals, mutable module variables, variables of an enclosing function |
| 5 | `max-params` (2) | |
| 7 | `guidelines/no-outer-scope-calls` | calls to module functions, imports and global functions; React hooks (`useX`) are allowed |
| 8 | `complexity` (3, which is 2 decisions) | |
| 2, 6 | not checked by a tool | judged in review |

Framework entry points keep their framework shape and are exempt from rules 4 and 7, together with everything written inside them: React components (PascalCase), default exports (pages, layouts) and HTTP route handlers (`GET`, `POST`, ...). Keep their bodies thin and move logic into functions that follow the rules. Where a framework forces another shape (a server action, for example), use `// eslint-disable-next-line guidelines/no-outer-scope-calls -- <why>` on that line.

## Existing files

`eslint.guidelines-legacy.mjs` lists the files that still break the rules. They get **warnings**; every other file, including every new file, gets **errors**. The list only shrinks: when a file is refactored, delete it from the list in the same PR. Never add a file to it.

The rules are heuristics (the verb list, and what counts as "outside"). A wrong finding is fixed in `eslint-rules/guidelines.mjs` with a test in `tests/eslint/guidelines.test.mjs`, not with a disable comment.

Rust Functions and tests are out of scope.
