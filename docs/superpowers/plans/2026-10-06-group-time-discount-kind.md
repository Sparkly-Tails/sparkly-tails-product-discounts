# Group Time-Based Discounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second kind of time-based discount, **Group** (one shared price or percentage for a set of products, variants or collections), next to the existing **Per product** kind, each with its own form and page.

**Architecture:** A group stores its shared rule and its picks, and every save expands them into the existing per-product rows (`items`), so the checkout Function, the storefront metafields and both storefront scripts are untouched. The server resolves picks (collections included), checks prices, availability and size in one function (`resolveGroup`), which backs a read-only `previewGroup` action for the create form and the save actions for existing groups. The new-discount page gains a kind chooser; the discount page branches on `kind`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind v4, server actions, vitest + Testing Library (jsdom), Shopify Admin GraphQL via `shopifyQuery`.

**Spec:** `docs/superpowers/specs/2026-10-06-group-time-discount-kind-design.md` (read it first; this plan makes two small amendments to it, already applied there: group members store their title, and only the create form uses `previewGroup`).

**Scope of this plan:** the **Group PR** (admin only, no extension changes, no Shopify app deploy). The extension cleanup is a separate PR with its own plan: `docs/superpowers/plans/2026-10-06-time-discount-extension-cleanup.md`.

## Global Constraints

- **Branches and PRs.** Work on a feature branch cut from `origin/main`; never commit to `main`. **Before every `git push` to an existing branch, run `gh pr view <branch> --json state`; if the PR is MERGED, cut a new branch from `origin/main` and open a new PR instead.** `gh pr edit` fails in this repo: change a PR with `gh api -X PATCH repos/Sparkly-Tails/sparkly-tails-product-discounts/pulls/<N> -f base=main`. Merging and deploying are the user's.
- **Environment.** Every shell command below assumes `source ~/.nvm/nvm.sh && nvm use 22.23.3` has been run in that shell (the default Node 18 cannot run vitest). In a git worktree whose `node_modules` is missing, symlink it: `ln -s /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/node_modules node_modules`. Use `npx next build --webpack` (not plain `next build`) in a worktree.
- **Version.** Every commit that changes code bumps the version in `package.json` (line 3) **and** the two top `"version"` fields of `package-lock.json` (lines 3 and 9) to the same value. This plan sets the value in each task: Task 1 → `0.21.0`, Task N → `0.21.(N-1)`. If `main` has moved past `0.20.3` when you start, use the next minor above it for Task 1 and the next patch above it for each later task. Docs-only commits do not bump.
- **Commits.** End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`). Commit once per task unless a task says otherwise.
- **Pure functions.** New logic goes in module-level pure functions that take everything they need as arguments and return a result (as in `src/timeDiscounts/rows.ts`, `picker.ts`, `items.ts`). Components keep only `setState`, refs and calls, reading state at the call site and passing it in. Hooks that hold state by nature are fine.
- **Tests first.** For every task: write the failing test, run it and see it fail for the right reason, then write the code, then see it pass. Do not weaken or delete an existing test unless the task says so.
- **Limits and messages, verbatim** (the UI and tests must use these exact strings):
  - Function config size guard: `FUNCTION_CONFIG_MAX_BYTES = 9500` (about 63 variant rows or 107 whole-product rows).
  - Collection resolution stops after `GROUP_RESOLVE_LIMIT + 1` products, `GROUP_RESOLVE_LIMIT = 200`.
  - Size message: `This selection covers {n} products. One discount fits about 63 variants or 107 whole products. Pick fewer, or split it into two discounts.` (`{n}` is `more than 200` when resolution stopped early).
  - Empty selection: `This selection covers no products.`
  - Failure summary: `{product title}: {message}` and, when others fail too, ` (and {k} more product(s) with a problem)`.
  - End time: `The end time has already passed. Choose a later end time.` (`END_PASSED_MESSAGE`), checked at render and again in `onSubmit` with `endTimeHasPassed`.
  - Unreachable server: `Couldn't reach the server — reload the page and try again` (`UNREACHABLE`).
  - Labels: `Group` and `Per product`; button `Save discount`; remove confirmation `Remove {title} from this discount?`.
- **Shopify limits** (already enforced by existing code): at most 25 active automatic app discounts per store; a Function metafield over 10,000 bytes is dropped silently.

## Review Focus

Inputs and conditions the spec implies that a person using this software is most likely to hit. Each has a test in the task named.

1. **A collection with thousands of products** must be refused quickly with the size message, not paged to the end (Task 1 stops early; Task 5 refuses).
2. **A fixed price that is fine for one variant but not for the cheapest variant** of a multi-variant product in a collection must be refused, naming the product (Task 1 lookup, Task 5 check).
3. **A product dropped from a group** must lose its storefront sale price (Task 7 clears its metafield).
4. **Preview answers arriving out of order** (type, pause, type again) must never leave the form showing the older answer (Task 10).
5. **Re-saving a group** must not treat its own rows as conflicts with itself (Task 5 `excludeDiscountId`, Task 7).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/collections.ts` (create, restored from git history) | Collection search and resolving a collection to product ids | 1 |
| `src/lib/products.ts` (modify) | `getLowestVariantPrices` | 1 |
| `src/timeDiscounts/pickerActions.ts` (modify) | `searchTimeDiscountCollectionsAction` | 1 |
| `src/timeDiscounts/config.ts` (modify) | `kind`, `group`, `GroupSpec` types; drop legacy normalisation | 2 |
| `src/timeDiscounts/shopifyRecord.ts` (create) | Server-only helpers moved out of `actions.ts` (Shopify record calls, schedule parsing, `errorMessage`) | 3 |
| `src/timeDiscounts/group.ts` (create) | All pure group logic: expansion, cleaning, selection edits, blockers, messages | 4 |
| `src/timeDiscounts/groupServer.ts` (create) | `resolveGroup`, covered rows loader, storefront sync for groups (server only, not `'use server'`) | 5, 7 |
| `src/timeDiscounts/groupActions.ts` (create, `'use server'`) | `previewGroup`, `saveGroupRule`, `saveGroupSelection` | 5, 7 |
| `src/timeDiscounts/actions.ts` (modify) | `createTimeDiscount` gains the group path; per-product actions refuse a group | 6, 7 |
| `src/timeDiscounts/saveRequests.ts` (modify) | Queued group save requests | 11 |
| `src/timeDiscounts/newDiscountSubmit.ts` (create) | The create submit wrapper shared by both create forms | 8 |
| `src/timeDiscounts/components/TitleScheduleFields.tsx` (create) | Title and schedule inputs shared by both create forms | 8 |
| `src/timeDiscounts/components/CoveredTable.tsx` (create) | Read-only table of covered products | 9 |
| `src/timeDiscounts/components/CollectionPicker.tsx` (create) | Controlled collection search + chips | 9 |
| `src/timeDiscounts/components/GroupRuleFields.tsx` (create) | Shared price type + amount inputs | 9 |
| `src/timeDiscounts/components/GroupPicks.tsx` (create) | Mode switch, product chips and pickers | 9 |
| `src/timeDiscounts/components/useGroupPreview.ts` (create) | Debounced, stale-safe preview hook | 10 |
| `src/timeDiscounts/components/NewGroupForm.tsx` (create) | Group create form | 10 |
| `src/timeDiscounts/components/GroupDiscountEditor.tsx` (create) | Group page with autosave | 11 |
| `src/timeDiscounts/components/NewDiscountForm.tsx` (create) | Kind chooser wrapping both create forms | 12 |
| `src/timeDiscounts/components/NewTimeDiscountForm.tsx` (modify) | Uses the shared fields/submit; no longer renders `<main>`/`<h1>` | 8, 12 |
| `src/app/time-discounts/new/page.tsx`, `src/app/time-discounts/[discountId]/page.tsx`, `src/app/page.tsx` (modify) | Kind chooser, page branching, list label | 12 |

---

### Task 1: Data access — collections, lowest variant prices, collection search action

**Files:**
- Create: `src/lib/collections.ts`, `tests/lib/collections.test.ts`
- Modify: `src/lib/products.ts`, `tests/lib/products.test.ts`, `src/timeDiscounts/pickerActions.ts`, `tests/timeDiscounts/pickerActions.test.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `searchCollections(query: string): Promise<CollectionSearchResult[]>`, `CollectionSearchResult = { id: string; title: string }`
  - `resolveCollectionMembers(collectionIds: string[], maxProducts?: number): Promise<{ productId: string }[]>` — whole-product members, deduped across collections, paginated; **returns as soon as `maxProducts` products are collected** (default unlimited).
  - `getLowestVariantPrices(productIds: string[]): Promise<LowestPrice[]>`, `LowestPrice = { productId: string; title: string; price: number }` — one entry per product that resolves and has variants; `price` is the lowest variant price.
  - `searchTimeDiscountCollectionsAction(query: string): Promise<CollectionSearchResult[]>` (`[]` on failure, error logged).

- [ ] **Step 1: Branch and bump**

```bash
cd /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts
git fetch origin && git worktree add .claude/worktrees/group-kind -b feat/group-time-discount-kind origin/main
cd .claude/worktrees/group-kind && ln -s /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/node_modules node_modules
```

Set the version to `0.21.0` in `package.json` and the two top fields of `package-lock.json`. Check: `grep -n '"version"' package.json | head -1` and `sed -n 1,10p package-lock.json | grep version` both show `0.21.0`.

- [ ] **Step 2: Restore the collections lib and its test, then add the early-stop test**

Restore both files from the commit before they were deleted:

```bash
git show 37d32dd^:src/lib/collections.ts > src/lib/collections.ts
git show 37d32dd^:tests/lib/collections.test.ts > tests/lib/collections.test.ts
```

Append this test to the `resolveCollectionMembers` describe in `tests/lib/collections.test.ts` (before its closing `})`):

```ts
  it('stops paging as soon as it has collected the most products it was asked for', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({
      collection: {
        products: {
          edges: [1, 2, 3].map((n) => ({ node: { id: `gid://shopify/Product/${n}` } })),
          pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
        },
      },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1', 'gid://shopify/Collection/2'], 2)
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
    expect(spy).toHaveBeenCalledTimes(1) // neither the next page nor the second collection was fetched
  })
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/lib/collections.test.ts`
Expected: the new test FAILS (`resolveCollectionMembers` returns 3 products and, with `hasNextPage` true, asks for a second page).

- [ ] **Step 4: Add the early stop**

In `src/lib/collections.ts` change the signature and add the check inside the edge loop:

```ts
export async function resolveCollectionMembers(collectionIds: string[], maxProducts = Infinity): Promise<{ productId: string }[]> {
```

and replace the inner `for (const edge of ...)` loop with:

```ts
      for (const edge of data.collection.products.edges) {
        if (!seen.has(edge.node.id)) {
          seen.add(edge.node.id)
          results.push({ productId: edge.node.id })
          if (results.length >= maxProducts) return results
        }
      }
```

Also extend the doc comment above the function with: `maxProducts stops the enumeration as soon as that many products are collected, so a huge collection that will be refused anyway is not paged to the end.`

- [ ] **Step 5: Run the collections tests**

Run: `npx vitest run tests/lib/collections.test.ts`
Expected: all PASS.

- [ ] **Step 6: Write the failing test for `getLowestVariantPrices`**

Append to `tests/lib/products.test.ts` (reuse its existing imports; add `getLowestVariantPrices` to the import from `@/lib/products` and `import * as shopifyClient from '@/lib/shopify-client'` if the file does not already import it):

```ts
describe('getLowestVariantPrices', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns each product\'s lowest variant price with its title', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        { id: 'gid://shopify/Product/1', title: 'Cat Bed', variants: { edges: [{ node: { price: '30.00' } }, { node: { price: '24.50' } }, { node: { price: '40.00' } }] } },
        { id: 'gid://shopify/Product/2', title: 'Toy', variants: { edges: [{ node: { price: '5.00' } }] } },
      ],
    })
    expect(await getLowestVariantPrices(['gid://shopify/Product/1', 'gid://shopify/Product/2'])).toEqual([
      { productId: 'gid://shopify/Product/1', title: 'Cat Bed', price: 24.5 },
      { productId: 'gid://shopify/Product/2', title: 'Toy', price: 5 },
    ])
  })

  it('skips a product that no longer resolves or has no variants, and makes no call for an empty list', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [null, { id: 'gid://shopify/Product/3', title: 'Empty', variants: { edges: [] } }],
    })
    expect(await getLowestVariantPrices(['gid://shopify/Product/9', 'gid://shopify/Product/3'])).toEqual([])
    spy.mockClear()
    expect(await getLowestVariantPrices([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('asks for each product once, in chunks of at most 250', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ nodes: [] })
    const ids = Array.from({ length: 300 }, (_, i) => `gid://shopify/Product/${i}`)
    await getLowestVariantPrices([...ids, ids[0]])
    expect(spy).toHaveBeenCalledTimes(2)
    expect((spy.mock.calls[0][1] as { ids: string[] }).ids).toHaveLength(250)
    expect((spy.mock.calls[1][1] as { ids: string[] }).ids).toHaveLength(50)
  })
})
```

- [ ] **Step 7: Run it to see it fail**

Run: `npx vitest run tests/lib/products.test.ts`
Expected: FAIL — `getLowestVariantPrices is not a function`.

- [ ] **Step 8: Implement `getLowestVariantPrices`**

Add to `src/lib/products.ts`, after `getMemberInfo`:

```ts
export interface LowestPrice {
  productId: string
  title: string
  price: number
}

/**
 * Each product's title and its LOWEST variant price, in one batched lookup
 * (chunks of 250, Shopify's list-argument cap). A whole-product discount row
 * applies to every variant, so a fixed price has to be judged against the
 * cheapest one; `getMemberInfo` cannot do that, it returns the first variant's
 * price. A product that no longer resolves, or has no variants, is left out.
 */
export async function getLowestVariantPrices(productIds: string[]): Promise<LowestPrice[]> {
  const unique = [...new Set(productIds)]
  if (unique.length === 0) return []

  const responses = await Promise.all(
    chunk(unique, NODES_QUERY_CHUNK_SIZE).map((ids) =>
      shopifyQuery<{
        nodes: ({ id: string; title: string; variants: { edges: { node: { price: string } }[] } } | null)[]
      }>(
        `query getLowestVariantPrices($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              variants(first: 250) { edges { node { price } } }
            }
          }
        }`,
        { ids },
      ),
    ),
  )

  return responses
    .flatMap((response) => response.nodes)
    .flatMap((node) =>
      node && node.variants.edges.length > 0
        ? [{ productId: node.id, title: node.title, price: Math.min(...node.variants.edges.map((e) => parseFloat(e.node.price))) }]
        : [],
    )
}
```

- [ ] **Step 9: Write the failing test for the collection search action**

Append to `tests/timeDiscounts/pickerActions.test.ts` (match its existing import and mocking style; it already spies on `@/lib/products`; add):

```ts
import * as collectionsLib from '@/lib/collections'
import { searchTimeDiscountCollectionsAction } from '@/timeDiscounts/pickerActions'

