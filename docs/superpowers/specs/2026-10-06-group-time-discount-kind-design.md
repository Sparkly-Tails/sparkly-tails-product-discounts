# Group time-based discounts, alongside per-product — design

**Date:** 2026-10-06
**Status:** Reviewed against the code on `main` (see §12); ready for approval
**Builds on:** `2026-10-05-per-row-time-discount-pricing-design.md` (shipped in #29–#35).
**Brings back (in part):** `2026-09-22-time-based-collection-discount-design.md` — one shared price for a group, picked as products, variants or collections.

## 1. Problem

Per-row pricing (#29/#30) made every time-based discount a table where each product has its own price. That removed the simple case: "put these products, or this collection, on one price or one percentage for a time window". The merchant wants both. A time-based discount is now one of two kinds, each with its own page and its own spec.

## 2. Goal

Two kinds of time-based discount, side by side:

- **Per product** (exists today): a table of rows, each product or variant with its own price or percentage.
- **Group** (new): one shared price rule, applied to a set of products, variants or a collection.

Checkout, the storefront price and the countdown work the same for both kinds.

## 3. Decisions (agreed in brainstorming)

1. **Group keeps collections.** A group is picked by products/variants **or** by collections (see §4.3 for why not both).
2. **One "New time-based discount" button.** Its page first asks for the kind, then shows that kind's full form. **Nothing is created until Save is pressed on a complete form** (see §5.1; the per-product form already works this way, from #32, #33 and #35). Once created, the discount's own page autosaves.
3. **One time-based discount per product or variant, across both kinds.** The existing availability check (`isTimeDiscountMemberAvailable`, plus the tier-discount check) runs on every resolved product.
4. **The Group page autosaves**, with the same "Saved" pill, save queue and failed-request handling as the per-product page. No page-wide Save button.
5. **Approach A: a group expands to rows on save.** The shared rule and the picks are what the merchant edits. Every save rebuilds `items` (one row per product or variant, all with the shared rule). The checkout Function, the storefront metafields and both scripts read only `items` and need no new behaviour.
6. **The kind is chosen at creation and cannot be changed.**

Rejected alternative: keep the old compact checkout config for groups (two engines). It keeps a higher size limit but leaves old-shape code in the Function, the scripts and the Liquid permanently.

## 4. Data model

### 4.1 `TimeDiscount`

```ts
interface GroupSpec {
  pricingMode: 'percent' | 'fixed'
  amount: number                  // percent off (0 < n <= 100) or the final price, major units
  selection:
    | { mode: 'products'; members: GroupMember[] }          // GroupMember = DiscountMember + the title shown on its chip
    | { mode: 'collections'; collections: { id: string; title: string }[] }   // titles stored so the chips need no lookup
}

interface TimeDiscount {          // fields not listed here are unchanged
  kind: 'perProduct' | 'group'    // a stored discount without `kind` is read as 'perProduct'
  items: TimeDiscountItem[]       // what the Function and the storefront read; for a group, derived
  group?: GroupSpec               // present only when kind === 'group'
}
```

`DiscountMember` (`{ productId, variantId? }`) stays. `items` keeps its existing shape and rules.

### 4.2 Rebuilding `items` for a group

On every group save, the server rebuilds `items` from `group`:

- **products mode:** one row per member, each carrying the shared rule.
- **collections mode:** each collection is resolved to its products now (`resolveCollectionMembers`, restored from git history; it was deleted in #30); each product becomes a whole-product row (no `variantId`) carrying the shared rule. A product in two chosen collections appears once.
- The result goes through the same checks as a per-product save: `validateItemsStructure`, availability across all other time and tier discounts, and the size cap (§4.4). When a group already exists, availability **excludes its own id**, so its current rows never count as conflicts.
- Resolving a collection **stops as soon as the products found exceed the row cap** (§4.4) and reports the size error, instead of paging through a very large collection.
- The expansion itself is a pure function (`expandGroup(group, resolved)` in a new `group.ts`): it takes the shared rule and the resolved products and returns the rows.

**Storefront metafields.** After a group save, the products in the old `items` that are not in the new ones have their storefront metafield cleared (`clearTimeDiscountMetafields`), and the rest are synced (`syncTimeDiscountMetafields`), the same way a per-product row removal does today. Without this, a product dropped from the group would keep showing the sale price.

**Collections are a snapshot.** Products added to a collection later are not included until the discount is saved again. This matches the original design.

### 4.3 Why products or collections, not both

A product picked by variant and also inside a chosen collection would produce a variant row and a whole-product row for the same product, which `validateItemsStructure` rejects. Keeping one mode per group, as the original did, avoids that case. Switching mode replaces the selection and asks for confirmation when the selection is not empty.

### 4.4 Fixed price and size cap

- **Fixed price:** each row must be lower than that row's regular price (`validateRule`, as for per-product). For a variant row, the price is that variant's (`getMemberInfo`). For a whole-product row of a product with several variants, the comparison uses its **cheapest variant**. `getMemberInfo` cannot give that: for a whole-product member it returns the **first** variant's price, and it reads at most 250 variants. So this work adds `getLowestVariantPrices(productIds)`, one batched `nodes(ids)` query (chunked like `getMemberInfo`) that returns each product's lowest variant price. If any member fails, the save is refused and the message names the first product that fails and how many others do.
- **Percent:** `0 < amount <= 100`.
- **Size cap:** the existing 9,500-byte guard (`FUNCTION_CONFIG_MAX_BYTES`) applies to the rebuilt `items`: about 63 variant rows or 107 whole-product rows. If the group does not fit, the save is refused: "This selection covers {n} products. One discount fits about 63 variants or 107 whole products. Pick fewer, or split it into two discounts." A group is therefore smaller than the original collection discount's limit (about 85 / 180); this is the accepted cost of approach A.

### 4.5 Preview

Collections are resolved on the server, so the form cannot know what a pick covers, or which product would break the rule, until the server looks. A read-only action, `previewGroup(rule, selection, excludeDiscountId?)`, does that lookup and writes nothing:

- It resolves the picks (§4.2), reads the prices (§4.4) and runs every save check.
- It returns `{ ok: true, covered }` (the rows' names, links, discounted and regular prices) or `{ ok: false, error }` with the first failure (an empty collection, a product already in another discount, a fixed price not lower than a product's price, too many rows).
- The **new-discount form** calls it when the rule or the picks change, after 600 ms of quiet. If a newer call has started, an older answer is ignored. The **Group page** does not need it: every autosave on that page runs the same checks, refuses a bad change with the reason, and returns the covered rows.
- The save actions run the same checks again; the server stays the authority.

## 5. Admin UI

### 5.1 New discount (`/time-discounts/new`)

The page opens with **Kind** (two options, "Group — one price for a set of products" and "Per product — each product has its own price"). Choosing one shows that kind's form. The whole form lives in the browser; **nothing exists in Shopify until Save is pressed**, so a long fill-in cannot run past the end time of a discount that is already live. **Save discount** is at the bottom, and a line under it says what is missing while it is off.

- **Per product:** title, schedule and the products table, as built in #32. Save is off until there is a title, a valid schedule, at least one kept row, and no row open for editing.
- **Group:** title, schedule, the shared price (type and amount), the picks (products and variants, or collections) and the read-only covered-products table, filled by `previewGroup` (§4.5). Save is off until there is a title, a valid schedule, a valid shared price, and a preview that came back **ok with at least one covered product**; while the preview is loading or has failed, Save stays off and the reason shows.
- **End time:** both forms use `endTimeHasPassed` as built in #33 and #35: it is evaluated each time Save's state is worked out, and again just before the form submits, so Save turns off and nothing is sent if the end time has passed.
- One request validates everything and creates the discount with its rows; any failure creates nothing and shows the reason next to Save. The server also refuses an end time that has already passed when Save is pressed.
- Closing or reloading the page with something entered shows the browser's "Leave site?" warning.
- After Save, the discount's own page opens and works as in §5.2–§5.3 (autosave with the "Saved" pill).

### 5.2 Discount page (`/time-discounts/[discountId]`)

The server component loads the discount and renders `TimeDiscountEditor` for `perProduct` (unchanged) or `GroupDiscountEditor` for `group`.

### 5.3 Group page, top to bottom

1. **Title** — saves on blur, as today.
2. **Schedule** — start and end, 600 ms debounce, same validation as today (end after start, years 2000–2100).
3. **Shared price** — type (Fixed price / Percentage off) and amount. A rule that breaks a product is refused by the save, with the product named. Saves at once when the type changes and 600 ms after the amount stops changing.
4. **Pick by** — "Products and variants" or "Collections".
   - Products and variants: the existing search and variant picker. Each pick is a removable chip; removing asks for confirmation.
   - Collections: a collection search (`searchCollections`, `resolveCollectionMembers` and the original `TimeCollectionPicker`, restored from git history at `37d32dd^`, the parent of the commit that deleted them in #30). Each pick is a removable chip showing its stored title; removing asks for confirmation.
   - Adding, removing and switching mode each save at once.
5. **Covered products** — a read-only table: product (and variant) name linking to its Shopify admin page, discounted price, regular price. It shows exactly what customers get. Rows are not edited or deleted individually; they follow the picks. It is empty when nothing is picked.
6. **Delete discount** — with confirmation, unchanged.

Saves from this page go through the same one-request-at-a-time queue as the per-product page. Errors show inline in the part where they happened; the "Saved" pill is for successes only. A rejected request shows "Couldn't reach the server — reload the page and try again". Each group save returns the new covered-products list so the table updates without a reload.

### 5.4 List page

Every entry shows its title, schedule label and "{n} products" (the rows), plus a **Group** or **Per product** label.

## 6. Server actions

New actions (all return `{ ok: true, ... } | { ok: false, error }` via `guarded()`), following the save order used today: validate, update the Shopify discount record, save the app config, then best-effort storefront metafield sync.

- `createTimeDiscount(previous, formData)` — gains `kind`. For a per-product discount it already takes the rows (#32). For a group it takes the shared rule and the picks, resolves them per §4.2, runs the same checks as a save, and creates the discount with its rows in one request. It returns a result to show next to Save, or redirects to the new discount.
- `previewGroup(rule, selection, excludeDiscountId?)` — read-only, see §4.5.
- `saveGroupRule(discountId, { pricingMode, amount })`
- `saveGroupSelection(discountId, selection)` — replaces the whole selection (used for add, remove and mode switch).
- Both group actions rebuild `items` per §4.2 and return the covered-products list.
- Title, schedule and delete reuse the existing actions.

The per-product actions reject a `group` discount's id, and the group actions reject a `perProduct` one.

## 7. Cleanup that goes with this work

The user has no live time-based discounts, so nothing needs converting. In this PR (admin code only):

- Remove `normalizeTimeDiscount` and `StoredTimeDiscount`. A stored discount is read as saved; one without `kind` is read as `perProduct`.
- Remove `assertNotStuckOverCap` and its "created before per-row pricing" message, with their tests. The normal size-cap message stays.

In a **separate PR** (it changes extension code, so the Shopify app must be deployed again before it is merged):

- Remove the old-shape fallback (`resolvedMembers` plus one shared rule) from the Rust Function, and the old `pricingMode`/`amount`/`variantIds` fields from both scripts and both Liquid blocks, with their tests.

## 8. Rollout and conventions

1. **Group PR** (admin only, no extension changes, so no app deploy): everything in §§3–7 except the extension cleanup. Vercel deploys on merge.
2. **Extension cleanup PR**: deploy the app from its branch with `shopify app deploy --config shopify.app.toml`, then merge.

Both PRs need a non-author review. Merging and deploying are the merchant's.

Conventions for the work, from the project's standing rules:

- **Pure functions.** Logic lives in module-level pure functions that take everything they need as arguments (`expandGroup`, the preview checks, row and form helpers in the style of `rows.ts` and `picker.ts`); components keep only setState, refs and calls.
- **Version.** Every code commit bumps the version in `package.json` and `package-lock.json` (minor for the feature, patch for fixes).
- **Branches.** Each PR starts from `origin/main`; before every push to an existing branch, check its PR has not merged.

## 9. Testing

- **Unit (vitest):** rebuilding `items` from products mode and collections mode (a product in two collections once; a multi-variant product becomes one whole-product row); fixed price per member and the cheapest-variant rule, with `getLowestVariantPrices`; the failing-member message; availability across both kinds and tier discounts, excluding the group's own id; the size cap message, and collection resolution stopping early; clearing the storefront metafield of a product dropped from a group; `previewGroup` results, and an older answer ignored when a newer one started; rejecting the wrong kind on each action; reading a stored discount without `kind`.
- **Component (RTL):** the new-discount form and its kind choice; the group form's Save staying off until the preview is ok and non-empty, and the end-time check at render and at submit; the group page's rule, picks, mode switch (confirm when not empty), remove-with-confirm and the covered-products table; inline errors and the failed-request message; each save shows the pill.
- **Rust and scripts:** no new behaviour in the Group PR. The cleanup PR updates the Rust and script tests to the new shape only.
- **Manual on the live store after deploy:** create a group on one collection with a percentage; create a group on two products with a fixed price; check checkout price, storefront price and countdown for each; add a product to the collection and confirm it is not included until the group is saved again; try a fixed price above a member's regular price and read the error.

## 10. Out of scope

Mixing products and collections in one group; changing a discount's kind; per-row prices inside a group; converting a group to a per-product discount; automatic re-sync when a collection changes; tier-discount changes; coordinating saves across browser tabs.

## 11. Assumptions to confirm in review

- A group picks by products/variants **or** by collections, not both (§4.3).
- A fixed-price group on a multi-variant product compares against its cheapest variant (§4.4).
- The kind label text is "Group" and "Per product".
- The group size limit (about 63 variants or 107 whole products) is acceptable.
- Collection titles are stored when picked, so a renamed collection keeps its old title on the chip until it is picked again.
- Save on the group forms waits for the preview (about a second after the last change); that delay is the price of seeing a broken fixed price before saving.

## 12. Review log

This spec was reviewed against the code on `main` after #35. Changes made:

- **Lowest variant price (§4.4).** `getMemberInfo` returns the first variant's price for a whole product, so the "cheapest variant" rule needs a new batched lookup, `getLowestVariantPrices`.
- **Storefront metafield cleanup (§4.2).** A product dropped from a group must have its metafield cleared; the spec had only the sync.
- **Preview action (§4.5, §5.1).** Without it, the create form could not know whether a collection is empty or a fixed price breaks a product until Save. Save now waits for an ok, non-empty preview.
- **Own-id availability (§4.2).** Re-saving a group must not treat its own rows as conflicts.
- **Early stop when resolving collections (§4.2).** Avoids paging through a very large collection that would be refused anyway.
- **Stored collection titles (§4.1).** Chips need no extra lookup.
- **End-time check on the group forms (§5.1)** and **project conventions (§8)** added.
- **Restore point for the collection code (§5.3):** `37d32dd^`.