describe('searchTimeDiscountCollectionsAction', () => {
  it('returns the matching collections', async () => {
    vi.spyOn(collectionsLib, 'searchCollections').mockResolvedValue([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
    expect(await searchTimeDiscountCollectionsAction('sum')).toEqual([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
  })

  it('returns an empty list, and logs, when the lookup fails', async () => {
    vi.spyOn(collectionsLib, 'searchCollections').mockRejectedValue(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await searchTimeDiscountCollectionsAction('sum')).toEqual([])
  })
})
```

If the file already imports `searchTimeDiscountProductsAction` etc. from `@/timeDiscounts/pickerActions`, add the new name to that import instead of a second import line.

- [ ] **Step 10: Run it to see it fail, then implement**

Run: `npx vitest run tests/timeDiscounts/pickerActions.test.ts` → FAIL (`searchTimeDiscountCollectionsAction is not a function`).

In `src/timeDiscounts/pickerActions.ts` add the import `import { searchCollections, type CollectionSearchResult } from '@/lib/collections'` and append:

```ts
/** Backs the collection picker's search box. */
export async function searchTimeDiscountCollectionsAction(query: string): Promise<CollectionSearchResult[]> {
  try {
    return await searchCollections(query)
  } catch (err) {
    console.error('[searchTimeDiscountCollectionsAction] search failed:', err)
    return []
  }
}
```

- [ ] **Step 11: Run all checks**

Run: `npx tsc --noEmit -p . && npx eslint src/lib src/timeDiscounts tests/lib tests/timeDiscounts && npx vitest run`
Expected: no tsc/eslint output; all tests PASS.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/lib/collections.ts src/lib/products.ts src/timeDiscounts/pickerActions.ts tests/lib/collections.test.ts tests/lib/products.test.ts tests/timeDiscounts/pickerActions.test.ts
git commit -m "feat: collection lookups and lowest variant prices for group discounts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Types and config — `kind`, `group`, and drop the legacy reading

**Files:**
- Modify: `src/timeDiscounts/config.ts`, `src/timeDiscounts/actions.ts`, `tests/timeDiscounts/config.test.ts`, `tests/timeDiscounts/actions.test.ts`, every test fixture that builds a `TimeDiscount` (found by `tsc`), `package.json`, `package-lock.json`

**Interfaces:**
- Produces (in `config.ts`):
  - `GroupMember = DiscountMember & { title: string }`, `GroupCollection = { id: string; title: string }`
  - `GroupSelection = { mode: 'products'; members: GroupMember[] } | { mode: 'collections'; collections: GroupCollection[] }`
  - `GroupSpec = { pricingMode: 'percent' | 'fixed'; amount: number; selection: GroupSelection }`
  - `TimeDiscount` gains `kind: 'perProduct' | 'group'` (required) and `group?: GroupSpec`
  - `withDefaultKind(stored: Omit<TimeDiscount, 'kind'> & { kind?: TimeDiscount['kind'] }): TimeDiscount`
- Removes: `StoredTimeDiscount`, `normalizeTimeDiscount`, `assertNotStuckOverCap` and its message.

- [ ] **Step 1: Bump the version to `0.21.1`** (same three places as Task 1).

- [ ] **Step 2: Write the failing config tests**

In `tests/timeDiscounts/config.test.ts`: delete the test `'converts a discount saved before per-row pricing into rows as it reads it'` (lines 27–44) and the whole `describe('normalizeTimeDiscount', ...)` block (from line 190 to its end). Remove `normalizeTimeDiscount` from the imports. Add, inside `describe('getTimeDiscountsConfig', ...)` (use the same way the existing `'parses the stored config JSON'` test mocks `shopifyQuery`; copy its mock setup):

```ts
  it('reads a discount stored without a kind as a per-product discount', async () => {
    mockStoredConfig({ discounts: [{ discountId: 'd1', shopifyDiscountId: 'g1', name: 'A', title: 'A', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items: [] }] })
    const { discounts } = await getTimeDiscountsConfig()
    expect(discounts[0].kind).toBe('perProduct')
  })

  it('keeps the kind and the group of a stored group discount', async () => {
    const group = { pricingMode: 'percent', amount: 20, selection: { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] } }
    mockStoredConfig({ discounts: [{ discountId: 'd1', shopifyDiscountId: 'g1', name: 'A', title: 'A', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', kind: 'group', group, items: [] }] })
    const { discounts } = await getTimeDiscountsConfig()
    expect(discounts[0]).toMatchObject({ kind: 'group', group })
  })
```

`mockStoredConfig(value)` is a small helper you add at the top of the describe: `const mockStoredConfig = (value: unknown) => vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(value) } } })` (use the same `shopifyClient` import the file already has).

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/timeDiscounts/config.test.ts`
Expected: the two new tests FAIL (`kind` is undefined).

- [ ] **Step 4: Change `config.ts`**

Replace the `DiscountMember` doc comment, the `TimeDiscount` interface, delete `StoredTimeDiscount` and `normalizeTimeDiscount`, and change the parse line:

```ts
/** A product, or one variant of it, picked for a discount. Omitting `variantId` means the whole product. */
export interface DiscountMember {
  productId: string
  variantId?: string
}

/** A group's pick of a product or variant, with the title its chip shows. */
export type GroupMember = DiscountMember & { title: string }

/** A group's pick of a collection, with the title its chip shows (stored so a chip needs no lookup). */
export interface GroupCollection {
  id: string
  title: string
}

/** What a group is picked by: individual products/variants, or collections — never both. */
export type GroupSelection =
  | { mode: 'products'; members: GroupMember[] }
  | { mode: 'collections'; collections: GroupCollection[] }

/** What a group discount stores: its one shared rule and its picks. Its `items` are rebuilt from this on every save. */
export interface GroupSpec {
  pricingMode: 'percent' | 'fixed'
  /** Percent off (0 < n <= 100), or the final price in major currency units. */
  amount: number
  selection: GroupSelection
}
```

In `TimeDiscount` add after `endsAt`:

```ts
  /** 'perProduct': the merchant edits `items` directly. 'group': `items` are derived from `group`. Fixed when the discount is created. */
  kind: 'perProduct' | 'group'
```

and replace the `items` doc + add `group`:

```ts
  /** The rows the checkout Function and the storefront read: each product/variant with its own price rule. For a group, rebuilt from `group` on every save. */
  items: TimeDiscountItem[]
  /** Present only when `kind` is 'group'. */
  group?: GroupSpec
```

Add, after the `TimeDiscount` interface:

```ts
/** A discount stored before `kind` existed (or without it) is a per-product discount. */
export function withDefaultKind(stored: Omit<TimeDiscount, 'kind'> & { kind?: TimeDiscount['kind'] }): TimeDiscount {
  return { ...stored, kind: stored.kind ?? 'perProduct' }
}
```

Change the parse in `getTimeDiscountsConfig` to:

```ts
  const parsed = JSON.parse(data.shop.metafield.value) as { discounts?: (Omit<TimeDiscount, 'kind'> & { kind?: TimeDiscount['kind'] })[] }
  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts.map(withDefaultKind) : [] }
```

- [ ] **Step 5: Remove `assertNotStuckOverCap` and its tests; set `kind` on new discounts**

In `src/timeDiscounts/actions.ts`: delete the `assertNotStuckOverCap` function with its doc comment, delete both calls to it (in `saveTimeDiscountItem` and `removeTimeDiscountItem`), and remove `functionConfigBytes, FUNCTION_CONFIG_MAX_BYTES` from the `@/timeDiscounts/items` import if they are no longer used there. In `createDiscountFromForm`, change the new discount literal to include the kind:

```ts
  const newDiscount: TimeDiscount = { discountId, shopifyDiscountId, name: title, title, kind: 'perProduct', startsAt, endsAt, items }
```

In `tests/timeDiscounts/actions.test.ts` delete the whole `describe('discounts converted from before per-row pricing that are over the size cap', ...)` block, and remove `functionConfigBytes, FUNCTION_CONFIG_MAX_BYTES` from its import if now unused. Add `kind: 'perProduct',` to the object `discountWith` returns.

- [ ] **Step 6: Fix every other `TimeDiscount` fixture**

Run: `npx tsc --noEmit -p .`
For each error "Property 'kind' is missing", add `kind: 'perProduct',` to that object literal (expected in `tests/lib/discount-availability.test.ts`, `tests/timeDiscounts/config.test.ts`, `tests/timeDiscounts/metafieldSync.test.ts`, `tests/timeDiscounts/pickerActions.test.ts`). Re-run until `tsc` prints nothing.

- [ ] **Step 7: Run all checks**

Run: `npx eslint src tests && npx vitest run`
Expected: no eslint output; all tests PASS (the per-row create test still expects the saved discount `toMatchObject` fields — it passes with the extra `kind`).

- [ ] **Step 8: Commit**

```bash
git add -A -- package.json package-lock.json src tests
git commit -m "feat: give time discounts a kind and a group spec; drop the pre-per-row reading" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move the server-only helpers out of `actions.ts` (no behaviour change)

`actions.ts` is a `'use server'` file: every function it exports can be called from the browser. The group actions need the same Shopify-record helpers, and those must not become callable endpoints, so they move to a plain module.

**Files:**
- Create: `src/timeDiscounts/shopifyRecord.ts`
- Modify: `src/timeDiscounts/actions.ts`, `package.json`, `package-lock.json`
- Test: the existing `tests/timeDiscounts/actions.test.ts` is the safety net (it must pass unchanged)

**Interfaces:**
- Produces, all exported from `src/timeDiscounts/shopifyRecord.ts`:
  - `buildFunctionConfigMetafield(items: TimeDiscountItem[]): FunctionConfigMetafield`
  - `createShopifyDiscountRecord(input: { title: string; startsAtUtc: string; endsAtUtc: string; items: TimeDiscountItem[] }): Promise<string>`
  - `updateShopifyDiscountRecord(shopifyDiscountId: string, update: { title?: string; startsAtUtc?: string; endsAtUtc?: string; items?: TimeDiscountItem[] }): Promise<void>`
  - `deleteShopifyDiscountRecord(shopifyDiscountId: string): Promise<void>`
  - `parseSchedule(startsAtRaw: string, endsAtRaw: string): { startsAt: string; endsAt: string }`
  - `findDiscountOrThrow(config: TimeDiscountsConfig, discountId: string): TimeDiscount`
  - `syncBestEffort(label: string, discount: TimeDiscount, timezone: string, onlyProductIds?: string[]): Promise<void>`
  - `errorMessage(err: unknown): string` (new)
  - `adminProductBaseUrl(): string` (new) — `` `https://${process.env.SHOPIFY_SHOP}/admin/products/` ``

- [ ] **Step 1: Bump the version to `0.21.2`.**

- [ ] **Step 2: Create `shopifyRecord.ts` by moving code**

Create `src/timeDiscounts/shopifyRecord.ts`. Cut these items **verbatim** out of `src/timeDiscounts/actions.ts` and paste them in, adding `export` to each function: the constants `METAFIELD_NAMESPACE` and `FUNCTION_HANDLE`; the `FunctionConfigMetafield` interface; `buildFunctionConfigMetafield`; `createShopifyDiscountRecord`; the `ShopifyDiscountRecordUpdate` interface; `updateShopifyDiscountRecord`; `deleteShopifyDiscountRecord`; `parseSchedule`; `findDiscountOrThrow`; `syncBestEffort`. Give the file these imports (adjust to exactly what the moved code uses):

```ts
import { syncTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { shopifyQuery } from '@/lib/shopify-client'
import { assertItemsFitFunctionConfig } from '@/timeDiscounts/items'
import type { TimeDiscount, TimeDiscountItem, TimeDiscountsConfig } from '@/timeDiscounts/config'
```

Add at the bottom:

```ts
/** The text to show for a thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong — please try again'
}

/** Link base for a product's Shopify admin page; ends with `/admin/products/`. */
export function adminProductBaseUrl(): string {
  return `https://${process.env.SHOPIFY_SHOP}/admin/products/`
}
```

- [ ] **Step 3: Use them from `actions.ts`**

In `actions.ts` add `import { buildFunctionConfigMetafield, createShopifyDiscountRecord, updateShopifyDiscountRecord, deleteShopifyDiscountRecord, parseSchedule, findDiscountOrThrow, syncBestEffort, errorMessage } from '@/timeDiscounts/shopifyRecord'`, remove now-unused imports (`shopifyQuery`, `assertItemsFitFunctionConfig`, `syncTimeDiscountMetafields` only if unused; keep `clearTimeDiscountMetafields`), and change `guarded` to:

```ts
async function guarded(save: () => Promise<void>): Promise<SaveResult> {
  try {
    await save()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}
```

`createDiscountFromForm`'s catch for a failed config save stays as is. The one place that builds `err instanceof Error ? err.message : '...'` in `createTimeDiscount` becomes `errorMessage(err)`.

- [ ] **Step 4: Run all checks (nothing may change)**

Run: `npx tsc --noEmit -p . && npx eslint src/timeDiscounts && npx vitest run tests/timeDiscounts && npx next build --webpack 2>&1 | grep -E "Compiled|rror"`
Expected: no tsc/eslint output; all `tests/timeDiscounts` tests PASS **unchanged** (if a test needs editing, the move changed behaviour: stop and fix the move); build prints `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/timeDiscounts
git commit -m "refactor: move the server-only Shopify record helpers out of the server-action file" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `group.ts` — the pure group logic

**Files:**
- Create: `src/timeDiscounts/group.ts`, `tests/timeDiscounts/group.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `itemKey`, `validateRule`, `discountedPrice`, `productAdminUrl` (`items.ts`); `Rule` (`rows.ts`); config types (Task 2); `PickedItem` (`AddItemPicker.tsx`).
- Produces (all exported from `src/timeDiscounts/group.ts`):

```ts
export const GROUP_RESOLVE_LIMIT = 200
export const RULE_SAVE_DELAY_MS = 600
export const EMPTY_SELECTION_MESSAGE: string       // 'This selection covers no products.'
export const NOT_A_GROUP_MESSAGE: string           // 'This is not a group discount.'
export const GROUP_DISCOUNT_MESSAGE: string        // 'This is a group discount: change its shared price or its picks instead.'
export type CoveredRow = { productId: string; variantId?: string; title: string; adminUrl: string; regularPrice: number; discountedPrice: number }
export type Failure = { title: string; message: string }
export type PriceInfo = { title: string; price: number }
export type PreviewResult = { ok: true; covered: CoveredRow[] } | { ok: false; error: string }
export type GroupSaveResult = { ok: true; covered: CoveredRow[] } | { ok: false; error: string }
export function expandGroup(rule: Rule, members: DiscountMember[]): TimeDiscountItem[]
export function summariseFailures(failures: Failure[]): string | null
export function groupSizeMessage(count: number, truncated: boolean): string
export function coveredRows(items: TimeDiscountItem[], prices: Map<string, PriceInfo>, adminProductBaseUrl: string): CoveredRow[]
export function cleanRule(raw: unknown): Rule
export function cleanSelection(raw: unknown): GroupSelection
export function parseGroupSpec(raw: string): GroupSpec
export function parseRuleInput(pricingMode: 'percent' | 'fixed', amountText: string): { rule: Rule | null; problem: string | null }
export function ruleSaveDelay(lastRequested: Rule | null, pricingMode: 'percent' | 'fixed'): number
export function isSelectionEmpty(selection: GroupSelection): boolean
export function selectionCount(selection: GroupSelection): number
export function memberKeys(selection: GroupSelection): string[]
export function addMember(selection: GroupSelection, item: PickedItem): GroupSelection
export function removeMember(selection: GroupSelection, key: string): GroupSelection
export function switchMode(selection: GroupSelection, mode: 'products' | 'collections'): GroupSelection
export function previewKey(rule: Rule, selection: GroupSelection): string
export function groupSaveBlocker(form: GroupFormState): string | null
export type GroupFormState = { title: string; startsAt: string; endsAt: string; scheduleProblem: string | null; amountText: string; ruleProblem: string | null; selectionEmpty: boolean; preview: { status: 'idle' | 'loading' | 'ok' | 'error' } }
```

- [ ] **Step 1: Bump the version to `0.21.3`.**

- [ ] **Step 2: Write the failing tests**

Create `tests/timeDiscounts/group.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  expandGroup, summariseFailures, groupSizeMessage, coveredRows, cleanRule, cleanSelection, parseGroupSpec, parseRuleInput,
  ruleSaveDelay, isSelectionEmpty, selectionCount, memberKeys, addMember, removeMember, switchMode, previewKey, groupSaveBlocker,
  EMPTY_SELECTION_MESSAGE, type GroupFormState,
} from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const BASE = 'https://shop.myshopify.com/admin/products/'
const percent20 = { pricingMode: 'percent' as const, amount: 20 }

describe('expandGroup', () => {
  it('gives every member the shared rule, keeping a variant only when there is one', () => {
    expect(expandGroup(percent20, [{ productId: P1 }, { productId: P2, variantId: V10 }])).toEqual([
      { productId: P1, pricingMode: 'percent', amount: 20 },
      { productId: P2, variantId: V10, pricingMode: 'percent', amount: 20 },
    ])
  })

  it('lists a product once even when it is picked twice (for example in two collections)', () => {
    expect(expandGroup(percent20, [{ productId: P1 }, { productId: P1 }])).toHaveLength(1)
  })

  it('does not change the members it is given', () => {
    const members = [{ productId: P1 }]
    expandGroup(percent20, members)
    expect(members).toEqual([{ productId: P1 }])
  })
})

describe('summariseFailures', () => {
  it('is null when nothing failed', () => expect(summariseFailures([])).toBeNull())
  it('names the first product that failed', () => {
    expect(summariseFailures([{ title: 'Cat Toy', message: 'Too cheap' }])).toBe('Cat Toy: Too cheap')
  })
  it('says how many others also have a problem', () => {
    expect(summariseFailures([{ title: 'A', message: 'm' }, { title: 'B', message: 'n' }])).toBe('A: m (and 1 more product with a problem)')
    expect(summariseFailures([{ title: 'A', message: 'm' }, { title: 'B', message: 'n' }, { title: 'C', message: 'o' }])).toBe('A: m (and 2 more products with a problem)')
  })
})

describe('groupSizeMessage', () => {
  it('states the count and the limits', () => {
    expect(groupSizeMessage(120, false)).toBe('This selection covers 120 products. One discount fits about 63 variants or 107 whole products. Pick fewer, or split it into two discounts.')
  })
  it('says "more than 200" when resolution stopped early', () => {
    expect(groupSizeMessage(201, true)).toContain('covers more than 200 products')
  })
})

describe('coveredRows', () => {
  it('shows each row with its discounted and regular price and a link to its admin page', () => {
    const items = expandGroup({ pricingMode: 'fixed', amount: 7.5 }, [{ productId: P1 }, { productId: P2, variantId: V10 }])
    const prices = new Map([[`${P1}|`, { title: 'Cat Toy', price: 10 }], [`${P2}|${V10}`, { title: 'Bed – Grey', price: 40 }]])
    expect(coveredRows(items, prices, BASE)).toEqual([
      { productId: P1, title: 'Cat Toy', adminUrl: `${BASE}1`, regularPrice: 10, discountedPrice: 7.5 },
      { productId: P2, variantId: V10, title: 'Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 40, discountedPrice: 7.5 },
    ])
  })

  it('leaves out a row whose price is unknown', () => {
    expect(coveredRows(expandGroup(percent20, [{ productId: P1 }]), new Map(), BASE)).toEqual([])
  })
})

describe('cleanRule', () => {
  it('rounds the amount to pence and defaults an unknown mode to percent', () => {
    expect(cleanRule({ pricingMode: 'fixed', amount: 7.499 })).toEqual({ pricingMode: 'fixed', amount: 7.5 })
    expect(cleanRule({ pricingMode: 'weird', amount: '12' })).toEqual({ pricingMode: 'percent', amount: 12 })
  })
  it.each([[null], ['x'], [{ amount: 'abc' }], [{}]])('rejects %j', (raw) => {
    expect(() => cleanRule(raw)).toThrow('could not be read')
  })
})

describe('cleanSelection', () => {
  it('accepts products and collections picks', () => {
    expect(cleanSelection({ mode: 'products', members: [{ productId: P1, title: 'Toy' }, { productId: P2, variantId: V10, title: 'Bed' }] }))
      .toEqual({ mode: 'products', members: [{ productId: P1, title: 'Toy' }, { productId: P2, variantId: V10, title: 'Bed' }] })
    expect(cleanSelection({ mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }))
      .toEqual({ mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] })
  })
  it.each([
    [null], [{ mode: 'other' }], [{ mode: 'products', members: 'x' }], [{ mode: 'products', members: [{ title: 'no id' }] }],
    [{ mode: 'collections', collections: [{ id: '', title: 't' }] }],
  ])('rejects %j', (raw) => {
    expect(() => cleanSelection(raw)).toThrow('could not be read')
  })
})

describe('parseGroupSpec', () => {
  it('reads a whole group from JSON', () => {
    const json = JSON.stringify({ pricingMode: 'percent', amount: 15, selection: { mode: 'products', members: [{ productId: P1, title: 'Toy' }] } })
    expect(parseGroupSpec(json)).toEqual({ pricingMode: 'percent', amount: 15, selection: { mode: 'products', members: [{ productId: P1, title: 'Toy' }] } })
  })
  it('rejects text that is not a group', () => {
    expect(() => parseGroupSpec('not json')).toThrow('could not be read')
    expect(() => parseGroupSpec('{}')).toThrow('could not be read')
  })
})

describe('parseRuleInput', () => {
  it('has no rule and no problem while the amount is empty', () => {
    expect(parseRuleInput('percent', '  ')).toEqual({ rule: null, problem: null })
  })
  it('returns the rule, rounded, when it is valid', () => {
    expect(parseRuleInput('fixed', '7.499')).toEqual({ rule: { pricingMode: 'fixed', amount: 7.5 }, problem: null })
  })
  it('returns the problem and no rule when it is not valid', () => {
    expect(parseRuleInput('percent', '0')).toEqual({ rule: null, problem: 'Enter an amount greater than zero' })
    expect(parseRuleInput('percent', '150')).toEqual({ rule: null, problem: 'A percentage discount cannot exceed 100%' })
    expect(parseRuleInput('fixed', 'abc').rule).toBeNull()
  })
})

describe('ruleSaveDelay', () => {
  it('saves at once when the type changed, and after a pause while the amount changes', () => {
    expect(ruleSaveDelay({ pricingMode: 'percent', amount: 10 }, 'fixed')).toBe(0)
    expect(ruleSaveDelay({ pricingMode: 'percent', amount: 10 }, 'percent')).toBe(600)
    expect(ruleSaveDelay(null, 'percent')).toBe(600)
  })
})

describe('selection edits', () => {
  const products: GroupSelection = { mode: 'products', members: [{ productId: P1, title: 'Toy' }] }
  const collections: GroupSelection = { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }

  it('counts and lists what is picked', () => {
    expect(selectionCount(products)).toBe(1)
    expect(isSelectionEmpty(products)).toBe(false)
    expect(isSelectionEmpty({ mode: 'collections', collections: [] })).toBe(true)
    expect(memberKeys(products)).toEqual([`${P1}|`])
    expect(memberKeys(collections)).toEqual([])
  })

  it('adds a picked product or variant with its title, in products mode only', () => {
    expect(addMember(products, { productId: P2, variantId: V10, title: 'Bed – Grey', price: 40 })).toEqual({
      mode: 'products', members: [{ productId: P1, title: 'Toy' }, { productId: P2, variantId: V10, title: 'Bed – Grey' }],
    })
    expect(addMember(collections, { productId: P2, title: 'x', price: 1 })).toBe(collections)
  })

  it('removes a pick by its row key', () => {
    expect(removeMember(products, `${P1}|`)).toEqual({ mode: 'products', members: [] })
    expect(removeMember(products, `${P2}|`)).toBe(products)
  })

  it('switching mode starts an empty selection of the other mode, and keeps the same mode as it is', () => {
    expect(switchMode(products, 'collections')).toEqual({ mode: 'collections', collections: [] })
    expect(switchMode(collections, 'products')).toEqual({ mode: 'products', members: [] })
    expect(switchMode(products, 'products')).toBe(products)
  })
})

describe('previewKey', () => {
  it('changes when the rule or the picks change, and not otherwise', () => {
    const sel: GroupSelection = { mode: 'products', members: [{ productId: P1, title: 'Toy' }] }
    expect(previewKey(percent20, sel)).toBe(previewKey({ ...percent20 }, { ...sel }))
    expect(previewKey(percent20, sel)).not.toBe(previewKey({ pricingMode: 'percent', amount: 21 }, sel))
    expect(previewKey(percent20, sel)).not.toBe(previewKey(percent20, { mode: 'products', members: [] }))
  })
})

describe('groupSaveBlocker', () => {
  const ready: GroupFormState = {
    title: 'T', startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', scheduleProblem: null,
    amountText: '20', ruleProblem: null, selectionEmpty: false, preview: { status: 'ok' },
  }
  it('is null when the form is complete and the preview is ok', () => expect(groupSaveBlocker(ready)).toBeNull())
  it.each([
    [{ title: ' ' }, 'Add a title to save.'],
    [{ startsAt: '' }, 'Set a start and an end time to save.'],
    [{ scheduleProblem: 'End must be after start.' }, 'Fix the schedule to save.'],
    [{ amountText: '' }, 'Enter the shared price to save.'],
    [{ ruleProblem: 'Enter an amount greater than zero' }, 'Fix the shared price to save.'],
    [{ selectionEmpty: true }, 'Pick at least one product, variant or collection to save.'],
    [{ preview: { status: 'idle' as const } }, 'Checking the products…'],
    [{ preview: { status: 'loading' as const } }, 'Checking the products…'],
    [{ preview: { status: 'error' as const } }, 'Fix the problem shown above to save.'],
  ])('names the first thing missing: %o', (change, message) => {
    expect(groupSaveBlocker({ ...ready, ...change })).toBe(message)
  })
  it('reports the most basic problem first', () => {
    expect(groupSaveBlocker({ ...ready, title: '', selectionEmpty: true, preview: { status: 'error' } })).toBe('Add a title to save.')
  })
})

describe('messages', () => {
  it('has the empty-selection text the server and the form share', () => expect(EMPTY_SELECTION_MESSAGE).toBe('This selection covers no products.'))
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/timeDiscounts/group.test.ts`
Expected: FAIL — cannot resolve `@/timeDiscounts/group`.

- [ ] **Step 4: Implement `group.ts`**

Create `src/timeDiscounts/group.ts`:

```ts
import { discountedPrice, itemKey, productAdminUrl, validateRule } from '@/timeDiscounts/items'
import type { PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { Rule } from '@/timeDiscounts/rows'
import type { DiscountMember, GroupCollection, GroupMember, GroupSelection, GroupSpec, TimeDiscountItem } from '@/timeDiscounts/config'

// Pure helpers for group discounts. Nothing here reads component or server
// state: every value a function needs is passed in, every result is returned.

/** Collections are resolved up to this many products (+1, to tell "too many" from "exactly the limit"); anything over this cannot fit one discount anyway. */
export const GROUP_RESOLVE_LIMIT = 200
/** How long the Group page waits after the amount stops changing before it saves. */
export const RULE_SAVE_DELAY_MS = 600

export const EMPTY_SELECTION_MESSAGE = 'This selection covers no products.'
export const NOT_A_GROUP_MESSAGE = 'This is not a group discount.'
export const GROUP_DISCOUNT_MESSAGE = 'This is a group discount: change its shared price or its picks instead.'
const UNREADABLE = 'The group could not be read — reload the page and try again'

export type CoveredRow = {
  productId: string
  variantId?: string
  title: string
  /** Link to the product in the Shopify admin. */
  adminUrl: string
  regularPrice: number
  discountedPrice: number
}
export type Failure = { title: string; message: string }
export type PriceInfo = { title: string; price: number }
export type PreviewResult = { ok: true; covered: CoveredRow[] } | { ok: false; error: string }
export type GroupSaveResult = { ok: true; covered: CoveredRow[] } | { ok: false; error: string }

/** One row per member, each carrying the shared rule; a product listed twice appears once. */
export function expandGroup(rule: Rule, members: DiscountMember[]): TimeDiscountItem[] {
  const seen = new Set<string>()
  const items: TimeDiscountItem[] = []
  for (const member of members) {
    const key = itemKey(member)
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      productId: member.productId,
      ...(member.variantId ? { variantId: member.variantId } : {}),
      pricingMode: rule.pricingMode,
      amount: rule.amount,
    })
  }
  return items
}

/** The first failing product by name, and how many others fail too; null when nothing failed. */
export function summariseFailures(failures: Failure[]): string | null {
  if (failures.length === 0) return null
  const [first, ...others] = failures
  const more = others.length === 0 ? '' : ` (and ${others.length} more ${others.length === 1 ? 'product' : 'products'} with a problem)`
  return `${first.title}: ${first.message}${more}`
}

export function groupSizeMessage(count: number, truncated: boolean): string {
  const covers = truncated ? `more than ${GROUP_RESOLVE_LIMIT}` : String(count)
  return `This selection covers ${covers} products. One discount fits about 63 variants or 107 whole products. Pick fewer, or split it into two discounts.`
}

/** The table rows for `items`; a row whose price is unknown is left out. */
export function coveredRows(items: TimeDiscountItem[], prices: Map<string, PriceInfo>, adminProductBaseUrl: string): CoveredRow[] {
  return items.flatMap((item) => {
    const found = prices.get(itemKey(item))
    if (!found) return []
    return [{
      productId: item.productId,
      ...(item.variantId ? { variantId: item.variantId } : {}),
      title: found.title,
      adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
      regularPrice: found.price,
      discountedPrice: discountedPrice(item, found.price),
    }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A rule from untrusted input: mode defaults to percent, amount is rounded to pence. */
export function cleanRule(raw: unknown): Rule {
  if (!isRecord(raw)) throw new Error(UNREADABLE)
  const amount = Number(raw.amount)
  if (raw.amount === undefined || raw.amount === null || raw.amount === '' || !Number.isFinite(amount)) throw new Error(UNREADABLE)
  return { pricingMode: raw.pricingMode === 'fixed' ? 'fixed' : 'percent', amount: Math.round(amount * 100) / 100 }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/** A selection from untrusted input; anything that is not a well-formed pick is rejected rather than guessed at. */
export function cleanSelection(raw: unknown): GroupSelection {
  if (!isRecord(raw)) throw new Error(UNREADABLE)
  if (raw.mode === 'products') {
    if (!Array.isArray(raw.members)) throw new Error(UNREADABLE)
    const members: GroupMember[] = raw.members.map((entry: unknown) => {
      if (!isRecord(entry) || !nonEmptyString(entry.productId) || typeof entry.title !== 'string') throw new Error(UNREADABLE)
      if (entry.variantId != null && typeof entry.variantId !== 'string') throw new Error(UNREADABLE)
      return { productId: entry.productId, ...(entry.variantId ? { variantId: entry.variantId } : {}), title: entry.title }
    })
    return { mode: 'products', members }
  }
  if (raw.mode === 'collections') {
    if (!Array.isArray(raw.collections)) throw new Error(UNREADABLE)
    const collections: GroupCollection[] = raw.collections.map((entry: unknown) => {
      if (!isRecord(entry) || !nonEmptyString(entry.id) || typeof entry.title !== 'string') throw new Error(UNREADABLE)
      return { id: entry.id, title: entry.title }
    })
    return { mode: 'collections', collections }
  }
  throw new Error(UNREADABLE)
}

/** A whole group from the JSON the create form sends. */
export function parseGroupSpec(raw: string): GroupSpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(UNREADABLE)
  }
  if (!isRecord(parsed)) throw new Error(UNREADABLE)
  return { ...cleanRule(parsed), selection: cleanSelection(parsed.selection) }
}

/** The rule typed into the form: `rule` only when it is complete and valid; `problem` says why not (null while the amount is still empty). */
export function parseRuleInput(pricingMode: 'percent' | 'fixed', amountText: string): { rule: Rule | null; problem: string | null } {
  if (amountText.trim() === '') return { rule: null, problem: null }
  const rule: Rule = { pricingMode, amount: Math.round(Number(amountText) * 100) / 100 }
  const problem = validateRule(rule, null)
  return problem ? { rule: null, problem } : { rule, problem: null }
}

/** How long to wait before saving a rule change: none when the type changed, a pause while the amount is still being typed. */
export function ruleSaveDelay(lastRequested: Rule | null, pricingMode: 'percent' | 'fixed'): number {
  return lastRequested !== null && lastRequested.pricingMode !== pricingMode ? 0 : RULE_SAVE_DELAY_MS
}

export function selectionCount(selection: GroupSelection): number {
  return selection.mode === 'products' ? selection.members.length : selection.collections.length
}

export function isSelectionEmpty(selection: GroupSelection): boolean {
  return selectionCount(selection) === 0
}

/** Row keys of the picked products/variants (none in collections mode). */
export function memberKeys(selection: GroupSelection): string[] {
  return selection.mode === 'products' ? selection.members.map(itemKey) : []
}

export function addMember(selection: GroupSelection, item: PickedItem): GroupSelection {
  if (selection.mode !== 'products') return selection
  const member: GroupMember = { productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}), title: item.title }
  return { mode: 'products', members: [...selection.members, member] }
}

export function removeMember(selection: GroupSelection, key: string): GroupSelection {
  if (selection.mode !== 'products') return selection
  const members = selection.members.filter((member) => itemKey(member) !== key)
  return members.length === selection.members.length ? selection : { mode: 'products', members }
}

/** An empty selection of `mode`; the same selection when it is already in that mode. */
export function switchMode(selection: GroupSelection, mode: 'products' | 'collections'): GroupSelection {
  if (selection.mode === mode) return selection
  return mode === 'products' ? { mode: 'products', members: [] } : { mode: 'collections', collections: [] }
}

/** Identifies one preview request: equal keys mean the same question. */
export function previewKey(rule: Rule, selection: GroupSelection): string {
  return JSON.stringify({ rule, selection })
}

export type GroupFormState = {
  title: string
  startsAt: string
  endsAt: string
  scheduleProblem: string | null
  amountText: string
  ruleProblem: string | null
  selectionEmpty: boolean
  preview: { status: 'idle' | 'loading' | 'ok' | 'error' }
}

/** Why the new group form cannot be saved yet, most basic reason first; null when it can. */
export function groupSaveBlocker(form: GroupFormState): string | null {
  if (form.title.trim() === '') return 'Add a title to save.'
  if (form.startsAt === '' || form.endsAt === '') return 'Set a start and an end time to save.'
  if (form.scheduleProblem) return 'Fix the schedule to save.'
  if (form.amountText.trim() === '') return 'Enter the shared price to save.'
  if (form.ruleProblem) return 'Fix the shared price to save.'
  if (form.selectionEmpty) return 'Pick at least one product, variant or collection to save.'
  if (form.preview.status === 'idle' || form.preview.status === 'loading') return 'Checking the products…'
  if (form.preview.status === 'error') return 'Fix the problem shown above to save.'
  return null
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/timeDiscounts/group.test.ts`
Expected: all PASS.

- [ ] **Step 6: Run all checks and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: clean; all PASS.

```bash
git add package.json package-lock.json src/timeDiscounts/group.ts tests/timeDiscounts/group.test.ts
git commit -m "feat: pure group logic (expansion, cleaning, selection edits, blockers)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Task 5: `resolveGroup` and `previewGroup` — the server's one answer to "what would this group do?"

**Files:**
- Create: `src/timeDiscounts/groupServer.ts`, `src/timeDiscounts/groupActions.ts`, `tests/timeDiscounts/groupServer.test.ts`, `tests/timeDiscounts/groupActions.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `resolveCollectionMembers`, `getMemberInfo`, `getLowestVariantPrices`, `fetchAvailabilityConfigs`, `isAvailableEverywhere`, `functionConfigBytes`, `FUNCTION_CONFIG_MAX_BYTES`, `itemKey`, `validateItemsStructure`, `validateRule`; everything from `group.ts` (Task 4); `errorMessage`, `adminProductBaseUrl` (Task 3).
- Produces:
  - `resolveGroup(group: GroupSpec, excludeDiscountId: string | undefined, adminProductBaseUrl: string, options?: { allowEmpty?: boolean }): Promise<{ items: TimeDiscountItem[]; covered: CoveredRow[] }>` — throws an `Error` whose message is what the UI shows. Order of checks: rule validity, resolve picks, empty / too many (before any price lookup), duplicates and structure, byte size, prices, availability (excluding `excludeDiscountId`), per-row rule. With `allowEmpty`, an empty selection returns `{ items: [], covered: [] }` instead of throwing (existing groups may have all their picks removed).
  - `loadCovered(items: TimeDiscountItem[], adminProductBaseUrl: string): Promise<CoveredRow[]>` — the covered rows of existing items (the discount page uses it).
  - `previewGroup(rule: unknown, selection: unknown, excludeDiscountId?: string): Promise<PreviewResult>` (`'use server'`).

- [ ] **Step 1: Bump the version to `0.21.4`.**

- [ ] **Step 2: Write the failing tests for `resolveGroup` and `loadCovered`**

Create `tests/timeDiscounts/groupServer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveGroup, loadCovered } from '@/timeDiscounts/groupServer'
import * as collectionsLib from '@/lib/collections'
import * as productsLib from '@/lib/products'
import * as configLib from '@/lib/config'
import * as timeConfigLib from '@/timeDiscounts/config'
import { EMPTY_SELECTION_MESSAGE, groupSizeMessage } from '@/timeDiscounts/group'
import type { GroupSpec, TimeDiscount } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const C1 = 'gid://shopify/Collection/1'
const BASE = 'https://shop.myshopify.com/admin/products/'

const products = (...members: { productId: string; variantId?: string; title: string }[]): GroupSpec['selection'] => ({ mode: 'products', members })
const group = (selection: GroupSpec['selection'], over: Partial<GroupSpec> = {}): GroupSpec => ({ pricingMode: 'percent', amount: 20, selection, ...over })
const lowest = (productId: string, title: string, price: number) => ({ productId, title, price })
const info = (productId: string, variantId: string, title: string, price: number) => ({ productId, variantId, title, price, handle: 'h', imageUrl: null })
const otherDiscount = (productId: string): TimeDiscount => ({
  discountId: 'time_disc_9', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/9', name: 'Other', title: 'Other', kind: 'perProduct',
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items: [{ productId, pricingMode: 'percent', amount: 10 }],
})

let getMemberInfo: ReturnType<typeof vi.spyOn>
let getLowest: ReturnType<typeof vi.spyOn>
let resolveCollection: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.restoreAllMocks()
  getMemberInfo = vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([])
  getLowest = vi.spyOn(productsLib, 'getLowestVariantPrices').mockResolvedValue([lowest(P1, 'Cat Toy', 10), lowest(P2, 'Dog Bed', 40)])
  resolveCollection = vi.spyOn(collectionsLib, 'resolveCollectionMembers').mockResolvedValue([{ productId: P1 }, { productId: P2 }])
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
})

describe('resolveGroup — products mode', () => {
  it('turns the picks into rows with the shared rule, and prices variants and whole products separately', async () => {
    getMemberInfo.mockResolvedValue([info(P2, V10, 'Dog Bed – Grey', 60)])
    const result = await resolveGroup(group(products({ productId: P1, title: 'Cat Toy' }, { productId: P2, variantId: V10, title: 'Dog Bed – Grey' })), undefined, BASE)

    expect(result.items).toEqual([
      { productId: P1, pricingMode: 'percent', amount: 20 },
      { productId: P2, variantId: V10, pricingMode: 'percent', amount: 20 },
    ])
    expect(result.covered).toEqual([
      { productId: P1, title: 'Cat Toy', adminUrl: `${BASE}1`, regularPrice: 10, discountedPrice: 8 },
      { productId: P2, variantId: V10, title: 'Dog Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 60, discountedPrice: 48 },
    ])
    expect(getMemberInfo).toHaveBeenCalledWith([{ productId: P2, variantId: V10 }])
    expect(getLowest).toHaveBeenCalledWith([P1])
  })
})

describe('resolveGroup — collections mode', () => {
  const inCollection = group({ mode: 'collections', collections: [{ id: C1, title: 'Summer' }] })

  it('resolves the collection to whole-product rows, asking for at most one more than the limit', async () => {
    const result = await resolveGroup(inCollection, undefined, BASE)
    expect(resolveCollection).toHaveBeenCalledWith([C1], 201)
    expect(result.items).toEqual([{ productId: P1, pricingMode: 'percent', amount: 20 }, { productId: P2, pricingMode: 'percent', amount: 20 }])
  })

  it('refuses a collection with no products', async () => {
    resolveCollection.mockResolvedValue([])
    await expect(resolveGroup(inCollection, undefined, BASE)).rejects.toThrow(EMPTY_SELECTION_MESSAGE)
  })

  it('refuses a collection over the limit before looking up any price', async () => {
    resolveCollection.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({ productId: `gid://shopify/Product/${i}` })))
    await expect(resolveGroup(inCollection, undefined, BASE)).rejects.toThrow(groupSizeMessage(201, true))
    expect(getLowest).not.toHaveBeenCalled()
    expect(getMemberInfo).not.toHaveBeenCalled()
  })

  it('refuses rows that would not fit the checkout config, with the real count', async () => {
    resolveCollection.mockResolvedValue(Array.from({ length: 150 }, (_, i) => ({ productId: `gid://shopify/Product/${1000 + i}` })))
    await expect(resolveGroup(inCollection, undefined, BASE)).rejects.toThrow(groupSizeMessage(150, false))
    expect(getLowest).not.toHaveBeenCalled()
  })

  it('makes no collection lookup when no collection is picked', async () => {
    await expect(resolveGroup(group({ mode: 'collections', collections: [] }), undefined, BASE)).rejects.toThrow(EMPTY_SELECTION_MESSAGE)
    expect(resolveCollection).not.toHaveBeenCalled()
  })
})

describe('resolveGroup — empty picks', () => {
  it('throws for an empty selection, unless empty is allowed (an existing group whose picks were all removed)', async () => {
    const empty = group(products())
    await expect(resolveGroup(empty, undefined, BASE)).rejects.toThrow(EMPTY_SELECTION_MESSAGE)
    expect(await resolveGroup(empty, undefined, BASE, { allowEmpty: true })).toEqual({ items: [], covered: [] })
  })

  it('still checks the rule when empty is allowed', async () => {
    await expect(resolveGroup(group(products(), { amount: 0 }), undefined, BASE, { allowEmpty: true })).rejects.toThrow('Enter an amount greater than zero')
  })
})

describe('resolveGroup — the rule', () => {
  it('refuses an invalid rule before looking anything up', async () => {
    await expect(resolveGroup(group(products({ productId: P1, title: 'Cat Toy' }), { amount: 150 }), undefined, BASE)).rejects.toThrow('A percentage discount cannot exceed 100%')
    expect(getLowest).not.toHaveBeenCalled()
  })

  it('judges a fixed price against the CHEAPEST variant of a whole product', async () => {
    getLowest.mockResolvedValue([lowest(P1, 'Bed', 24.5)])
    const fixed30 = group(products({ productId: P1, title: 'Bed' }), { pricingMode: 'fixed', amount: 30 })
    await expect(resolveGroup(fixed30, undefined, BASE)).rejects.toThrow(/^Bed: The fixed price \(£30\.00\) is not lower than the regular price \(£24\.50\)/)
  })

  it('accepts a fixed price below the cheapest variant', async () => {
    getLowest.mockResolvedValue([lowest(P1, 'Bed', 24.5)])
    const fixed20 = group(products({ productId: P1, title: 'Bed' }), { pricingMode: 'fixed', amount: 20 })
    expect((await resolveGroup(fixed20, undefined, BASE)).covered[0]).toMatchObject({ regularPrice: 24.5, discountedPrice: 20 })
  })

  it('names the first failing product and counts the others', async () => {
    const fixed = group(products({ productId: P1, title: 'Cat Toy' }, { productId: P2, title: 'Dog Bed' }), { pricingMode: 'fixed', amount: 50 })
    await expect(resolveGroup(fixed, undefined, BASE)).rejects.toThrow(/^Cat Toy: .*\(and 1 more product with a problem\)$/)
  })

  it('reports a product that is no longer in Shopify', async () => {
    getLowest.mockResolvedValue([])
    await expect(resolveGroup(group(products({ productId: P1, title: 'Cat Toy' })), undefined, BASE)).rejects.toThrow('Product 1: This product could not be found in Shopify')
  })
})

describe('resolveGroup — availability', () => {
  const pick = group(products({ productId: P1, title: 'Cat Toy' }))

  it('refuses a product that belongs to another time discount', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [otherDiscount(P1)] })
    await expect(resolveGroup(pick, undefined, BASE)).rejects.toThrow('Cat Toy: This product already belongs to another discount')
  })

  it('does not count the group\'s own rows as a conflict', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [otherDiscount(P1)] })
    expect((await resolveGroup(pick, 'time_disc_9', BASE)).items).toHaveLength(1)
  })

  it('refuses a product that belongs to a tier discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'tier_1', name: 'Tiers', status: 'active', pricingMode: 'percent', tiers: [], members: [{ productId: P1 }] }],
    } as never)
    await expect(resolveGroup(pick, undefined, BASE)).rejects.toThrow('Cat Toy: This product already belongs to another discount')
  })
})

describe('loadCovered', () => {
  it('shows existing rows with their current prices', async () => {
    getMemberInfo.mockResolvedValue([info(P2, V10, 'Dog Bed – Grey', 60)])
    const rows = await loadCovered([
      { productId: P1, pricingMode: 'fixed', amount: 7.5 },
      { productId: P2, variantId: V10, pricingMode: 'percent', amount: 50 },
    ], BASE)
    expect(rows).toEqual([
      { productId: P1, title: 'Cat Toy', adminUrl: `${BASE}1`, regularPrice: 10, discountedPrice: 7.5 },
      { productId: P2, variantId: V10, title: 'Dog Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 60, discountedPrice: 30 },
    ])
  })

  it('leaves out a product that can no longer be found', async () => {
    getLowest.mockResolvedValue([])
    expect(await loadCovered([{ productId: P1, pricingMode: 'percent', amount: 10 }], BASE)).toEqual([])
  })
})
```

- [ ] **Step 3: Write the failing tests for `previewGroup`**

Create `tests/timeDiscounts/groupActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { previewGroup } from '@/timeDiscounts/groupActions'
import * as groupServer from '@/timeDiscounts/groupServer'

const P1 = 'gid://shopify/Product/1'
const covered = [{ productId: P1, title: 'Cat Toy', adminUrl: 'https://x/admin/products/1', regularPrice: 10, discountedPrice: 8 }]
const selection = { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }] }

beforeEach(() => vi.restoreAllMocks())

describe('previewGroup', () => {
  it('returns the covered rows for a valid group and writes nothing', async () => {
    const resolve = vi.spyOn(groupServer, 'resolveGroup').mockResolvedValue({ items: [], covered })
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, selection, 'time_disc_1')).toEqual({ ok: true, covered })
    expect(resolve).toHaveBeenCalledWith(
      { pricingMode: 'percent', amount: 20, selection },
      'time_disc_1',
      expect.stringContaining('/admin/products/'),
    )
  })

  it('returns the reason as a result, not a thrown error', async () => {
    vi.spyOn(groupServer, 'resolveGroup').mockRejectedValue(new Error('Cat Toy: This product already belongs to another discount'))
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, selection)).toEqual({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
  })

  it('rejects input that is not a rule and picks, without looking anything up', async () => {
    const resolve = vi.spyOn(groupServer, 'resolveGroup')
    expect(await previewGroup('nope', selection)).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, { mode: 'x' })).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(resolve).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run tests/timeDiscounts/groupServer.test.ts tests/timeDiscounts/groupActions.test.ts`
Expected: FAIL — cannot resolve `@/timeDiscounts/groupServer` / `groupActions`.

- [ ] **Step 5: Implement `groupServer.ts`**

Create `src/timeDiscounts/groupServer.ts`:

```ts
import { resolveCollectionMembers } from '@/lib/collections'
import { getMemberInfo, getLowestVariantPrices } from '@/lib/products'
import { fetchAvailabilityConfigs, isAvailableEverywhere } from '@/lib/discount-availability'
import type { DiscountMember, GroupSpec, GroupSelection, TimeDiscountItem } from '@/timeDiscounts/config'
import { FUNCTION_CONFIG_MAX_BYTES, functionConfigBytes, itemKey, validateItemsStructure, validateRule } from '@/timeDiscounts/items'
import {
  EMPTY_SELECTION_MESSAGE, GROUP_RESOLVE_LIMIT, coveredRows, expandGroup, groupSizeMessage, summariseFailures,
  type CoveredRow, type Failure, type PriceInfo,
} from '@/timeDiscounts/group'

export interface ResolvedGroup {
  /** The rows to store and send to the checkout Function. */
  items: TimeDiscountItem[]
  /** What the discount covers, with prices, for the table. */
  covered: CoveredRow[]
}

/** The products/variants a selection stands for now. Collections are looked up (a snapshot), stopping once there are more than the limit. */
async function membersOf(selection: GroupSelection): Promise<DiscountMember[]> {
  if (selection.mode === 'products') {
    return selection.members.map(({ productId, variantId }) => ({ productId, ...(variantId ? { variantId } : {}) }))
  }
  if (selection.collections.length === 0) return []
  return resolveCollectionMembers(selection.collections.map((c) => c.id), GROUP_RESOLVE_LIMIT + 1)
}

/** Title and regular price per row key: variant rows from their own variant, whole-product rows from their CHEAPEST variant. */
async function regularPrices(items: TimeDiscountItem[]): Promise<Map<string, PriceInfo>> {
  const variantKeys = items.filter((i) => i.variantId).map((i) => ({ productId: i.productId, variantId: i.variantId }))
  const wholeProductIds = items.filter((i) => !i.variantId).map((i) => i.productId)
  const [variantInfo, lowest] = await Promise.all([getMemberInfo(variantKeys), getLowestVariantPrices(wholeProductIds)])

  const prices = new Map<string, PriceInfo>()
  for (const found of variantInfo) prices.set(itemKey(found), { title: found.title, price: found.price })
  for (const found of lowest) prices.set(itemKey({ productId: found.productId }), { title: found.title, price: found.price })
  return prices
}

/**
 * Everything the server needs to know about a group, in one place: what it
 * covers, whether every product can take the rule, and the rows to store.
 * Throws an Error whose message is what the merchant should read. Used by the
 * preview, by creating a group, and by every save on an existing one.
 * `excludeDiscountId` is the group's own id, so its current rows never count
 * as conflicts with themselves.
 */
export async function resolveGroup(
  group: GroupSpec,
  excludeDiscountId: string | undefined,
  adminProductBaseUrl: string,
  options: { allowEmpty?: boolean } = {},
): Promise<ResolvedGroup> {
  const ruleError = validateRule(group, null)
  if (ruleError) throw new Error(ruleError)

  const members = await membersOf(group.selection)
  if (members.length === 0) {
    if (options.allowEmpty) return { items: [], covered: [] }
    throw new Error(EMPTY_SELECTION_MESSAGE)
  }
  if (members.length > GROUP_RESOLVE_LIMIT) throw new Error(groupSizeMessage(members.length, true))

  const items = expandGroup(group, members)
  const structureError = validateItemsStructure(items)
  if (structureError) throw new Error(structureError)
  if (functionConfigBytes(items) > FUNCTION_CONFIG_MAX_BYTES) throw new Error(groupSizeMessage(items.length, false))

  const prices = await regularPrices(items)
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()

  const failures: Failure[] = []
  for (const item of items) {
    const found = prices.get(itemKey(item))
    const title = found?.title ?? `Product ${item.productId.split('/').pop()}`
    if (!found) {
      failures.push({ title, message: 'This product could not be found in Shopify' })
    } else if (!isAvailableEverywhere(productConfig, timeConfig, item.productId, item.variantId, excludeDiscountId)) {
      failures.push({ title, message: `This ${item.variantId ? 'variant' : 'product'} already belongs to another discount` })
    } else {
      const problem = validateRule(group, found.price)
      if (problem) failures.push({ title, message: problem })
    }
  }
  const message = summariseFailures(failures)
  if (message) throw new Error(message)

  return { items, covered: coveredRows(items, prices, adminProductBaseUrl) }
}

/** The table rows for rows that already exist (the discount page's first paint). A product that can no longer be found is left out. */
export async function loadCovered(items: TimeDiscountItem[], adminProductBaseUrl: string): Promise<CoveredRow[]> {
  return coveredRows(items, await regularPrices(items), adminProductBaseUrl)
}
```

- [ ] **Step 6: Implement `previewGroup`**

Create `src/timeDiscounts/groupActions.ts`:

```ts
'use server'

import { adminProductBaseUrl, errorMessage } from '@/timeDiscounts/shopifyRecord'
import { resolveGroup } from '@/timeDiscounts/groupServer'
import { cleanRule, cleanSelection, type PreviewResult } from '@/timeDiscounts/group'

/**
 * Answers "what would this group do?" without writing anything: the products
 * it covers and their prices, or the first thing wrong with it. Backs the new
 * group form, which cannot know what a collection holds until the server looks.
 * `excludeDiscountId` is the group's own id when previewing an existing one.
 */
export async function previewGroup(rule: unknown, selection: unknown, excludeDiscountId?: string): Promise<PreviewResult> {
  try {
    const group = { ...cleanRule(rule), selection: cleanSelection(selection) }
    const { covered } = await resolveGroup(group, excludeDiscountId, adminProductBaseUrl())
    return { ok: true, covered }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}
```

- [ ] **Step 7: Run all checks**

Run: `npx vitest run tests/timeDiscounts/groupServer.test.ts tests/timeDiscounts/groupActions.test.ts` → all PASS. Then `npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/timeDiscounts/groupServer.ts src/timeDiscounts/groupActions.ts tests/timeDiscounts/groupServer.test.ts tests/timeDiscounts/groupActions.test.ts
git commit -m "feat: resolve a group on the server and preview what it would do" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Create a group — the `createTimeDiscount` group path

**Files:**
- Modify: `src/timeDiscounts/actions.ts`, `tests/timeDiscounts/actions.test.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `resolveGroup` (Task 5), `parseGroupSpec` (Task 4), `adminProductBaseUrl` (Task 3).
- Produces: `createTimeDiscount(previous, formData)` now reads `kind`. For `kind === 'group'` it reads the JSON field `group` (`{ pricingMode, amount, selection }`), resolves it with `resolveGroup(group, undefined, adminProductBaseUrl())`, and creates the discount with `kind: 'group'`, the cleaned `group` and the derived `items`. Any other `kind` is a per-product discount exactly as before.

- [ ] **Step 1: Bump the version to `0.21.5`.**

- [ ] **Step 2: Write the failing tests**

In `tests/timeDiscounts/actions.test.ts` add `import * as groupServer from '@/timeDiscounts/groupServer'` and a new describe after the existing `createTimeDiscount` describe. It reuses `formData`, `sentToShopify`, `functionConfigSent`, `saveSpy`, `shopifyQuerySpy`, `redirectSpy` already defined in the file:

```ts
describe('createTimeDiscount — group', () => {
  const rule = { pricingMode: 'percent', amount: 20 }
  const selection = { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }
  const rows = [{ productId: P1, pricingMode: 'percent' as const, amount: 20 }, { productId: P2, pricingMode: 'percent' as const, amount: 20 }]
  const form = (over: Record<string, string> = {}) =>
    formData(Object.entries({
      title: 'Summer Sale', startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', kind: 'group',
      group: JSON.stringify({ ...rule, selection }), ...over,
    }))
  const created = () => shopifyQuerySpy.mockResolvedValueOnce({
    discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
  })
  let resolveSpy: MockInstance<typeof groupServer.resolveGroup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
    resolveSpy = vi.spyOn(groupServer, 'resolveGroup').mockResolvedValue({ items: rows, covered: [] })
  })
  afterEach(() => vi.useRealTimers())

  it('creates the discount with the rows the group expands to, and stores the group beside them', async () => {
    created()
    expect(await createTimeDiscount(null, form())).toEqual({ ok: true })

    expect(resolveSpy).toHaveBeenCalledWith({ ...rule, selection }, undefined, expect.stringContaining('/admin/products/'))
    expect(functionConfigSent().parsed).toEqual({ items: rows })
    const [saved] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(saved).toMatchObject({ kind: 'group', title: 'Summer Sale', items: rows, group: { ...rule, selection } })
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.objectContaining({ kind: 'group' }), 'Europe/London', undefined)
    expect(redirectSpy).toHaveBeenCalledWith(`/time-discounts/${encodeURIComponent(saved.discountId)}`)
  })

  it('creates nothing and shows the reason when the group cannot be resolved', async () => {
    resolveSpy.mockRejectedValue(new Error('Cat Toy: This product already belongs to another discount'))
    expect(await createTimeDiscount(null, form())).toEqual({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('creates nothing when the group cannot be read', async () => {
    expect(await createTimeDiscount(null, form({ group: 'not json' }))).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(resolveSpy).not.toHaveBeenCalled()
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('still refuses an end time that has already passed', async () => {
    vi.setSystemTime(new Date('2026-07-02T12:00:00Z'))
    expect(await createTimeDiscount(null, form())).toEqual({ ok: false, error: 'The end time has already passed. Choose a later end time.' })
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it('rolls back the Shopify record when saving the app config fails', async () => {
    created()
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [] } })
    saveSpy.mockRejectedValueOnce(new Error('metafield write failed'))
    expect(await createTimeDiscount(null, form())).toEqual({ ok: false, error: 'metafield write failed' })
    expect(shopifyQuerySpy).toHaveBeenLastCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/99' })
  })
})
```

(`afterEach` and `MockInstance` are already imported at the top of the file from earlier work; add them to the vitest import if the file does not have them.)

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/timeDiscounts/actions.test.ts -t "createTimeDiscount — group"`
Expected: FAIL (the action ignores `kind` and fails on the missing `items`).

- [ ] **Step 4: Implement**

In `src/timeDiscounts/actions.ts` add imports:

```ts
import { resolveGroup } from '@/timeDiscounts/groupServer'
import { parseGroupSpec } from '@/timeDiscounts/group'
import { adminProductBaseUrl } from '@/timeDiscounts/shopifyRecord'
```

(merge `adminProductBaseUrl` into the existing `shopifyRecord` import) and add `GroupSpec` to the `config` type import. Add this helper next to `buildItemsForNewDiscount`:

```ts
/** A new group: its picks are resolved now, and its rows come from them. */
async function buildGroupForNewDiscount(raw: string): Promise<{ items: TimeDiscountItem[]; group: GroupSpec }> {
  const group = parseGroupSpec(raw)
  const { items } = await resolveGroup(group, undefined, adminProductBaseUrl())
  return { items, group }
}
```

In `createDiscountFromForm`, replace the line that builds `items` and the three places that use it:

```ts
  const kind = formData.get('kind') === 'group' ? 'group' : 'perProduct'
  const content: { items: TimeDiscountItem[]; group?: GroupSpec } =
    kind === 'group'
      ? await buildGroupForNewDiscount(String(formData.get('group') ?? ''))
      : { items: await buildItemsForNewDiscount(String(formData.get('items') ?? '[]')) }

  const shopifyDiscountId = await createShopifyDiscountRecord({
    title,
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc,
    items: content.items,
  })

  const discountId = `time_disc_${crypto.randomUUID()}`
  const newDiscount: TimeDiscount = {
    discountId, shopifyDiscountId, name: title, title, kind, startsAt, endsAt, items: content.items,
    ...(content.group ? { group: content.group } : {}),
  }
```

(everything after — the config save with rollback, `syncBestEffort`, `return discountId` — stays as it is.)

- [ ] **Step 5: Run all checks and commit**

Run: `npx vitest run tests/timeDiscounts/actions.test.ts && npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: all PASS, clean.

```bash
git add package.json package-lock.json src/timeDiscounts/actions.ts tests/timeDiscounts/actions.test.ts
git commit -m "feat: create a group discount with its picks resolved into rows" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Save a group — rule and picks, storefront cleanup, and the kind guards

**Files:**
- Modify: `src/timeDiscounts/groupServer.ts`, `src/timeDiscounts/groupActions.ts`, `src/timeDiscounts/actions.ts`, `tests/timeDiscounts/groupActions.test.ts`, `tests/timeDiscounts/actions.test.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `saveGroupRule(discountId: string, rule: unknown): Promise<GroupSaveResult>` and `saveGroupSelection(discountId: string, selection: unknown): Promise<GroupSaveResult>` (`'use server'`). Each cleans its input, loads the discount, requires `kind === 'group'`, builds the new `GroupSpec`, runs `resolveGroup(group, discountId, adminProductBaseUrl(), { allowEmpty: true })`, updates the Shopify record's rows **first**, then saves the app config, then (best effort) updates the storefront metafields, and returns `{ ok: true, covered }` or `{ ok: false, error }`.
  - `syncGroupMetafields(before: TimeDiscountItem[], after: TimeDiscount, timezone: string): Promise<void>` in `groupServer.ts`: clears the storefront metafield of every product that was in `before` and is not in `after.items`, and syncs `after`'s rows.
  - `saveTimeDiscountItem` and `removeTimeDiscountItem` return `{ ok: false, error: GROUP_DISCOUNT_MESSAGE }` for a group discount.

- [ ] **Step 1: Bump the version to `0.21.6`.**

- [ ] **Step 2: Write the failing tests**

Replace the imports at the top of `tests/timeDiscounts/groupActions.test.ts` and append the new describes (keep the `previewGroup` describe from Task 5):

```ts
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { previewGroup, saveGroupRule, saveGroupSelection } from '@/timeDiscounts/groupActions'
import * as groupServer from '@/timeDiscounts/groupServer'
import * as timeConfigLib from '@/timeDiscounts/config'
import * as metafieldSync from '@/timeDiscounts/metafieldSync'
import * as shopLib from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'
import { NOT_A_GROUP_MESSAGE } from '@/timeDiscounts/group'
import type { TimeDiscount, GroupSpec } from '@/timeDiscounts/config'

const P2 = 'gid://shopify/Product/2'

const groupDiscount = (over: Partial<TimeDiscount> = {}): TimeDiscount => ({
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale', kind: 'group',
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  group: { pricingMode: 'percent', amount: 20, selection: { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }, { productId: P2, title: 'Dog Bed' }] } },
  items: [{ productId: P1, pricingMode: 'percent', amount: 20 }, { productId: P2, pricingMode: 'percent', amount: 20 }],
  ...over,
})
const rowsAt = (amount: number, ...ids: string[]) => ids.map((productId) => ({ productId, pricingMode: 'percent' as const, amount }))
```

then, below the `previewGroup` describe:

```ts
describe('saving a group', () => {
  let saveSpy: MockInstance<typeof timeConfigLib.saveTimeDiscountsConfig>
  let shopifyQuerySpy: MockInstance<typeof shopifyClient.shopifyQuery>
  let resolveSpy: MockInstance<typeof groupServer.resolveGroup>
  const covered = [{ productId: P1, title: 'Cat Toy', adminUrl: 'u', regularPrice: 10, discountedPrice: 7 }]

  function stored(discounts: TimeDiscount[]) {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockImplementation(async () => structuredClone({ discounts }))
  }

  beforeEach(() => {
    vi.spyOn(shopLib, 'getShopTimezone').mockResolvedValue('Europe/London')
    vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockResolvedValue(undefined)
    vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields').mockResolvedValue(undefined)
    saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })
    resolveSpy = vi.spyOn(groupServer, 'resolveGroup').mockResolvedValue({ items: rowsAt(30, P1, P2), covered })
    stored([groupDiscount()])
  })

  it('saves a new rule: checks it, updates Shopify first, stores the rows and the group, syncs, and returns the covered rows', async () => {
    const result = await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })

    expect(result).toEqual({ ok: true, covered })
    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pricingMode: 'percent', amount: 30 }), 'time_disc_1', expect.stringContaining('/admin/products/'), { allowEmpty: true },
    )
    const sent = (shopifyQuerySpy.mock.calls[0][1] as { automaticAppDiscount: { metafields: { value: string }[] } }).automaticAppDiscount
    expect(JSON.parse(sent.metafields[0].value)).toEqual({ items: rowsAt(30, P1, P2) })
    const [savedDiscount] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(savedDiscount.group).toMatchObject({ pricingMode: 'percent', amount: 30 })
    expect(savedDiscount.items).toEqual(rowsAt(30, P1, P2))
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalled()
    expect(metafieldSync.clearTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('saves new picks, and clears the storefront price of a product that is no longer covered', async () => {
    resolveSpy.mockResolvedValue({ items: rowsAt(20, P1), covered })
    const selection = { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }] }
    expect(await saveGroupSelection('time_disc_1', selection)).toEqual({ ok: true, covered })

    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P2 }])
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalled()
    const [savedDiscount] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(savedDiscount.group?.selection).toEqual(selection)
  })

  it('allows every pick to be removed: the discount applies to nothing and every product is cleared', async () => {
    resolveSpy.mockResolvedValue({ items: [], covered: [] })
    expect(await saveGroupSelection('time_disc_1', { mode: 'products', members: [] })).toEqual({ ok: true, covered: [] })
    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }, { productId: P2 }])
    expect(metafieldSync.syncTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('writes nothing when the group fails its checks', async () => {
    resolveSpy.mockRejectedValue(new Error('Cat Toy: The fixed price (£30.00) is not lower than the regular price (£10.00)'))
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'fixed', amount: 30 })).toEqual({ ok: false, error: expect.stringContaining('Cat Toy') })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    shopifyQuerySpy.mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [{ field: ['x'], message: 'Nope' }] } })
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: false, error: 'Nope' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('still reports success when only the storefront update fails (the discount is saved and live)', async () => {
    vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockRejectedValue(new Error('sync down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: true, covered })
  })

  it('refuses a per-product discount, an unknown discount, and input that is not a rule or picks', async () => {
    stored([groupDiscount({ kind: 'perProduct', group: undefined })])
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: false, error: NOT_A_GROUP_MESSAGE })
    expect(await saveGroupRule('missing', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: false, error: 'Time discount missing not found' })
    stored([groupDiscount()])
    expect(await saveGroupRule('time_disc_1', 'nope')).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(await saveGroupSelection('time_disc_1', { mode: 'x' })).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(saveSpy).not.toHaveBeenCalled()
  })
})
```

In `tests/timeDiscounts/actions.test.ts` add at the end:

```ts
describe('per-product actions and a group discount', () => {
  const group = (): TimeDiscount => discountWith([pct(P1, 10)], { kind: 'group', group: { pricingMode: 'percent', amount: 10, selection: { mode: 'products', members: [{ productId: P1, title: 'X' }] } } })

  it('refuse to add, change or remove a single row of a group', async () => {
    storedDiscounts([group()])
    const message = 'This is a group discount: change its shared price or its picks instead.'
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P2, pricingMode: 'percent', amount: 20 })).toEqual({ ok: false, error: message })
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: false, error: message })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('still lets a group be retitled and rescheduled', async () => {
    storedDiscounts([group()])
    expect(await saveTimeDiscountTitle('time_disc_1', 'New title')).toEqual({ ok: true })
    expect(await saveTimeDiscountSchedule('time_disc_1', '2026-07-01T12:00', '2026-07-02T12:00')).toEqual({ ok: true })
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/timeDiscounts/groupActions.test.ts tests/timeDiscounts/actions.test.ts`
Expected: FAIL — `saveGroupRule` / `saveGroupSelection` are not functions; the per-product guard test fails.

- [ ] **Step 4: Implement the storefront sync**

Append to `src/timeDiscounts/groupServer.ts` (add the imports `import { clearTimeDiscountMetafields, syncTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'` and `import type { TimeDiscount } from '@/timeDiscounts/config'`):

```ts
/**
 * Brings the storefront in line with a group's new rows: a product that was
 * covered and no longer is loses its sale price, and the rest are written.
 * (Without the clearing, a product dropped from the group would keep showing
 * a sale price that checkout no longer gives.) Throws if either step failed.
 */
export async function syncGroupMetafields(before: TimeDiscountItem[], after: TimeDiscount, timezone: string): Promise<void> {
  const stillCovered = new Set(after.items.map((item) => item.productId))
  const dropped = [...new Set(before.map((item) => item.productId))]
    .filter((productId) => !stillCovered.has(productId))
    .map((productId) => ({ productId }))

  const results = await Promise.allSettled([
    dropped.length > 0 ? clearTimeDiscountMetafields(dropped) : Promise.resolve(),
    after.items.length > 0 ? syncTimeDiscountMetafields(after, timezone) : Promise.resolve(),
  ])
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) throw new Error(failed.map((r) => r.reason?.message ?? String(r.reason)).join('; '))
}
```

- [ ] **Step 5: Implement the save actions**

Replace `src/timeDiscounts/groupActions.ts` with (keeps `previewGroup`):

```ts
'use server'

import { getTimeDiscountsConfig, saveTimeDiscountsConfig, type GroupSpec } from '@/timeDiscounts/config'
import { getShopTimezone } from '@/lib/shop'
import { adminProductBaseUrl, errorMessage, findDiscountOrThrow, updateShopifyDiscountRecord } from '@/timeDiscounts/shopifyRecord'
import { resolveGroup, syncGroupMetafields } from '@/timeDiscounts/groupServer'
import {
  NOT_A_GROUP_MESSAGE, cleanRule, cleanSelection, type GroupSaveResult, type PreviewResult,
} from '@/timeDiscounts/group'

/**
 * Answers "what would this group do?" without writing anything: the products
 * it covers and their prices, or the first thing wrong with it. Backs the new
 * group form, which cannot know what a collection holds until the server looks.
 * `excludeDiscountId` is the group's own id when previewing an existing one.
 */
export async function previewGroup(rule: unknown, selection: unknown, excludeDiscountId?: string): Promise<PreviewResult> {
  try {
    const group = { ...cleanRule(rule), selection: cleanSelection(selection) }
    const { covered } = await resolveGroup(group, excludeDiscountId, adminProductBaseUrl())
    return { ok: true, covered }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

/**
 * Saves a change to an existing group. The group is re-checked as a whole
 * (its own rows never count as conflicts), Shopify's record is updated FIRST
 * so a failure there leaves the app config untouched, and the storefront
 * update is best effort, like every other save.
 */
async function saveGroup(discountId: string, change: (group: GroupSpec) => GroupSpec): Promise<GroupSaveResult> {
  try {
    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)
    if (discount.kind !== 'group' || !discount.group) throw new Error(NOT_A_GROUP_MESSAGE)

    const group = change(discount.group)
    const { items, covered } = await resolveGroup(group, discountId, adminProductBaseUrl(), { allowEmpty: true })
    const timezone = await getShopTimezone()

    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { items })

    const itemsBefore = discount.items
    discount.group = group
    discount.items = items
    await saveTimeDiscountsConfig(config)

    try {
      await syncGroupMetafields(itemsBefore, discount, timezone)
    } catch (err) {
      console.error('[saveGroup] storefront metafield update failed (the discount is saved and live; the storefront may be stale for some products):', err)
    }
    return { ok: true, covered }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export async function saveGroupRule(discountId: string, rule: unknown): Promise<GroupSaveResult> {
  try {
    const cleaned = cleanRule(rule)
    return saveGroup(discountId, (group) => ({ ...group, ...cleaned }))
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export async function saveGroupSelection(discountId: string, selection: unknown): Promise<GroupSaveResult> {
  try {
    const cleaned = cleanSelection(selection)
    return saveGroup(discountId, (group) => ({ ...group, selection: cleaned }))
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}
```

- [ ] **Step 6: Guard the per-product actions**

In `src/timeDiscounts/actions.ts` import `GROUP_DISCOUNT_MESSAGE` from `@/timeDiscounts/group` and add, right after the `findDiscountOrThrow(config, discountId)` line in **both** `saveTimeDiscountItem` and `removeTimeDiscountItem`:

```ts
    if (discount.kind === 'group') throw new Error(GROUP_DISCOUNT_MESSAGE)
```

- [ ] **Step 7: Run all checks and commit**

Run: `npx vitest run tests/timeDiscounts && npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: all PASS, clean.

```bash
git add package.json package-lock.json src/timeDiscounts tests/timeDiscounts
git commit -m "feat: save a group's rule and picks, clear dropped products, guard per-product actions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Share the create form's submit and its title/schedule fields

Both create forms (per product, group) need the same submit wrapper and the same title and schedule inputs. This task moves them out of `NewTimeDiscountForm`, behaviour unchanged; its 25 existing tests are the safety net.

**Files:**
- Create: `src/timeDiscounts/newDiscountSubmit.ts`, `src/timeDiscounts/components/TitleScheduleFields.tsx`, `tests/timeDiscounts/newDiscountSubmit.test.ts`, `tests/timeDiscounts/components/TitleScheduleFields.test.tsx`
- Modify: `src/timeDiscounts/components/NewTimeDiscountForm.tsx`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `submitNewDiscount(previous: SaveResult | null, formData: FormData): Promise<SaveResult>` — calls `createTimeDiscount`; a rejected call becomes `UNREACHABLE`; a redirect error (`isRedirectError`) is re-thrown so the navigation happens.
  - `TitleScheduleFields` props: `{ title: string; startsAt: string; endsAt: string; problem: string | null; shopTimezone: string; onTitleChange(value: string): void; onStartsAtChange(value: string): void; onEndsAtChange(value: string): void }`. Renders two `<section className="mb-8">` blocks (title; schedule) with inputs `id`/`name` `title`, `startsAt`, `endsAt` and the schedule problem as `<p role="alert">`.

- [ ] **Step 1: Bump the version to `0.21.7`.**

- [ ] **Step 2: Write the failing tests**

`tests/timeDiscounts/newDiscountSubmit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitNewDiscount } from '@/timeDiscounts/newDiscountSubmit'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import * as actions from '@/timeDiscounts/actions'

vi.mock('@/timeDiscounts/actions', () => ({ createTimeDiscount: vi.fn() }))
const create = vi.mocked(actions.createTimeDiscount)
beforeEach(() => create.mockReset())

describe('submitNewDiscount', () => {
  it('passes the previous result and the form to createTimeDiscount and returns its result', async () => {
    create.mockResolvedValue({ ok: false, error: 'No' })
    const formData = new FormData()
    expect(await submitNewDiscount(null, formData)).toEqual({ ok: false, error: 'No' })
    expect(create).toHaveBeenCalledWith(null, formData)
  })

  it('turns a rejected call into the reload message', async () => {
    create.mockRejectedValue(new Error('network'))
    expect(await submitNewDiscount(null, new FormData())).toEqual(UNREACHABLE)
  })

  it('lets a redirect through so the page navigates', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/time-discounts/x;307;' })
    create.mockRejectedValue(redirect)
    await expect(submitNewDiscount(null, new FormData())).rejects.toBe(redirect)
  })
})
```

`tests/timeDiscounts/components/TitleScheduleFields.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import TitleScheduleFields from '@/timeDiscounts/components/TitleScheduleFields'

afterEach(cleanup)

function setup(over: Partial<React.ComponentProps<typeof TitleScheduleFields>> = {}) {
  const handlers = { onTitleChange: vi.fn(), onStartsAtChange: vi.fn(), onEndsAtChange: vi.fn() }
  render(<TitleScheduleFields title="Summer" startsAt="2026-07-01T12:00" endsAt="2026-07-02T12:00" problem={null} shopTimezone="Europe/London" {...handlers} {...over} />)
  return handlers
}

describe('TitleScheduleFields', () => {
  it('shows the values, named for the form, with the shop timezone in the labels', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer')
    expect(screen.getByLabelText('Title')).toHaveAttribute('name', 'title')
    expect(screen.getByLabelText('Starts (Europe/London)')).toHaveAttribute('name', 'startsAt')
    expect(screen.getByLabelText('Ends (Europe/London)')).toHaveValue('2026-07-02T12:00')
  })

  it('reports each change', () => {
    const { onTitleChange, onStartsAtChange, onEndsAtChange } = setup()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Winter' } })
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: '2026-08-01T00:00' } })
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: '2026-08-02T00:00' } })
    expect(onTitleChange).toHaveBeenCalledWith('Winter')
    expect(onStartsAtChange).toHaveBeenCalledWith('2026-08-01T00:00')
    expect(onEndsAtChange).toHaveBeenCalledWith('2026-08-02T00:00')
  })

  it('shows the schedule problem as an alert, and nothing otherwise', () => {
    setup({ problem: 'End must be after start.' })
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.')
    cleanup()
    setup()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/timeDiscounts/newDiscountSubmit.test.ts tests/timeDiscounts/components/TitleScheduleFields.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/timeDiscounts/newDiscountSubmit.ts`:

```ts
import { createTimeDiscount, type SaveResult } from '@/timeDiscounts/actions'
import { isRedirectError } from '@/timeDiscounts/rows'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'

/**
 * The form action of both create forms. A failure of the call itself becomes
 * the "reload the page" result; the redirect a successful create ends in
 * arrives as a thrown error and must go on to navigate, not be shown.
 */
export async function submitNewDiscount(previous: SaveResult | null, formData: FormData): Promise<SaveResult> {
  try {
    return await createTimeDiscount(previous, formData)
  } catch (err) {
    if (isRedirectError(err)) throw err
    return UNREACHABLE
  }
}
```

`src/timeDiscounts/components/TitleScheduleFields.tsx` (markup moved from `NewTimeDiscountForm`):

```tsx
'use client'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/** The title and schedule inputs of a create form. The form owns the values; this only shows them. */
export default function TitleScheduleFields({
  title, startsAt, endsAt, problem, shopTimezone, onTitleChange, onStartsAtChange, onEndsAtChange,
}: {
  title: string
  startsAt: string
  endsAt: string
  /** Why the schedule cannot be saved, or null. */
  problem: string | null
  shopTimezone: string
  onTitleChange: (value: string) => void
  onStartsAtChange: (value: string) => void
  onEndsAtChange: (value: string) => void
}) {
  return (
    <>
      <section className="mb-8">
        <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
        <input
          id="title" name="title" type="text" placeholder="e.g. Spring Flash Sale"
          value={title} onChange={(e) => onTitleChange(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" name="startsAt" type="datetime-local" value={startsAt} onChange={(e) => onStartsAtChange(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" name="endsAt" type="datetime-local" value={endsAt} onChange={(e) => onEndsAtChange(e.target.value)} className={inputClass} />
          </div>
        </div>
        {problem && <p role="alert" className="text-xs text-danger mt-2">{problem}</p>}
      </section>
    </>
  )
}
```

- [ ] **Step 5: Use them in `NewTimeDiscountForm`**

In `src/timeDiscounts/components/NewTimeDiscountForm.tsx`: delete the `inputClass` constant and the local `submit` function; delete the two `<section className="mb-8">` blocks for title and schedule; import and use the new pieces:

```tsx
import { submitNewDiscount } from '@/timeDiscounts/newDiscountSubmit'
import TitleScheduleFields from '@/timeDiscounts/components/TitleScheduleFields'
```

Change `useActionState(submit, null)` to `useActionState(submitNewDiscount, null)`; remove the now-unused imports (`createTimeDiscount`, `SaveResult`, `isRedirectError`, `UNREACHABLE`); and where the two sections were, render:

```tsx
        <TitleScheduleFields
          title={title} startsAt={startsAt} endsAt={endsAt} problem={problem} shopTimezone={shopTimezone}
          onTitleChange={setTitle} onStartsAtChange={setStartsAt} onEndsAtChange={setEndsAt}
        />
```

- [ ] **Step 6: Run all checks and commit**

Run: `npx vitest run tests/timeDiscounts && npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: all PASS — including the 25 unchanged `NewTimeDiscountForm` tests.

```bash
git add package.json package-lock.json src/timeDiscounts tests/timeDiscounts
git commit -m "refactor: share the create form's submit and its title and schedule fields" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The group form's building blocks — covered table, collection picker, rule fields, picks

**Files:**
- Create: `src/timeDiscounts/components/CoveredTable.tsx`, `CollectionPicker.tsx`, `GroupRuleFields.tsx`, `GroupPicks.tsx`; `tests/timeDiscounts/components/CoveredTable.test.tsx`, `CollectionPicker.test.tsx`, `GroupRuleFields.test.tsx`, `GroupPicks.test.tsx`
- Modify: `src/timeDiscounts/group.ts`, `tests/timeDiscounts/group.test.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `searchTimeDiscountCollectionsAction`, `AddItemPicker` (`{ excludeDiscountId?, existingKeys, onSelect }`), `GroupSelection`, `memberKeys`, `addMember`, `removeMember`, `switchMode`, `isSelectionEmpty` (Task 4), `itemKey`.
- Produces (pure, in `group.ts`):
  - `collectionsNotPicked(results: GroupCollection[], picked: GroupCollection[]): GroupCollection[]`
  - `withCollection(picked: GroupCollection[], collection: GroupCollection): GroupCollection[]` (no duplicate)
  - `withoutCollection(picked: GroupCollection[], id: string): GroupCollection[]`
  - `sameRule(a: Rule | null, b: Rule | null): boolean`
- Produces (components):
  - `CoveredTable({ rows: CoveredRow[]; emptyMessage: string })`
  - `CollectionPicker({ selected: GroupCollection[]; onChange(next: GroupCollection[]): void })`
  - `GroupRuleFields({ pricingMode; amountText; problem: string | null; onChange(pricingMode, amountText): void; disabled?: boolean })`
  - `GroupPicks({ selection: GroupSelection; onChange(selection: GroupSelection): void; excludeDiscountId?: string; disabled?: boolean })`

- [ ] **Step 1: Bump the version to `0.21.8`.**

- [ ] **Step 2: Write the failing tests for the new pure functions**

Add to the imports of `tests/timeDiscounts/group.test.ts`: `collectionsNotPicked, withCollection, withoutCollection, sameRule`, and append:

```ts
describe('collection picks', () => {
  const summer = { id: 'gid://shopify/Collection/1', title: 'Summer' }
  const winter = { id: 'gid://shopify/Collection/2', title: 'Winter' }

  it('hides collections that are already picked from the search results', () => {
    expect(collectionsNotPicked([summer, winter], [summer])).toEqual([winter])
  })
  it('adds a collection once and removes one by id', () => {
    expect(withCollection([summer], winter)).toEqual([summer, winter])
    expect(withCollection([summer], summer)).toEqual([summer])
    expect(withoutCollection([summer, winter], summer.id)).toEqual([winter])
  })
})

describe('sameRule', () => {
  it('compares two rules by value, and null only with null', () => {
    expect(sameRule({ pricingMode: 'percent', amount: 20 }, { pricingMode: 'percent', amount: 20 })).toBe(true)
    expect(sameRule({ pricingMode: 'percent', amount: 20 }, { pricingMode: 'fixed', amount: 20 })).toBe(false)
    expect(sameRule({ pricingMode: 'percent', amount: 20 }, { pricingMode: 'percent', amount: 25 })).toBe(false)
    expect(sameRule(null, null)).toBe(true)
    expect(sameRule(null, { pricingMode: 'percent', amount: 20 })).toBe(false)
  })
})
```

- [ ] **Step 3: Run to see it fail, then implement the four functions**

Run: `npx vitest run tests/timeDiscounts/group.test.ts` → FAIL (not functions). Append to `src/timeDiscounts/group.ts`:

```ts
/** Search results minus the collections already picked. */
export function collectionsNotPicked(results: GroupCollection[], picked: GroupCollection[]): GroupCollection[] {
  return results.filter((result) => !picked.some((p) => p.id === result.id))
}

export function withCollection(picked: GroupCollection[], collection: GroupCollection): GroupCollection[] {
  return picked.some((p) => p.id === collection.id) ? picked : [...picked, collection]
}

export function withoutCollection(picked: GroupCollection[], id: string): GroupCollection[] {
  return picked.filter((p) => p.id !== id)
}

export function sameRule(a: Rule | null, b: Rule | null): boolean {
  if (a === null || b === null) return a === b
  return a.pricingMode === b.pricingMode && a.amount === b.amount
}
```

Run again → PASS.

- [ ] **Step 4: Write the failing component tests**

`tests/timeDiscounts/components/CoveredTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import CoveredTable from '@/timeDiscounts/components/CoveredTable'

afterEach(cleanup)
const rows = [
  { productId: 'gid://shopify/Product/1', title: 'Cat Toy', adminUrl: 'https://shop/admin/products/1', regularPrice: 10, discountedPrice: 8 },
  { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Bed – Grey', adminUrl: 'https://shop/admin/products/2', regularPrice: 40, discountedPrice: 7.5 },
]

describe('CoveredTable', () => {
  it('lists each covered product with a link to its admin page and both prices', () => {
    render(<CoveredTable rows={rows} emptyMessage="Nothing yet" />)
    const link = screen.getByRole('link', { name: 'Cat Toy' })
    expect(link).toHaveAttribute('href', 'https://shop/admin/products/1')
    expect(link).toHaveAttribute('target', '_blank')
    const row = link.closest('tr')!
    expect(within(row).getByText('£8.00')).toBeInTheDocument()
    expect(within(row).getByText('£10.00')).toBeInTheDocument()
    expect(screen.getByText('£7.50')).toBeInTheDocument()
  })

  it('has no edit or delete buttons: rows follow the picks', () => {
    render(<CoveredTable rows={rows} emptyMessage="Nothing yet" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the empty message when nothing is covered', () => {
    render(<CoveredTable rows={[]} emptyMessage="Nothing yet" />)
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
```

`tests/timeDiscounts/components/GroupRuleFields.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import GroupRuleFields from '@/timeDiscounts/components/GroupRuleFields'

afterEach(cleanup)

describe('GroupRuleFields', () => {
  it('shows the type and the amount, labelled for the type', () => {
    const { rerender } = render(<GroupRuleFields pricingMode="percent" amountText="20" problem={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Discount type')).toHaveValue('percent')
    expect(screen.getByLabelText('Percent off')).toHaveValue(20)
    rerender(<GroupRuleFields pricingMode="fixed" amountText="7.5" problem={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Fixed price')).toHaveValue(7.5)
  })

  it('reports a new type with the amount as it is, and a new amount with the type as it is', async () => {
    const onChange = vi.fn()
    render(<GroupRuleFields pricingMode="percent" amountText="20" problem={null} onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    expect(onChange).toHaveBeenLastCalledWith('fixed', '20')
    fireEvent.change(screen.getByLabelText('Percent off'), { target: { value: '25' } })
    expect(onChange).toHaveBeenLastCalledWith('percent', '25')
  })

  it('shows the problem as an alert, and disables both inputs when disabled', () => {
    render(<GroupRuleFields pricingMode="percent" amountText="0" problem="Enter an amount greater than zero" onChange={() => {}} disabled />)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount greater than zero')
    expect(screen.getByLabelText('Discount type')).toBeDisabled()
    expect(screen.getByLabelText('Percent off')).toBeDisabled()
  })
})
```

`tests/timeDiscounts/components/CollectionPicker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import CollectionPicker from '@/timeDiscounts/components/CollectionPicker'
import * as pickerActions from '@/timeDiscounts/pickerActions'

const SUMMER = { id: 'gid://shopify/Collection/1', title: 'Summer' }
const WINTER = { id: 'gid://shopify/Collection/2', title: 'Winter' }
const SEARCH = 'Search for a collection to add…'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function search(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText(SEARCH), text)
  await vi.advanceTimersByTimeAsync(300)
}

describe('CollectionPicker', () => {
  it('shows each picked collection as a chip', () => {
    render(<CollectionPicker selected={[SUMMER]} onChange={() => {}} />)
    expect(screen.getByText('Summer')).toBeInTheDocument()
  })

  it('searches after a pause, hides collections already picked, and adds the chosen one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const searchAction = vi.spyOn(pickerActions, 'searchTimeDiscountCollectionsAction').mockResolvedValue([SUMMER, WINTER])
    const onChange = vi.fn()
    render(<CollectionPicker selected={[SUMMER]} onChange={onChange} />)

    await search(user, 'sea')
    expect(searchAction).toHaveBeenCalledWith('sea')
    const options = within(await screen.findByRole('list')).getAllByRole('button')
    expect(options.map((o) => o.textContent)).toEqual(['Winter']) // Summer is already a chip, not an option
    await user.pointer({ keys: '[MouseLeft]', target: options[0] })
    expect(onChange).toHaveBeenCalledWith([SUMMER, WINTER])
  })

  it('does not search for fewer than two characters', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const searchAction = vi.spyOn(pickerActions, 'searchTimeDiscountCollectionsAction').mockResolvedValue([])
    render(<CollectionPicker selected={[]} onChange={() => {}} />)
    await search(user, 's')
    expect(searchAction).not.toHaveBeenCalled()
  })

  it('removes a collection after confirming, and keeps it when declined', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onChange = vi.fn()
    render(<CollectionPicker selected={[SUMMER, WINTER]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove Summer' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Summer from this discount?')
    expect(onChange).toHaveBeenCalledWith([WINTER])

    onChange.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Remove Winter' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

`tests/timeDiscounts/components/GroupPicks.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import GroupPicks from '@/timeDiscounts/components/GroupPicks'
import type { GroupSelection } from '@/timeDiscounts/config'

// The search boxes have their own tests; here they are buttons that pick fixed things.
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect, existingKeys }: { onSelect: (item: object) => void; existingKeys: string[] }) => (
    <div data-testid="item-picker" data-existing={existingKeys.join(',')}>
      <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/2', title: 'Dog Bed', price: 40 })}>stub-add-bed</button>
    </div>
  ),
}))
vi.mock('@/timeDiscounts/components/CollectionPicker', () => ({
  default: ({ selected, onChange }: { selected: { id: string; title: string }[]; onChange: (next: object[]) => void }) => (
    <div data-testid="collection-picker">
      <span>{selected.length} collections</span>
      <button type="button" onClick={() => onChange([...selected, { id: 'gid://shopify/Collection/1', title: 'Summer' }])}>stub-add-collection</button>
    </div>
  ),
}))

const toys: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
const summer: GroupSelection = { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }

beforeEach(() => vi.spyOn(window, 'confirm').mockReturnValue(true))
afterEach(cleanup)

describe('GroupPicks', () => {
  it('in products mode shows chips and the product search, with picked products kept out of it', () => {
    render(<GroupPicks selection={toys} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Products and variants' })).toBeChecked()
    expect(screen.getByText('Cat Toy')).toBeInTheDocument()
    expect(screen.getByTestId('item-picker')).toHaveAttribute('data-existing', 'gid://shopify/Product/1|')
    expect(screen.queryByTestId('collection-picker')).not.toBeInTheDocument()
  })

  it('adds a picked product with its title', async () => {
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'stub-add-bed' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'products', members: [...toys.members, { productId: 'gid://shopify/Product/2', title: 'Dog Bed' }] })
  })

  it('removes a product after confirming, and keeps it when declined', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Cat Toy from this discount?')
    expect(onChange).toHaveBeenCalledWith({ mode: 'products', members: [] })

    onChange.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('in collections mode shows the collection picker and turns its changes into a selection', async () => {
    const onChange = vi.fn()
    render(<GroupPicks selection={summer} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Collections' })).toBeChecked()
    expect(screen.queryByTestId('item-picker')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'stub-add-collection' }))
    expect(onChange).toHaveBeenCalledWith({
      mode: 'collections',
      collections: [summer.collections[0], { id: 'gid://shopify/Collection/1', title: 'Summer' }],
    })
  })

  it('switching mode with picks asks first, and starts an empty selection of the other mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Collections' }))
    expect(window.confirm).toHaveBeenCalledWith('Switching replaces your current picks. Continue?')
    expect(onChange).toHaveBeenCalledWith({ mode: 'collections', collections: [] })
  })

  it('does not switch when the question is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Collections' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches without asking when nothing is picked yet', async () => {
    const onChange = vi.fn()
    render(<GroupPicks selection={{ mode: 'products', members: [] }} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Collections' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith({ mode: 'collections', collections: [] })
  })
})
```

- [ ] **Step 5: Run them to see them fail**

Run: `npx vitest run tests/timeDiscounts/components/CoveredTable.test.tsx tests/timeDiscounts/components/GroupRuleFields.test.tsx tests/timeDiscounts/components/CollectionPicker.test.tsx tests/timeDiscounts/components/GroupPicks.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 6: Implement the four components**

`src/timeDiscounts/components/CoveredTable.tsx`:

```tsx
'use client'

import type { CoveredRow } from '@/timeDiscounts/group'

const money = (value: number) => `£${value.toFixed(2)}`

/** What a group covers, read-only: rows follow the picks, so none of them is edited or deleted here. */
export default function CoveredTable({ rows, emptyMessage }: { rows: CoveredRow[]; emptyMessage: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted mb-3">{emptyMessage}</p>

  return (
    <table className="w-full mb-3 text-left">
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th scope="col" className="py-2 pr-3 font-medium">Product</th>
          <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">Discounted price</th>
          <th scope="col" className="py-2 font-medium whitespace-nowrap">Regular price</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.productId}|${row.variantId ?? ''}`} className="border-b border-line align-middle">
            <td className="py-3 pr-3">
              <a href={row.adminUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
                {row.title}
              </a>
            </td>
            <td className="py-3 pr-3 text-sm font-medium whitespace-nowrap">{money(row.discountedPrice)}</td>
            <td className="py-3 text-sm text-muted whitespace-nowrap">{money(row.regularPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

`src/timeDiscounts/components/GroupRuleFields.tsx`:

```tsx
'use client'

const controlClass =
  'border border-line rounded px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

/** The group's one shared rule: a type and an amount. The page owns the values. */
export default function GroupRuleFields({
  pricingMode, amountText, problem, onChange, disabled,
}: {
  pricingMode: 'percent' | 'fixed'
  amountText: string
  /** Why the rule cannot be saved, or null. */
  problem: string | null
  onChange: (pricingMode: 'percent' | 'fixed', amountText: string) => void
  disabled?: boolean
}) {
  const amountLabel = pricingMode === 'percent' ? 'Percent off' : 'Fixed price'
  return (
    <section className="mb-8">
      <h2 className="font-medium mb-2">Shared price</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="group-pricing-mode" className="block text-sm font-medium mb-2">Discount type</label>
          <select
            id="group-pricing-mode" value={pricingMode} disabled={disabled}
            onChange={(e) => onChange(e.target.value === 'fixed' ? 'fixed' : 'percent', amountText)}
            className={controlClass}
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed price</option>
          </select>
        </div>
        <div>
          <label htmlFor="group-amount" className="block text-sm font-medium mb-2">{amountLabel}</label>
          <input
            id="group-amount" type="number" min="0.01" max={pricingMode === 'percent' ? 100 : undefined} step="0.01"
            placeholder={pricingMode === 'percent' ? '% off (e.g. 20)' : 'Price each (e.g. 1.50)'}
            value={amountText} disabled={disabled}
            onChange={(e) => onChange(pricingMode, e.target.value)}
            className={`${controlClass} w-36`}
          />
        </div>
      </div>
      {problem && <p role="alert" className="text-xs text-danger mt-2">{problem}</p>}
    </section>
  )
}
```

`src/timeDiscounts/components/CollectionPicker.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { searchTimeDiscountCollectionsAction } from '@/timeDiscounts/pickerActions'
import { collectionsNotPicked, withCollection, withoutCollection } from '@/timeDiscounts/group'
import type { GroupCollection } from '@/timeDiscounts/config'

/**
 * Search box and chips for picking collections. It keeps no list of its own:
 * `selected` comes in, and every change goes out through `onChange`.
 */
export default function CollectionPicker({
  selected, onChange,
}: {
  selected: GroupCollection[]
  onChange: (next: GroupCollection[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GroupCollection[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      ++generationRef.current
      return
    }

    setSearching(true)
    const generation = ++generationRef.current
    debounceRef.current = setTimeout(async () => {
      const matches = await searchTimeDiscountCollectionsAction(value)
      if (generation === generationRef.current) {
        setResults(collectionsNotPicked(matches, selected))
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  function addCollection(collection: GroupCollection) {
    setQuery('')
    setResults([])
    setOpen(false)
    onChange(withCollection(selected, collection))
  }

  function removeCollection(collection: GroupCollection) {
    if (!window.confirm(`Remove ${collection.title} from this discount?`)) return
    onChange(withoutCollection(selected, collection.id))
  }

  return (
    <div>
      {selected.map((collection) => (
        <div key={collection.id} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <span className="text-sm truncate">{collection.title}</span>
          <button
            type="button" onClick={() => removeCollection(collection)} aria-label={`Remove ${collection.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <label htmlFor="time-discount-collection-search" className="sr-only">Search for a collection to add</label>
        <input
          id="time-discount-collection-search" type="text" placeholder="Search for a collection to add…"
          value={query} onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button" onMouseDown={() => addCollection(collection)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {collection.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

`src/timeDiscounts/components/GroupPicks.tsx`:

```tsx
'use client'

import { itemKey } from '@/timeDiscounts/items'
import { addMember, isSelectionEmpty, memberKeys, removeMember, switchMode } from '@/timeDiscounts/group'
import type { GroupMember, GroupSelection } from '@/timeDiscounts/config'
import AddItemPicker from '@/timeDiscounts/components/AddItemPicker'
import CollectionPicker from '@/timeDiscounts/components/CollectionPicker'

/** What a group is picked by: products and variants, or collections. The page owns the selection. */
export default function GroupPicks({
  selection, onChange, excludeDiscountId, disabled,
}: {
  selection: GroupSelection
  onChange: (selection: GroupSelection) => void
  /** The group's own id on its page, so its own products are not hidden from the search. */
  excludeDiscountId?: string
  disabled?: boolean
}) {
  function chooseMode(mode: 'products' | 'collections') {
    if (mode === selection.mode) return
    if (!isSelectionEmpty(selection) && !window.confirm('Switching replaces your current picks. Continue?')) return
    onChange(switchMode(selection, mode))
  }

  function removePick(member: GroupMember) {
    if (!window.confirm(`Remove ${member.title} from this discount?`)) return
    onChange(removeMember(selection, itemKey(member)))
  }

  return (
    <fieldset className="mb-8" disabled={disabled}>
      <legend className="font-medium mb-2">Pick by</legend>
      <div className="flex flex-wrap gap-4 mb-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="pick-mode" checked={selection.mode === 'products'} onChange={() => chooseMode('products')} />
          Products and variants
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pick-mode" checked={selection.mode === 'collections'} onChange={() => chooseMode('collections')} />
          Collections
        </label>
      </div>

      {selection.mode === 'products' ? (
        <div>
          {selection.members.map((member) => (
            <div key={itemKey(member)} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
              <span className="text-sm truncate">{member.title}</span>
              <button
                type="button" onClick={() => removePick(member)} aria-label={`Remove ${member.title}`}
                className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                Remove
              </button>
            </div>
          ))}
          <AddItemPicker excludeDiscountId={excludeDiscountId} existingKeys={memberKeys(selection)} onSelect={(item) => onChange(addMember(selection, item))} />
        </div>
      ) : (
        <CollectionPicker selected={selection.collections} onChange={(collections) => onChange({ mode: 'collections', collections })} />
      )}
    </fieldset>
  )
}
```

- [ ] **Step 7: Run all checks and commit**

Run: `npx vitest run tests/timeDiscounts && npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: all PASS, clean.

```bash
git add package.json package-lock.json src/timeDiscounts tests/timeDiscounts
git commit -m "feat: building blocks for the group forms (covered table, collection picker, rule fields, picks)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The new group form and its preview hook

**Files:**
- Create: `src/timeDiscounts/components/useGroupPreview.ts`, `src/timeDiscounts/components/NewGroupForm.tsx`, `tests/timeDiscounts/components/useGroupPreview.test.tsx`, `tests/timeDiscounts/components/NewGroupForm.test.tsx`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `previewGroup` (Task 5), `submitNewDiscount`, `TitleScheduleFields` (Task 8), `GroupRuleFields`, `GroupPicks`, `CoveredTable` (Task 9), `groupSaveBlocker`, `parseRuleInput`, `previewKey`, `isSelectionEmpty`, `selectionCount` (Task 4), `endTimeHasPassed`, `scheduleProblem`, `shopLocalNow` (`items.ts`), `hasUnsavedWork` (`rows.ts`), `UNREACHABLE`.
- Produces:
  - `PREVIEW_DELAY_MS = 600`; `type PreviewState = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; covered: CoveredRow[] } | { status: 'error'; error: string }`
  - `useGroupPreview(rule: Rule | null, selection: GroupSelection, excludeDiscountId?: string): PreviewState` — `idle` when there is no valid rule or no pick; otherwise `loading` until the answer for the **current** inputs arrives, 600 ms after the last change; an answer for older inputs is ignored; a rejected call is `{ status: 'error', error: UNREACHABLE.error }`.
  - `NewGroupForm({ shopTimezone: string })`: the group create form. Hidden fields: `kind` = `group`, `group` = JSON of `{ pricingMode, amount, selection }` (empty string while the rule is not valid).

- [ ] **Step 1: Bump the version to `0.21.9`.**

- [ ] **Step 2: Write the failing tests for the hook**

`tests/timeDiscounts/components/useGroupPreview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroupPreview, PREVIEW_DELAY_MS } from '@/timeDiscounts/components/useGroupPreview'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import * as groupActions from '@/timeDiscounts/groupActions'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { PreviewResult } from '@/timeDiscounts/group'

vi.mock('@/timeDiscounts/groupActions', () => ({ previewGroup: vi.fn() }))
const preview = vi.mocked(groupActions.previewGroup)

const rule = { pricingMode: 'percent' as const, amount: 20 }
const one: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
const two: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }, { productId: 'gid://shopify/Product/2', title: 'Dog Bed' }] }
const rowsOf = (title: string) => [{ productId: 'p', title, adminUrl: 'u', regularPrice: 10, discountedPrice: 8 }]

beforeEach(() => {
  preview.mockReset()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useGroupPreview', () => {
  it('is idle without a valid rule or without any pick, and asks nothing', () => {
    expect(renderHook(() => useGroupPreview(null, one)).result.current).toEqual({ status: 'idle' })
    expect(renderHook(() => useGroupPreview(rule, { mode: 'products', members: [] })).result.current).toEqual({ status: 'idle' })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(preview).not.toHaveBeenCalled()
  })

  it('shows loading, then asks once after the pause, then shows the answer', async () => {
    preview.mockResolvedValue({ ok: true, covered: rowsOf('Cat Toy') })
    const { result } = renderHook(() => useGroupPreview(rule, one, 'time_disc_1'))
    expect(result.current).toEqual({ status: 'loading' })
    expect(preview).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(rule, one, 'time_disc_1')
    expect(result.current).toEqual({ status: 'ok', covered: rowsOf('Cat Toy') })
  })

  it('shows the reason when the server refuses the group', async () => {
    preview.mockResolvedValue({ ok: false, error: 'Cat Toy: already in another discount' })
    const { result } = renderHook(() => useGroupPreview(rule, one))
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(result.current).toEqual({ status: 'error', error: 'Cat Toy: already in another discount' })
  })

  it('shows the reload message when the call itself is rejected', async () => {
    preview.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useGroupPreview(rule, one))
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(result.current).toEqual({ status: 'error', error: UNREACHABLE.error })
  })

  it('waits for the changes to stop: only the last inputs are asked about', async () => {
    preview.mockResolvedValue({ ok: true, covered: rowsOf('x') })
    const { rerender } = renderHook(({ selection }) => useGroupPreview(rule, selection), { initialProps: { selection: one } })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS - 100) })
    rerender({ selection: two })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(rule, two, undefined)
  })

  it('ignores an older answer that arrives after a newer question was asked', async () => {
    let answerFirst: (value: PreviewResult) => void = () => {}
    preview
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
      .mockResolvedValueOnce({ ok: true, covered: rowsOf('second') })
    const { result, rerender } = renderHook(({ selection }) => useGroupPreview(rule, selection), { initialProps: { selection: one } })

    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) }) // first question asked, not answered
    rerender({ selection: two })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) }) // second asked and answered
    expect(result.current).toEqual({ status: 'ok', covered: rowsOf('second') })

    await act(async () => { answerFirst({ ok: true, covered: rowsOf('first') }) }) // the old answer finally arrives
    expect(result.current).toEqual({ status: 'ok', covered: rowsOf('second') })
  })

  it('goes back to loading when the inputs change after an answer', async () => {
    preview.mockResolvedValue({ ok: true, covered: rowsOf('x') })
    const { result, rerender } = renderHook(({ selection }) => useGroupPreview(rule, selection), { initialProps: { selection: one } })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(result.current.status).toBe('ok')
    rerender({ selection: two })
    expect(result.current).toEqual({ status: 'loading' })
  })
})
```

- [ ] **Step 3: Write the failing tests for the form**

`tests/timeDiscounts/components/NewGroupForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewGroupForm from '@/timeDiscounts/components/NewGroupForm'
import { PREVIEW_DELAY_MS } from '@/timeDiscounts/components/useGroupPreview'
import * as actions from '@/timeDiscounts/actions'
import * as groupActions from '@/timeDiscounts/groupActions'

vi.mock('@/timeDiscounts/actions', () => ({ createTimeDiscount: vi.fn() }))
vi.mock('@/timeDiscounts/groupActions', () => ({ previewGroup: vi.fn() }))
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect }: { onSelect: (item: object) => void }) => (
    <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/1', title: 'Cat Toy', price: 10 })}>stub-add-toy</button>
  ),
}))
vi.mock('@/timeDiscounts/components/CollectionPicker', () => ({
  default: () => <div data-testid="collection-picker" />,
}))

const create = vi.mocked(actions.createTimeDiscount)
const preview = vi.mocked(groupActions.previewGroup)
const covered = [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy', adminUrl: 'https://shop/admin/products/1', regularPrice: 10, discountedPrice: 8 }]
const NOW = '2026-06-01T00:00:00Z' // 01:00 on the shop's clock (BST)

const saveButton = () => screen.getByRole('button', { name: 'Save discount' })
type User = ReturnType<typeof userEvent.setup>

async function fillBasics(user: User) {
  await user.type(screen.getByLabelText('Title'), 'Summer Sale')
  await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
  await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
  await user.type(screen.getByLabelText('Percent off'), '20')
}
async function pickToy(user: User) {
  await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
  await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS)
}

beforeEach(() => {
  create.mockReset()
  preview.mockReset()
  preview.mockResolvedValue({ ok: true, covered })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<NewGroupForm shopTimezone="Europe/London" />)
  return user
}

describe('NewGroupForm', () => {
  it('shows the title, schedule, shared price, picks and covered products, with Save last and off', () => {
    setup()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText(/Starts/)).toBeInTheDocument()
    expect(screen.getByLabelText('Discount type')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Products and variants' })).toBeChecked()
    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 1]).toBe(saveButton())
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Add a title to save.')).toBeInTheDocument()
  })

  it('keeps Save off until the title, schedule, price and a pick are there, and the preview is ok', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    expect(screen.getByText('Set a start and an end time to save.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(screen.getByText('Enter the shared price to save.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Percent off'), '20')
    expect(screen.getByText('Pick at least one product, variant or collection to save.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
    expect(screen.getByText('Checking the products…', { selector: '#save-hint' })).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS)
    expect(await screen.findByRole('link', { name: 'Cat Toy' })).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('asks the server about the rule and the picks, and shows what is covered', async () => {
    const user = setup()
    await fillBasics(user)
    await pickToy(user)
    expect(preview).toHaveBeenLastCalledWith(
      { pricingMode: 'percent', amount: 20 },
      { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] },
      undefined,
    )
    expect(await screen.findByText('£8.00')).toBeInTheDocument()
  })

  it('shows the reason and keeps Save off when the preview fails', async () => {
    preview.mockResolvedValue({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
    const user = setup()
    await fillBasics(user)
    await pickToy(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cat Toy: This product already belongs to another discount')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Fix the problem shown above to save.')).toBeInTheDocument()
  })

  it('does not ask the server while the shared price is not valid', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Percent off'), '150')
    await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS)
    expect(preview).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A percentage discount cannot exceed 100%')
  })

  it('sends the kind, the title, the schedule and the whole group in one request', async () => {
    const user = setup()
    create.mockResolvedValue({ ok: true })
    await fillBasics(user)
    await pickToy(user)
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const formData = create.mock.calls[0][1] as FormData
    expect(formData.get('kind')).toBe('group')
    expect(formData.get('title')).toBe('Summer Sale')
    expect(formData.get('startsAt')).toBe('2026-07-01T12:00')
    expect(formData.get('endsAt')).toBe('2026-07-02T12:00')
    expect(JSON.parse(String(formData.get('group')))).toEqual({
      pricingMode: 'percent', amount: 20,
      selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] },
    })
  })

  it('shows the server\'s reason next to Save, keeping what was entered', async () => {
    const user = setup()
    create.mockResolvedValue({ ok: false, error: 'Shopify said no' })
    await fillBasics(user)
    await pickToy(user)
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await user.click(saveButton())
    expect(await screen.findByText('Shopify said no')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
  })

  it('checks the clock again as Save is pressed, and sends nothing when the end time has passed', async () => {
    const user = setup()
    create.mockResolvedValue({ ok: true })
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-06-01T00:30')
    await user.type(screen.getByLabelText(/Ends/), '2026-06-01T01:30') // ends 01:30; it is 01:00
    await user.type(screen.getByLabelText('Percent off'), '20')
    await pickToy(user)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    vi.setSystemTime(new Date('2026-06-01T00:45:00Z')) // 01:45 on the shop's clock
    await user.click(saveButton())

    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText('The end time has already passed. Choose a later end time.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('warns before the page is closed once something has been entered, and not while saving', async () => {
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event
    }
    const user = setup()
    expect(unload().defaultPrevented).toBe(false)
    await user.type(screen.getByLabelText('Title'), 'Summer')
    expect(unload().defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run tests/timeDiscounts/components/useGroupPreview.test.tsx tests/timeDiscounts/components/NewGroupForm.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement the hook**

`src/timeDiscounts/components/useGroupPreview.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { previewGroup } from '@/timeDiscounts/groupActions'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import { isSelectionEmpty, previewKey, type CoveredRow, type PreviewResult } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { Rule } from '@/timeDiscounts/rows'

/** How long after the last change to the rule or the picks the server is asked. */
export const PREVIEW_DELAY_MS = 600

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; covered: CoveredRow[] }
  | { status: 'error'; error: string }

const IDLE: PreviewState = { status: 'idle' }
const LOADING: PreviewState = { status: 'loading' }

/**
 * Asks the server what a group would do (see `previewGroup`) once the rule and
 * the picks have stopped changing. `idle` without a valid rule or without a
 * pick; `loading` until the answer for the CURRENT inputs arrives. An answer
 * for inputs that have since changed is ignored, so a slow older reply can
 * never replace a newer one.
 */
export function useGroupPreview(rule: Rule | null, selection: GroupSelection, excludeDiscountId?: string): PreviewState {
  const [answer, setAnswer] = useState<{ key: string; result: PreviewResult } | null>(null)
  const generation = useRef(0)
  const latest = useRef({ rule, selection })
  const key = rule !== null && !isSelectionEmpty(selection) ? previewKey(rule, selection) : null

  useEffect(() => {
    latest.current = { rule, selection }
  })

  useEffect(() => {
    if (key === null) return
    const mine = generation.current
    const timer = setTimeout(() => {
      const { rule: asked, selection: picks } = latest.current
      if (asked === null) return
      previewGroup(asked, picks, excludeDiscountId).then(
        (result) => {
          if (generation.current === mine) setAnswer({ key, result })
        },
        () => {
          if (generation.current === mine) setAnswer({ key, result: { ok: false, error: UNREACHABLE.error } })
        },
      )
    }, PREVIEW_DELAY_MS)
    return () => {
      generation.current += 1
      clearTimeout(timer)
    }
  }, [key, excludeDiscountId])

  if (key === null) return IDLE
  if (answer === null || answer.key !== key) return LOADING
  return answer.result.ok ? { status: 'ok', covered: answer.result.covered } : { status: 'error', error: answer.result.error }
}
```

- [ ] **Step 6: Implement the form**

`src/timeDiscounts/components/NewGroupForm.tsx`:

```tsx
'use client'

import { useActionState, useEffect, useReducer, useState } from 'react'
import { submitNewDiscount } from '@/timeDiscounts/newDiscountSubmit'
import { endTimeHasPassed, scheduleProblem, shopLocalNow } from '@/timeDiscounts/items'
import { hasUnsavedWork } from '@/timeDiscounts/rows'
import { groupSaveBlocker, isSelectionEmpty, parseRuleInput, selectionCount } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import TitleScheduleFields from '@/timeDiscounts/components/TitleScheduleFields'
import GroupRuleFields from '@/timeDiscounts/components/GroupRuleFields'
import GroupPicks from '@/timeDiscounts/components/GroupPicks'
import CoveredTable from '@/timeDiscounts/components/CoveredTable'
import { useGroupPreview } from '@/timeDiscounts/components/useGroupPreview'

const NO_PICKS: GroupSelection = { mode: 'products', members: [] }

/**
 * Title, schedule, shared price and picks on one page. Nothing exists in
 * Shopify until Save is pressed on a complete form, and Save waits for the
 * server to confirm what the picks cover (a collection can only be looked up
 * there) and that the rule suits every product.
 */
export default function NewGroupForm({ shopTimezone }: { shopTimezone: string }) {
  const [state, formAction, pending] = useActionState(submitNewDiscount, null)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>('percent')
  const [amountText, setAmountText] = useState('')
  const [selection, setSelection] = useState<GroupSelection>(NO_PICKS)

  // Read the clock each time Save's state is worked out, rather than from a timer that could be stale.
  const problem = scheduleProblem(startsAt, endsAt, shopLocalNow(shopTimezone, new Date()))
  // Bumped to work Save's state out again after a submit was stopped because the end time had passed.
  const [, recheck] = useReducer((count: number) => count + 1, 0)
  const { rule, problem: ruleProblem } = parseRuleInput(pricingMode, amountText)
  const preview = useGroupPreview(rule, selection)
  const missing = groupSaveBlocker({
    title, startsAt, endsAt, scheduleProblem: problem, amountText, ruleProblem, selectionEmpty: isSelectionEmpty(selection), preview,
  })

  // The draft lives only in this page, so closing or reloading it would lose it.
  const hasWork = hasUnsavedWork({ title, startsAt, endsAt, rowCount: selectionCount(selection) + (amountText !== '' ? 1 : 0) })
  useEffect(() => {
    if (!hasWork || pending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasWork, pending])

  const groupJson = rule ? JSON.stringify({ ...rule, selection }) : ''

  return (
    <form
      action={formAction}
      // The end time may have passed since Save last looked enabled: check the clock again right before submitting.
      onSubmit={(e) => {
        if (endTimeHasPassed(endsAt, shopTimezone, new Date())) {
          e.preventDefault()
          recheck()
        }
      }}
      // Enter in a text box (the title, a search) must not save the whole discount.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
      }}
    >
      <input type="hidden" name="kind" value="group" />
      <input type="hidden" name="group" value={groupJson} />

      <TitleScheduleFields
        title={title} startsAt={startsAt} endsAt={endsAt} problem={problem} shopTimezone={shopTimezone}
        onTitleChange={setTitle} onStartsAtChange={setStartsAt} onEndsAtChange={setEndsAt}
      />

      <GroupRuleFields
        pricingMode={pricingMode} amountText={amountText} problem={ruleProblem} disabled={pending}
        onChange={(mode, text) => { setPricingMode(mode); setAmountText(text) }}
      />

      <GroupPicks selection={selection} onChange={setSelection} disabled={pending} />

      <section className="mb-8">
        <h2 className="font-medium mb-2">Covered products</h2>
        {preview.status === 'loading' && <p className="text-sm text-muted mb-3">Checking the products…</p>}
        {preview.status === 'error' && <p role="alert" className="text-sm text-danger mb-3">{preview.error}</p>}
        {preview.status === 'ok' && <CoveredTable rows={preview.covered} emptyMessage="This selection covers no products." />}
        {preview.status === 'idle' && <p className="text-sm text-muted mb-3">Set the shared price and pick products or a collection to see what this discount covers.</p>}
      </section>

      <section>
        <button
          type="submit" disabled={missing !== null || pending}
          aria-describedby={missing ? 'save-hint' : undefined}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
        >
          {pending ? 'Saving…' : 'Save discount'}
        </button>
        {missing && <p id="save-hint" className="text-xs text-muted mt-2">{missing}</p>}
        {state && !state.ok && <p role="alert" className="text-sm text-danger mt-3">{state.error}</p>}
      </section>
    </form>
  )
}
```

- [ ] **Step 7: Run all checks and commit**

Run: `npx vitest run tests/timeDiscounts && npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: all PASS, clean. If `eslint` flags a hook rule in `useGroupPreview.ts`, fix the code to satisfy it (do not disable the rule) while keeping the behaviour the tests pin.

```bash
git add package.json package-lock.json src/timeDiscounts tests/timeDiscounts
git commit -m "feat: the new group form, with a preview of what the group covers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The group page — autosave of title, schedule, rule and picks

**Files:**
- Create: `src/timeDiscounts/components/useTitleSchedule.ts`, `src/timeDiscounts/components/GroupDiscountEditor.tsx`, `tests/timeDiscounts/components/GroupDiscountEditor.test.tsx`
- Modify: `src/timeDiscounts/components/TimeDiscountEditor.tsx`, `src/timeDiscounts/saveRequests.ts`, `tests/timeDiscounts/saveRequests.test.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `useTitleSchedule({ discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved })` returning `{ title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid }` — the autosaving title (saves on blur) and schedule (saves 600 ms after both dates are valid and settled), **moved verbatim** out of `TimeDiscountEditor`, which keeps exporting `SCHEDULE_SAVE_DELAY_MS`. The 34 existing `TimeDiscountEditor` tests must pass unchanged.
  - `requestGroupRuleSave(enqueue, discountId, rule: Rule): Promise<GroupSaveResult>` and `requestGroupSelectionSave(enqueue, discountId, selection: GroupSelection): Promise<GroupSaveResult>` in `saveRequests.ts`; a rejected call resolves to `UNREACHABLE`. `UNREACHABLE` becomes `{ ok: false as const, error: ... }` so it fits both result types.
  - `GroupDiscountEditor({ discountId, shopTimezone, initialTitle, initialStartsAt, initialEndsAt, initialPricingMode, initialAmount, initialSelection, initialCovered, deleteAction })`.

- [ ] **Step 1: Bump the version to `0.21.10`.**

- [ ] **Step 2: Move the title/schedule autosave into a hook (no behaviour change)**

Create `src/timeDiscounts/components/useTitleSchedule.ts`. Cut these pieces **verbatim** out of `TimeDiscountEditor.tsx` and paste them into the hook function body: the state/ref declarations for the title (`title`, `titleError`, `savedTitle`, `requestedTitle`), for the schedule (`startsAt`, `endsAt`, `scheduleError`, `savedSchedule`, `requestedSchedule`, `scheduleInvalid`), `saveTitle`, and the schedule `useEffect`. Also move the exported constant `SCHEDULE_SAVE_DELAY_MS = 600` (with its doc comment) there. Shape:

```ts
import { useEffect, useRef, useState } from 'react'
import { scheduleProblem } from '@/timeDiscounts/items'
import { settledTitle, shouldSaveSchedule, titleSaveDecision } from '@/timeDiscounts/rows'
import { requestScheduleSave, requestTitleSave, type Enqueue } from '@/timeDiscounts/saveRequests'

/** How long after the last change to either date the schedule is saved. */
export const SCHEDULE_SAVE_DELAY_MS = 600

/**
 * The title (saved when its box loses focus) and the schedule (saved once
 * both dates are valid and have settled) of an existing discount. Saves are
 * queued by the caller's `enqueue`; a success calls `showSaved`.
 */
export function useTitleSchedule({
  discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved,
}: {
  discountId: string
  initialTitle: string
  initialStartsAt: string
  initialEndsAt: string
  enqueue: Enqueue
  showSaved: () => void
}) {
  // ...the moved declarations, saveTitle and the schedule effect, exactly as they are in TimeDiscountEditor...
  return { title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid }
}
```

In `TimeDiscountEditor.tsx`, replace the moved code with:

```tsx
  const { title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid } =
    useTitleSchedule({ discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved })
```

import the hook, re-export the constant so the tests' import keeps working (`export { SCHEDULE_SAVE_DELAY_MS } from '@/timeDiscounts/components/useTitleSchedule'`), and remove imports that are now unused.

Run: `npx vitest run tests/timeDiscounts/components/TimeDiscountEditor.test.tsx && npx tsc --noEmit -p .` — all 34 PASS unchanged, no type errors. Commit nothing yet.

- [ ] **Step 3: Write the failing tests for the group save requests**

In `tests/timeDiscounts/saveRequests.test.ts` extend the `vi.mock('@/timeDiscounts/actions', ...)` is for the per-product actions; add a second mock and tests:

```ts
vi.mock('@/timeDiscounts/groupActions', () => ({ saveGroupRule: vi.fn(), saveGroupSelection: vi.fn() }))
import * as groupActions from '@/timeDiscounts/groupActions'
import { requestGroupRuleSave, requestGroupSelectionSave } from '@/timeDiscounts/saveRequests'

describe('requestGroupRuleSave', () => {
  it('queues the new rule for that discount and returns the result', async () => {
    vi.mocked(groupActions.saveGroupRule).mockResolvedValue({ ok: true, covered: [] })
    expect(await requestGroupRuleSave(makeEnqueue(), 'time_disc_1', { pricingMode: 'fixed', amount: 7.5 })).toEqual({ ok: true, covered: [] })
    expect(groupActions.saveGroupRule).toHaveBeenCalledWith('time_disc_1', { pricingMode: 'fixed', amount: 7.5 })
  })
  it('turns a rejected call into the reload message', async () => {
    vi.mocked(groupActions.saveGroupRule).mockRejectedValue(new Error('network'))
    expect(await requestGroupRuleSave(makeEnqueue(), 'time_disc_1', { pricingMode: 'percent', amount: 5 })).toEqual(UNREACHABLE)
  })
})

describe('requestGroupSelectionSave', () => {
  const selection = { mode: 'products' as const, members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
  it('queues the new picks for that discount and returns the result', async () => {
    vi.mocked(groupActions.saveGroupSelection).mockResolvedValue({ ok: false, error: 'No' })
    expect(await requestGroupSelectionSave(makeEnqueue(), 'time_disc_1', selection)).toEqual({ ok: false, error: 'No' })
    expect(groupActions.saveGroupSelection).toHaveBeenCalledWith('time_disc_1', selection)
  })
  it('turns a rejected call into the reload message', async () => {
    vi.mocked(groupActions.saveGroupSelection).mockRejectedValue(new Error('stale action'))
    expect(await requestGroupSelectionSave(makeEnqueue(), 'time_disc_1', selection)).toEqual(UNREACHABLE)
  })
})
```

(`makeEnqueue` and `UNREACHABLE` are already in that file; add the new imports to the existing import lines rather than duplicating them.) Run → FAIL (functions missing). Then implement in `src/timeDiscounts/saveRequests.ts`:

```ts
import { saveGroupRule, saveGroupSelection } from '@/timeDiscounts/groupActions'
import type { GroupSaveResult } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'

// change the existing constant so it fits both result types:
export const UNREACHABLE = { ok: false as const, error: "Couldn't reach the server — reload the page and try again" } satisfies SaveResult

export function requestGroupRuleSave(enqueue: Enqueue, discountId: string, rule: Rule): Promise<GroupSaveResult> {
  return enqueue(() => saveGroupRule(discountId, rule)).catch(unreachable)
}

export function requestGroupSelectionSave(enqueue: Enqueue, discountId: string, selection: GroupSelection): Promise<GroupSaveResult> {
  return enqueue(() => saveGroupSelection(discountId, selection)).catch(unreachable)
}
```

Run `npx vitest run tests/timeDiscounts/saveRequests.test.ts && npx tsc --noEmit -p .` → PASS.

- [ ] **Step 4: Write the failing tests for the group page**

`tests/timeDiscounts/components/GroupDiscountEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import GroupDiscountEditor from '@/timeDiscounts/components/GroupDiscountEditor'
import { SavedToastProvider } from '@/components/SavedToast'
import { RULE_SAVE_DELAY_MS } from '@/timeDiscounts/group'
import * as actions from '@/timeDiscounts/actions'
import * as groupActions from '@/timeDiscounts/groupActions'
import type { GroupSelection } from '@/timeDiscounts/config'

vi.mock('@/timeDiscounts/actions', () => ({
  saveTimeDiscountTitle: vi.fn(), saveTimeDiscountSchedule: vi.fn(), saveTimeDiscountItem: vi.fn(), removeTimeDiscountItem: vi.fn(),
}))
vi.mock('@/timeDiscounts/groupActions', () => ({ saveGroupRule: vi.fn(), saveGroupSelection: vi.fn() }))
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect }: { onSelect: (item: object) => void }) => (
    <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/2', title: 'Dog Bed', price: 40 })}>stub-add-bed</button>
  ),
}))
vi.mock('@/timeDiscounts/components/CollectionPicker', () => ({ default: () => <div data-testid="collection-picker" /> }))

const saveRule = vi.mocked(groupActions.saveGroupRule)
const saveSelection = vi.mocked(groupActions.saveGroupSelection)
const saveTitle = vi.mocked(actions.saveTimeDiscountTitle)

const toys: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
const row = (title: string, discounted: number) => ({ productId: 'gid://shopify/Product/1', title, adminUrl: 'https://shop/admin/products/1', regularPrice: 10, discountedPrice: discounted })

function setup(over: Partial<React.ComponentProps<typeof GroupDiscountEditor>> = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const deleteAction = vi.fn().mockResolvedValue(undefined)
  render(
    <SavedToastProvider>
      <GroupDiscountEditor
        discountId="time_disc_1" shopTimezone="Europe/London"
        initialTitle="Summer Sale" initialStartsAt="2026-07-01T12:00" initialEndsAt="2026-07-02T12:00"
        initialPricingMode="percent" initialAmount={20} initialSelection={toys} initialCovered={[row('Cat Toy', 8)]}
        deleteAction={deleteAction} {...over}
      />
    </SavedToastProvider>,
  )
  return { user, deleteAction }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  saveRule.mockResolvedValue({ ok: true, covered: [row('Cat Toy', 7)] })
  saveSelection.mockResolvedValue({ ok: true, covered: [row('Cat Toy', 8)] })
  saveTitle.mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('GroupDiscountEditor — layout', () => {
  it('shows the title, schedule, shared price, picks, covered products and the delete button', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
    expect(screen.getByLabelText(/Starts/)).toHaveValue('2026-07-01T12:00')
    expect(screen.getByLabelText('Discount type')).toHaveValue('percent')
    expect(screen.getByLabelText('Percent off')).toHaveValue(20)
    expect(screen.getByRole('radio', { name: 'Products and variants' })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Cat Toy' })).toBeInTheDocument()
    expect(screen.getByText('£8.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument() // autosave: no Save button
  })
})

describe('GroupDiscountEditor — shared price', () => {
  it('saves a new amount after a pause, shows the new prices and the "Saved" pill', async () => {
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await user.type(amount, '30')
    expect(saveRule).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    await waitFor(() => expect(saveRule).toHaveBeenCalledWith('time_disc_1', { pricingMode: 'percent', amount: 30 }))
    expect(await screen.findByText('£7.00')).toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('saves at once when the type changes', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    await vi.advanceTimersByTimeAsync(10)
    await waitFor(() => expect(saveRule).toHaveBeenCalledWith('time_disc_1', { pricingMode: 'fixed', amount: 20 }))
  })

  it('does not save an amount that is empty or not valid, and says why when it is not valid', async () => {
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 2)
    await user.type(amount, '150')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 2)
    expect(saveRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A percentage discount cannot exceed 100%')
  })

  it('shows the server\'s reason inline and keeps what was typed, so it can be fixed', async () => {
    saveRule.mockResolvedValue({ ok: false, error: 'Cat Toy: The fixed price (£30.00) is not lower than the regular price (£10.00)' })
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    await user.clear(screen.getByLabelText('Fixed price'))
    await user.type(screen.getByLabelText('Fixed price'), '30')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cat Toy: The fixed price (£30.00)')
    expect(screen.getByLabelText('Fixed price')).toHaveValue(30)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows the reload message when the request itself is rejected', async () => {
    saveRule.mockRejectedValue(new Error('network'))
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    await vi.advanceTimersByTimeAsync(10)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server — reload the page and try again")
  })
})

describe('GroupDiscountEditor — picks', () => {
  it('saves a newly picked product at once and shows what it now covers', async () => {
    const { user } = setup()
    saveSelection.mockResolvedValue({ ok: true, covered: [row('Cat Toy', 8), { ...row('Dog Bed', 32), productId: 'gid://shopify/Product/2' }] })
    await user.click(screen.getByRole('button', { name: 'stub-add-bed' }))

    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith('time_disc_1', {
      mode: 'products', members: [...toys.members, { productId: 'gid://shopify/Product/2', title: 'Dog Bed' }],
    }))
    expect(await screen.findByRole('link', { name: 'Dog Bed' })).toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('removes a pick after confirming, and does nothing when declined', async () => {
    const { user } = setup()
    saveSelection.mockResolvedValue({ ok: true, covered: [] })
    await user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Cat Toy from this discount?')
    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith('time_disc_1', { mode: 'products', members: [] }))

    saveSelection.mockClear()
    cleanup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const second = setup()
    await second.user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(saveSelection).not.toHaveBeenCalled()
  })

  it('puts the picks back and shows the reason when the server refuses a change', async () => {
    saveSelection.mockResolvedValue({ ok: false, error: 'Dog Bed: This product already belongs to another discount' })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'stub-add-bed' }))

    expect(await screen.findByText('Dog Bed: This product already belongs to another discount')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Dog Bed' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Cat Toy' })).toBeInTheDocument()
  })

  it('switching to collections replaces the picks (after confirming) and saves the empty selection', async () => {
    const { user } = setup()
    saveSelection.mockResolvedValue({ ok: true, covered: [] })
    await user.click(screen.getByRole('radio', { name: 'Collections' }))
    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith('time_disc_1', { mode: 'collections', collections: [] }))
    expect(screen.getByTestId('collection-picker')).toBeInTheDocument()
  })
})

describe('GroupDiscountEditor — title and delete', () => {
  it('saves the title when its box loses focus', async () => {
    const { user } = setup()
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Winter Sale')
    await user.tab()
    await waitFor(() => expect(saveTitle).toHaveBeenCalledWith('time_disc_1', 'Winter Sale'))
  })

  it('asks before deleting the whole discount, then runs the delete action', async () => {
    const { user, deleteAction } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith('Delete this discount entirely? This cannot be undone.')
    await waitFor(() => expect(deleteAction).toHaveBeenCalled())
  })
})
```

Run: `npx vitest run tests/timeDiscounts/components/GroupDiscountEditor.test.tsx` → FAIL (module not found).

- [ ] **Step 5: Implement `GroupDiscountEditor`**

`src/timeDiscounts/components/GroupDiscountEditor.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import ConfirmForm from '@/components/ConfirmForm'
import { useSavedToast } from '@/components/SavedToast'
import { parseRuleInput, ruleSaveDelay, sameRule, type CoveredRow } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { Rule } from '@/timeDiscounts/rows'
import { requestGroupRuleSave, requestGroupSelectionSave } from '@/timeDiscounts/saveRequests'
import { useTitleSchedule } from '@/timeDiscounts/components/useTitleSchedule'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'
import GroupRuleFields from '@/timeDiscounts/components/GroupRuleFields'
import GroupPicks from '@/timeDiscounts/components/GroupPicks'
import CoveredTable from '@/timeDiscounts/components/CoveredTable'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/**
 * The page of an existing group: title, schedule, shared price and picks.
 * Every part saves itself (no page-wide Save button) and shows the "Saved"
 * pill on success; a refused change is shown inline next to the part that
 * caused it. Saves are queued so only one request is in flight at a time.
 */
export default function GroupDiscountEditor({
  discountId, shopTimezone, initialTitle, initialStartsAt, initialEndsAt,
  initialPricingMode, initialAmount, initialSelection, initialCovered, deleteAction,
}: {
  discountId: string
  shopTimezone: string
  initialTitle: string
  initialStartsAt: string
  initialEndsAt: string
  initialPricingMode: 'percent' | 'fixed'
  initialAmount: number
  initialSelection: GroupSelection
  initialCovered: CoveredRow[]
  deleteAction: () => Promise<void>
}) {
  const { showSaved } = useSavedToast()
  const enqueue = useSaveQueue()
  const { title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid } =
    useTitleSchedule({ discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved })

  const [covered, setCovered] = useState(initialCovered)

  // Shared price
  const [pricingMode, setPricingMode] = useState(initialPricingMode)
  const [amountText, setAmountText] = useState(String(initialAmount))
  const [ruleError, setRuleError] = useState<string | null>(null)
  const savedRule = useRef<Rule>({ pricingMode: initialPricingMode, amount: initialAmount }) // last the server acknowledged
  const requestedRule = useRef<Rule>({ pricingMode: initialPricingMode, amount: initialAmount }) // last queued
  const { rule, problem: ruleProblem } = parseRuleInput(pricingMode, amountText)
  const ruleMode = rule?.pricingMode
  const ruleAmount = rule?.amount

  // The rule saves itself once it is valid and has settled; a changed type saves at once.
  useEffect(() => {
    if (ruleMode === undefined || ruleAmount === undefined) return
    const next: Rule = { pricingMode: ruleMode, amount: ruleAmount }
    if (sameRule(next, requestedRule.current)) return

    const timer = setTimeout(() => {
      requestedRule.current = next
      requestGroupRuleSave(enqueue, discountId, next).then((result) => {
        if (result.ok) {
          savedRule.current = next
          setRuleError(null)
          setCovered(result.covered)
          showSaved()
        } else {
          // Let the same rule be retried, unless a newer one has been queued since.
          if (sameRule(requestedRule.current, next)) requestedRule.current = savedRule.current
          setRuleError(result.error)
        }
      })
    }, ruleSaveDelay(requestedRule.current, ruleMode))
    return () => clearTimeout(timer)
  }, [ruleMode, ruleAmount, discountId, enqueue, showSaved])

  // Picks
  const [selection, setSelection] = useState(initialSelection)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const savedSelection = useRef(initialSelection)
  const selectionRequests = useRef(0)

  function changeSelection(next: GroupSelection) {
    setSelection(next)
    setSelectionError(null)
    const mine = ++selectionRequests.current
    requestGroupSelectionSave(enqueue, discountId, next).then((result) => {
      if (result.ok) {
        savedSelection.current = next
        setCovered(result.covered)
        showSaved()
      } else if (mine === selectionRequests.current) {
        // Show what is really saved again, with the reason.
        setSelection(savedSelection.current)
        setSelectionError(result.error)
      }
    })
  }

  // Deleting rewrites the same shop config the saves do, so it waits its turn in the queue.
  async function deleteQueued() {
    await enqueue(deleteAction)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Group discount</h1>

      <section className="mb-8">
        <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
        <input
          id="title" type="text" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className={inputClass}
        />
        <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        {titleError && <p role="alert" className="text-xs text-danger mt-1">{titleError}</p>}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {(scheduleInvalid || scheduleError) && <p role="alert" className="text-xs text-danger mt-2">{scheduleInvalid ?? scheduleError}</p>}
      </section>

      <GroupRuleFields
        pricingMode={pricingMode} amountText={amountText} problem={ruleProblem ?? ruleError}
        onChange={(mode, text) => { setPricingMode(mode); setAmountText(text) }}
      />

      <GroupPicks selection={selection} onChange={changeSelection} excludeDiscountId={discountId} />
      {selectionError && <p role="alert" className="text-xs text-danger -mt-6 mb-8">{selectionError}</p>}

      <section className="mb-8">
        <h2 className="font-medium mb-2">Covered products</h2>
        <CoveredTable rows={covered} emptyMessage="Nothing is covered yet — pick products or a collection." />
      </section>

      <section className="flex gap-3">
        <ConfirmForm action={deleteQueued} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Run all checks and commit**

Run: `npx vitest run tests/timeDiscounts && npx tsc --noEmit -p . && npx eslint src/timeDiscounts tests/timeDiscounts && npx vitest run`
Expected: all PASS (the 34 `TimeDiscountEditor` tests unchanged), clean.

```bash
git add package.json package-lock.json src/timeDiscounts tests/timeDiscounts
git commit -m "feat: the group discount page, with autosave for its title, schedule, price and picks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Wire it in — kind chooser, page branching, list label

**Files:**
- Create: `src/timeDiscounts/components/NewDiscountForm.tsx`, `tests/timeDiscounts/components/NewDiscountForm.test.tsx`
- Modify: `src/timeDiscounts/components/NewTimeDiscountForm.tsx`, `src/app/time-discounts/new/page.tsx`, `src/app/time-discounts/[discountId]/page.tsx`, `src/app/page.tsx`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `NewDiscountForm({ shopTimezone: string; adminProductBaseUrl: string })` — the whole `/time-discounts/new` page: heading, a **Kind** choice (radios "Per product" and "Group"; Per product selected first, the existing behaviour), and the chosen kind's form. `NewTimeDiscountForm` no longer renders `<main>` or `<h1>` (the wrapper does) and now also sends a hidden `kind` = `perProduct`.

- [ ] **Step 1: Bump the version to `0.21.11`.**

- [ ] **Step 2: Write the failing test**

`tests/timeDiscounts/components/NewDiscountForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewDiscountForm from '@/timeDiscounts/components/NewDiscountForm'

vi.mock('@/timeDiscounts/components/NewTimeDiscountForm', () => ({ default: () => <div data-testid="per-product-form" /> }))
vi.mock('@/timeDiscounts/components/NewGroupForm', () => ({ default: () => <div data-testid="group-form" /> }))

afterEach(cleanup)
const BASE = 'https://shop.myshopify.com/admin/products/'

describe('NewDiscountForm', () => {
  it('offers the two kinds, with Per product chosen, and shows that kind\'s form', () => {
    render(<NewDiscountForm shopTimezone="Europe/London" adminProductBaseUrl={BASE} />)
    expect(screen.getByRole('heading', { name: 'Add time-based discount' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Per product/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Group/ })).not.toBeChecked()
    expect(screen.getByTestId('per-product-form')).toBeInTheDocument()
    expect(screen.queryByTestId('group-form')).not.toBeInTheDocument()
  })

  it('switches to the group form, and back', async () => {
    const user = userEvent.setup()
    render(<NewDiscountForm shopTimezone="Europe/London" adminProductBaseUrl={BASE} />)
    await user.click(screen.getByRole('radio', { name: /Group/ }))
    expect(screen.getByTestId('group-form')).toBeInTheDocument()
    expect(screen.queryByTestId('per-product-form')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Per product/ }))
    expect(screen.getByTestId('per-product-form')).toBeInTheDocument()
  })
})
```

Run → FAIL (module not found).

- [ ] **Step 3: Implement the wrapper**

`src/timeDiscounts/components/NewDiscountForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'
import NewGroupForm from '@/timeDiscounts/components/NewGroupForm'

type Kind = 'perProduct' | 'group'

const KINDS: { kind: Kind; label: string; help: string }[] = [
  { kind: 'perProduct', label: 'Per product', help: 'Each product or variant has its own price or percentage.' },
  { kind: 'group', label: 'Group', help: 'One price or percentage for a set of products, variants or collections.' },
]

/** The new-discount page: choose the kind, then fill in that kind's form. Nothing is created until its Save. */
export default function NewDiscountForm({ shopTimezone, adminProductBaseUrl }: { shopTimezone: string; adminProductBaseUrl: string }) {
  const [kind, setKind] = useState<Kind>('perProduct')

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <fieldset className="mb-8">
        <legend className="font-medium mb-2">Kind</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((option) => (
            <label key={option.kind} className="flex items-start gap-3 border border-line rounded px-4 py-3 cursor-pointer has-[:checked]:border-accent">
              <input
                type="radio" name="discount-kind" className="mt-1"
                checked={kind === option.kind} onChange={() => setKind(option.kind)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted">{option.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'group'
        ? <NewGroupForm shopTimezone={shopTimezone} />
        : <NewTimeDiscountForm shopTimezone={shopTimezone} adminProductBaseUrl={adminProductBaseUrl} />}
    </main>
  )
}
```

- [ ] **Step 4: Make `NewTimeDiscountForm` a plain form and mark its kind**

In `NewTimeDiscountForm.tsx` replace the outer `<main className="p-8 max-w-3xl mx-auto"><h1>…</h1><form …>…</form></main>` with just the `<form …>…</form>` (remove the `<main>` and `<h1>` lines and dedent), and add as the first child of the form: `<input type="hidden" name="kind" value="perProduct" />`. Add this test to `tests/timeDiscounts/components/NewTimeDiscountForm.test.tsx` (inside its main describe; it relies on the file's existing helpers `setup`, `fillBasics`, `addKeptRow`, `saveButton`):

```tsx
  it('marks what it sends as a per-product discount', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: true })
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(saveButton())
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect((create.mock.calls[0][1] as FormData).get('kind')).toBe('perProduct')
  })
```

- [ ] **Step 5: Update the three pages**

`src/app/time-discounts/new/page.tsx`:

```tsx
import { getShopTimezone } from '@/lib/shop'
import NewDiscountForm from '@/timeDiscounts/components/NewDiscountForm'

export default async function NewTimeDiscountPage() {
  const shopTimezone = await getShopTimezone()
  const adminProductBaseUrl = `https://${process.env.SHOPIFY_SHOP}/admin/products/`
  return <NewDiscountForm shopTimezone={shopTimezone} adminProductBaseUrl={adminProductBaseUrl} />
}
```

`src/app/time-discounts/[discountId]/page.tsx`: add imports `import { loadCovered } from '@/timeDiscounts/groupServer'` and `import GroupDiscountEditor from '@/timeDiscounts/components/GroupDiscountEditor'`, and insert this block right after the line `const adminProductBaseUrl = ...` (before the per-product `const info = ...`):

```tsx
  if (discount.kind === 'group' && discount.group) {
    const covered = await loadCovered(discount.items, adminProductBaseUrl)
    return (
      <main className="p-8 max-w-3xl mx-auto">
        <AuthLink
          href="/"
          token={token}
          className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
        >
          ← Back to discounts
        </AuthLink>

        <GroupDiscountEditor
          discountId={discountId}
          shopTimezone={shopTimezone}
          initialTitle={discount.title}
          initialStartsAt={discount.startsAt}
          initialEndsAt={discount.endsAt}
          initialPricingMode={discount.group.pricingMode}
          initialAmount={discount.group.amount}
          initialSelection={discount.group.selection}
          initialCovered={covered}
          deleteAction={deleteTimeDiscount.bind(null, discountId)}
        />
      </main>
    )
  }
```

`src/app/page.tsx`: in the list item, change the sub-line to start with the kind:

```tsx
              <p className="text-sm text-muted">
                {row.kind === 'group' ? 'Group' : 'Per product'} · {scheduleLabel(row.startsAt, row.endsAt)} · {row.startsAt} → {row.endsAt} · {row.items.length} product{row.items.length === 1 ? '' : 's'}
              </p>
```

- [ ] **Step 6: Run every check**

Run:

```bash
npx tsc --noEmit -p . && npx eslint src tests && npx vitest run && node --test extensions/product-tier-pricing-tests/*.test.js && npx next build --webpack 2>&1 | grep -E "Compiled|rror"
```

Expected: no tsc/eslint output; all vitest tests PASS; extension tests PASS (unchanged, 135); build prints `Compiled successfully`.

- [ ] **Step 7: Commit, then open the PR**

```bash
git add package.json package-lock.json src tests
git commit -m "feat: choose Group or Per product when adding a time-based discount" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
gh pr view feat/group-time-discount-kind --json state 2>/dev/null || true   # must not be MERGED; if it is, cut a new branch from origin/main
git push -u origin feat/group-time-discount-kind
```

Open the PR against `main` with `gh pr create --base main`. The body must state: the Group kind alongside Per product; picked by products/variants or by collections; expands to rows on save so **no extension changes and no `shopify app deploy`**; the size limit (about 63 variants or 107 whole products); the version range (`0.21.0` to `0.21.11`); test counts; that it was checked in jsdom only and needs the manual check below.

- [ ] **Step 8: Manual check on the live store (the user does this after merging)**

1. Add a Group discount on one collection with a percentage; confirm the table lists its products, then check the checkout price, the storefront price and the countdown on one of them.
2. Add a Group discount on two individual products with a fixed price; confirm each product's price at checkout.
3. On a group page, remove a product: its storefront sale price must disappear.
4. Add a product to the collection in Shopify: it must **not** be in the group until the group's picks are saved again.
5. Try a fixed price above one product's regular price: the page must refuse it and name the product.
6. On the new-discount page switch between the two kinds; confirm Save stays off until the form is complete, and that a past end time turns it off.
