# Time-Based Collection Discount — Design Spec

## 1. Motivation

The app currently supports one discount kind: a quantity-tiered percent/fixed discount on an explicit set of product/variant members. This adds a second, structurally independent discount kind: a **flat percent-or-fixed discount active only within a merchant-defined date/time window** (in the shop's own timezone), applicable to individually-selected products/variants **or** to whole Collections, with its own countdown-timer storefront widget.

The explicit goal, stated by the user, is **module isolation**: this discount kind must live in its own code, own settings, own storefront widget, and own checkout Function, so that building it carries zero risk to the existing discount system, and so a *third* discount kind can be added later the same way, without the first two clashing.

## 2. Global Constraints

- **No shared logic with the existing discount system**, except one deliberate, narrow seam: a cross-kind "is this product/variant already claimed by any discount" availability check (needed for constraint below). Everything else — types, admin actions, pickers, pages, metafield namespace, Rust Function, theme extension block/JS — is new and separate.
- **A product/variant belongs to at most one discount, of either kind, at a time.** No stacking, no combining. (User-confirmed.)
- **Flat discount only** — one percent-off or fixed-price amount for the whole active window, no quantity tiers. ("Initially" per the user — this spec does not build unused tier-extensibility scaffolding; a future tiered version is a new spec, not a hidden option in this one.)
- **Selection is exclusive**: a discount is either product/variant-based or Collection-based, never both. Enforced structurally via a discriminated union, not just hidden UI.
- Dates/times are entered and displayed in the **shop's own timezone** (`shop.ianaTimezone`), and evaluated at checkout via the shop's local time, not UTC or the customer's browser timezone.
- Must apply consistently at **online checkout and POS** — this is why a Shopify Function is required rather than a storefront-only price change. Time-window activation must be enforced by Shopify's own native discount scheduling (see §5), not a mechanism this app invents and polls — a merchant-side status flag risks staleness on POS, which evaluates discounts through the same platform-native activation path as online checkout and has no reason to trust a field this app set out-of-band.
- Each `TimeDiscount` is backed by its own real Shopify `DiscountAutomaticApp` record (see §5) — distinct from the existing product-discount system, which remains exactly as it is today: one shared record, one shared Function, one config blob. **The existing discount system is not touched by this spec in any way**, including its Function, its metafield, and its one-record-per-app-not-per-discount pattern.
- Shopify caps **automatic discounts (native + app-based combined) at 25 simultaneously active per shop** (confirmed current as of Nov 2024, raised from 5; no documented cap on total lifetime creation, only on how many can be active at once). This is an accepted platform ceiling on how many `TimeDiscount`s can have overlapping live windows at once — comfortable for realistic usage, but real, and shared with whatever else (this app's own existing discount, other apps, native discounts) the shop is running.
- SOLID/DRY/KISS/YAGNI apply as they do everywhere else in this app; DRY is deliberately subordinated to the isolation constraint above where the two conflict (see §8).

## 3. Data Model

New module, new files — no edits to `src/lib/config.ts` or its `Discount`/`DiscountMember` types (the `DiscountMember` *shape*, `{productId, variantId?}`, is reused as a plain structural type, not imported logic).

```ts
// src/timeDiscounts/config.ts

interface DiscountMember {
  productId: string
  variantId?: string
}

type TimeDiscountSelection =
  | { mode: 'products'; members: DiscountMember[] }
  | { mode: 'collections'; collectionIds: string[] }

interface TimeDiscount {
  discountId: string
  shopifyDiscountId: string     // GID of the real DiscountAutomaticApp record this discount owns — see §5
  name: string                 // internal admin label
  title: string                // customer-facing, shown in the countdown widget
  pricingMode: 'percent' | 'fixed'
  amount: number                // single flat value — percent-off, or the fixed price
  startsAt: string              // ISO datetime; entered/displayed in shop timezone, stored normalized
  endsAt: string
  selection: TimeDiscountSelection   // admin source of truth: how the merchant chose members, shown when editing
  resolvedMembers: DiscountMember[]  // Function-facing snapshot — see §5
}

interface TimeDiscountsConfig {
  discounts: TimeDiscount[]
}
```

`selection` and `resolvedMembers` serve different readers. `selection` is what the admin edit screen shows and lets the merchant change (their actual choice: these specific products, or these collections). `resolvedMembers` is a flat, Function-facing snapshot recomputed from `selection` every time the discount is created or saved — for `products` mode it's just `selection.members` unchanged; for `collections` mode it's every product/variant currently in the chosen collections, enumerated via the Admin API at save time. The Function only ever reads `resolvedMembers` and never needs to know which selection mode produced it (see §5).

**No local `status` field.** Activation is entirely Shopify-native (§5): `startsAt`/`endsAt` live on the real `DiscountAutomaticApp` record identified by `shopifyDiscountId`, and Shopify itself decides whether the discount is active — this app never tracks or polls that state. The admin list/edit UI computes a display-only "upcoming / active / expired" label straight from `startsAt`/`endsAt` vs. the shop's current local time (same math the storefront countdown already needs, §7) — informational only, never read by the Function.

Stored in its own shop metafield, e.g. `sparkly_time_discounts/config` — completely separate key from the existing `sparkly_product_discounts/config`, so neither module's writes can ever collide with or corrupt the other's data.

**The one shared seam**: a small utility (e.g. `src/lib/discountAvailability.ts`, new file, imported by *both* modules) exposing something like:

```ts
function isProductClaimedByAnyDiscount(productId: string, variantId: string | undefined, excludeDiscountId?: string): Promise<boolean>
```

This reads both configs (the existing `sparkly_product_discounts/config` and the new `sparkly_time_discounts/config`) and checks membership across both. This is the only file either module imports from the other's territory, and it exists specifically to honor the "one discount per product" constraint the user requires.

## 4. Admin Flow

New pages under a new route segment (e.g. `/time-discounts/new`, `/time-discounts/[discountId]`), new components, new server actions — mirroring the *shape* of the existing admin flow (name/title fields, a picker, a submit button gated on completeness) without importing its code.

- **Selection-mode toggle** at the top of the form: "Products" / "Collections", presented as an exclusive choice (e.g. radio buttons). Choosing one renders only that section's picker; the other is not rendered at all — not disabled, not hidden-via-CSS, genuinely absent from the DOM, matching the discriminated union in §3.
  - **Products** mode: a new product/variant search-and-pick component, functionally similar to the existing `MemberPicker` (search-as-you-type, multi-variant expansion, already-claimed items filtered out via the shared availability check from §3) but implemented as its own file — deliberate duplication over cross-module reuse, per the isolation constraint (see §8 for the DRY tradeoff this represents).
  - **Collections** mode: a new component querying Shopify's `collections` search (`collections(first: N, query: $q)`), letting the merchant pick one or several. On save, the server action enumerates every product currently in each chosen collection (Admin API) to produce `resolvedMembers` (§3), and checks each one against the shared availability check (§3); any already claimed elsewhere produces a warning listing the conflicts before the merchant confirms. Both the resolution and the check are **save-time snapshots** — see §6 for why they can't be a hard, ongoing guarantee.
- **Start/end date+time fields**, interpreted in `shop.ianaTimezone` (fetched from the Admin API — a genuinely new read this app doesn't currently perform anywhere). These values are used two ways: displayed and compared in shop-local time throughout the admin UI and the storefront widget, and converted to UTC when sent to Shopify's `startsAt`/`endsAt` on the native discount record (§5), since that's the timezone the Admin API's `DiscountAutomaticAppInput` expects.
- **Pricing mode** (percent/fixed) + a single **amount** field — no tier rows.
- **Submit button gated on completeness**: disabled until name, title, both dates (end after start), a valid amount, and a non-empty selection are all present, with a plain-text hint — the same pattern just added to the existing discount form (`src/app/discounts/new/page.tsx`), applied consistently here as a fresh implementation in the new module.
- Discount list: shown on the existing home page (`src/app/page.tsx`) alongside the existing discounts, in one unified list, but each row rendered via new-module code (a thin adapter reads from both configs and renders whichever kind each row is) — not a shared row renderer, to keep the isolation boundary intact even at the display layer. (Splitting into two separate lists/tabs remains an easy option if this turns out to feel cluttered in practice.)
- **Shopify discount record lifecycle**, new responsibility for this module's actions (§5 explains why each `TimeDiscount` needs its own real Shopify record):
  - `createTimeDiscount` calls `discountAutomaticAppCreate` (functionId = the new `extensions/time-based-discount/` Function, title = the discount's `title`, `startsAt`/`endsAt` = the converted UTC values), stores the returned GID as `shopifyDiscountId`, then writes the discount-owner metafield (§5) with `resolvedMembers`/`pricingMode`/`amount`.
  - `updateTimeDiscountSchedule` calls `discountAutomaticAppUpdate` on `shopifyDiscountId` whenever dates or pricing change, and re-writes the discount-owner metafield if `resolvedMembers`/pricing changed.
  - `updateTimeDiscountSelection` re-writes the discount-owner metafield after re-resolving `resolvedMembers` (§3, §6).
  - `deleteTimeDiscount` calls `discountAutomaticAppDelete` on `shopifyDiscountId` (Shopify cleans up the record's own metafields automatically) in addition to this module's existing product-metafield-clearing step.

## 5. Checkout / Function Mechanics

New Rust Function extension: `extensions/time-based-discount/` — its own `shopify.extension.toml`, own Cargo project, own `cart_lines_discounts_generate_run.graphql` query. No shared code with `extensions/product-discount/`, and no shared Shopify discount record either (see below) — the two Function extensions are fully independent both in code and in how Shopify invokes them.

**Each `TimeDiscount` is its own real Shopify `DiscountAutomaticApp` record**, created via `discountAutomaticAppCreate` (§4) with native `startsAt`/`endsAt`. This is a deliberate departure from the existing `product-discount` Function's pattern (one shared record covering every discount via an internal config-blob loop) — chosen specifically so Shopify's own platform enforces the time window before ever invoking the Function, identically on **online checkout and POS**, with no polling, no self-invented status flag, and no risk of POS trusting stale app-set state. The existing discount system is unaffected — it keeps its one-shared-record pattern exactly as-is (§2).

Because scheduling is native, the Function itself never sees or evaluates dates at all. Per invocation (i.e. per cart, whenever Shopify has already determined this specific discount's window is open), the Function:

1. **Reads its own config from a metafield on its own discount record** (`shopifyDiscountId`, the "function owner" pattern) — `resolvedMembers`, `pricingMode`, `amount`, written at save time (§3, §4). This is the Function's only source of truth; it does not read a shared config blob, and does not read product metafields.
2. **Per cart line, checks whether the product/variant appears in that `resolvedMembers` list** — exact `{productId, variantId?}` match, same "no variantId = matches any variant" rule as the existing app (`Member::variant_id: Option<String>`).
3. If it matches, applies the flat `amount` as `percentOff` or a fixed per-unit price — no tier lookup, no quantity thresholds, per §2's "flat discount only" constraint.

**Why the Function can't read from a shared blob or from product metafields, and must read from its own discount-owner metafield:** Shopify invokes a given `TimeDiscount`'s Function instance only when *that* discount's native window is open — but the invocation still receives the *entire* cart, which may include a line for a product belonging to a *different*, currently-inactive `TimeDiscount`. If the Function's per-line check were "does this product have a `sparkly_time_discounts` product metafield" (i.e. reusing the storefront-display metafield from §7 as pricing truth), an inactive sibling discount's still-present product metafield could get incorrectly discounted by an unrelated, currently-active invocation. Scoping the Function strictly to its *own* `resolvedMembers` (read from its own discount record, not the product) makes this structurally impossible — an invocation can only ever discount lines that are actually its own members, regardless of what any other discount's data looks like. The product-level metafield (§7) is kept, but purely for the storefront countdown widget to read for display — never for pricing truth.

**Design note — the two mechanisms originally considered for evaluating the time window *inside* the Function were both rejected, and are now superseded entirely rather than needed at all, since scheduling moved to Shopify's native, per-record `startsAt`/`endsAt` instead:**

- *Live `product.inCollection(id)` checks at checkout*: would have required a metafield on the specific Shopify discount record owning the Function (the "function owner" pattern) — at the time this was rejected as meaning "a real Shopify discount record per `TimeDiscount`," which was judged too heavy a departure from this app's shared-record pattern. That per-discount-record architecture is exactly what's now been adopted anyway (for the time-window problem below), which reopens `inCollection` as technically viable — **not adopted here regardless**, since the already-approved `resolvedMembers` save-time-snapshot approach (§3, §6) is simpler, was already approved by the user for reasons independent of the scheduling mechanism, and avoids a live collection lookup at checkout. Noted for completeness, not as an open decision.
- *`shop.localTime.dateTimeBetween(startsAt, endsAt)` called directly in the Function*: verified against the pinned `extensions/product-discount/schema.graphql` to require both arguments as static/literal query-time values, with no zero-argument "current time" field — unworkable for a Function meant to evaluate an arbitrary number of discounts' distinct windows inside one static query. Moot now: the Function never evaluates a window at all, native scheduling does.

Because a product can only ever be an explicit member of *one* discount (either kind) by the §2 constraint, and `resolvedMembers` is only recomputed at save time (§6), there is no scenario where this Function and the existing one both legitimately try to discount the same line under normal operation — and if collection drift ever produces that scenario anyway, Shopify's own "only the best automatic discount from an app applies" behavior (confirmed current, via direct research during design) means the customer sees one sensible discount, not a crash or a double-discount.

## 6. Known Limitation: Collection Drift

Collections are Shopify-native and can change outside this app entirely — a merchant adding a product to a chosen collection via the standard Shopify admin, weeks after the time-based discount was created, is invisible to this app until/unless someone reopens and re-saves that discount. This affects two things identically, since both are driven by the same `resolvedMembers` snapshot (§3):

- **Membership**: a product added to the collection after save won't get the discount at checkout until the discount is re-saved (which recomputes `resolvedMembers`).
- **Cross-discount exclusivity**: the save-time availability check (§4) can't see a conflict that only exists because of drift that happened after that save.

Guaranteeing either of these live, continuously, would require a live Function-side `inCollection` lookup instead of the `resolvedMembers` snapshot (technically possible now that each discount has its own record, §5, but not adopted — noted there as a deliberate non-change) or the two Functions coordinating live at checkout — real complexity the user explicitly weighed against in favor of keeping this module isolated and simple.

**Accepted behavior**: everything derived from a collection selection — both which products are discounted, and whether they conflict with another discount — is a snapshot taken when the discount is created or last saved. Any drift after that point falls back to Shopify's native best-discount-wins tie-break at checkout — not a crash, not a double-discount, just not pre-emptively prevented, and correctable by simply re-opening and re-saving the discount. This is a deliberate, user-approved scope boundary, not an oversight, and it's the same tradeoff the existing discount system already makes for its own explicit member lists (nothing in this app re-resolves membership automatically; a merchant edits a discount to change what it covers).

## 7. Storefront Widget

New theme app extension **block** inside the existing `product-tier-pricing` extension (not a second extension) — chosen so merchants add one extension to their theme and then place individual blocks, rather than needing to discover and install a second, separate app extension for a second discount type.

- `extensions/product-tier-pricing/blocks/time-based-discount.liquid` — own schema entry (independently placeable in the theme editor, anywhere on the product template), reads a new `product.metafields.sparkly_time_discounts.discount` metafield, written to every resolved member product whenever a `TimeDiscount` is created or saved (new metafield namespace; display-only — see §5 for why this is kept separate from the metafield the Function actually reads for pricing).
- `extensions/product-tier-pricing/assets/time-based-discount.js` — own file, no imports from or edits to `tier-pricing.js`. Contains:
  - A pure function computing `{days, hours, minutes, seconds, expired}` from `startsAt`/`endsAt`/now — small, independently unit-testable.
  - A once-a-second tick updating the DOM digits (DAY / HRS / MINS / SECS boxes, matching the reference screenshot).
  - Self-hiding when the countdown reaches zero *while the customer is on the page* (not just frozen at `00 00 00 00` until next reload).
- **Scope**: countdown-only. Does not show a discounted price preview or strikethrough on the product page — the actual price change happens at cart/checkout via the Function (§5), same as how the countdown is purely informational up to that point. (If a live price preview turns out to be wanted later, that's an addition to this widget, not a redesign — flagged as a possible v2, not built now.)
- **Pre-window behavior**: the widget only renders once the window is active (`startsAt <= now < endsAt`). A discount scheduled for the future produces no "starts in" state — out of scope for this spec (YAGNI; not in the original request).
- **Color**: a configurable block setting (e.g. `countdown_color`), defaulting to the red shown in the reference screenshot, following the same pattern as the existing block's `moss_color`/`cream_color`/`sun_color` settings — so the merchant can retheme without touching code, while shipping with a sensible default.

## 8. Deliberate DRY-vs-Isolation Tradeoff

Building a second product/variant picker, a second date-completeness-gated form, and a second metafield-sync routine that are each *shaped like* existing code but implemented separately is real, acknowledged duplication. This is a deliberate choice, not an oversight: the user's explicit requirement is that a bug or change in one discount kind's code can never affect the other, and that a third discount kind can be added later without touching either of the first two. Sharing UI/logic components across kinds would reintroduce exactly the coupling this spec exists to avoid. The one exception (§3's shared availability check) is narrow, one-directional in purpose (read-only membership lookup), and justified by a constraint (cross-kind exclusivity) that cannot be honored any other way without either kind knowing about the other.

## 9. Testing Strategy

- **Rust Function**: fixtures for a matching discount and the percent/fixed pricing math against `resolvedMembers` read from the discount-owner metafield, plus a fixture confirming a line for a product *not* in `resolvedMembers` produces no discount even though the discount is (per the fixture's own simulated input) active — mirroring the existing suite's style and conventions in `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`. No window/time-based fixtures are needed at all now (§5: scheduling is native, the Function never evaluates dates), and no collections-specific fixture is needed since by the time the Function runs, a Collections-mode discount looks identical to a Products-mode one.
- **Admin (Vitest)**: same `vi.spyOn(shopifyClient, 'shopifyQuery')` mocking convention already established. Covers: the discriminated-union selection validates as products-XOR-collections; the completeness-gated submit button; **collection-to-`resolvedMembers` resolution** (a mocked collection query producing the correct flat member list on save — this is where collections-mode complexity actually lives, not in the Function); the shared availability check correctly spans both configs in both directions (a time-discount member is excluded from the existing picker, and vice versa); **Shopify discount record lifecycle** (§4, §5) — `createTimeDiscount` calls `discountAutomaticAppCreate` with the correctly-converted-to-UTC `startsAt`/`endsAt` and stores the returned GID, `updateTimeDiscountSchedule`/`updateTimeDiscountSelection` re-write the discount-owner metafield with the correct `resolvedMembers`/pricing payload, `deleteTimeDiscount` calls `discountAutomaticAppDelete`.
- **Storefront JS (`node --test`)**: pure countdown-math function tested directly (before window, during window, at exact expiry, just-past expiry) without needing a DOM; DOM-level hide-on-expiry tested the same way the existing widget's DOM layer is (a thin paint function over a tested pure core). This remains the one layer needing before/during/after-window coverage — the widget ticks down from the stored `startsAt`/`endsAt` directly, entirely independent of the Function/native-scheduling mechanism.
- **Timezone correctness**: at least one test case spanning a DST transition in the shop's configured timezone, for both the shop-local-to-UTC conversion used when creating/updating the native discount record's `startsAt`/`endsAt` (§4) and the storefront countdown math (§7), since that's the class of bug most likely to slip through otherwise.
- **Manual verification** (live store, before considering this done): the collection-drift fallback from §6, and confirming the native `startsAt`/`endsAt` scheduling actually activates/deactivates the discount at the right moment on **both online checkout and POS** (§5) — the whole reason this mechanism was chosen over the earlier polling-based proposal — added to whatever this feature's equivalent of the existing "Task 13" manual verification step turns out to be.

## 10. Out of Scope (this spec)

- Quantity tiers within a time-based discount (the "initially" qualifier from requirements — a real future possibility, not built now).
- A live discounted-price preview on the product page (countdown-only per §7).
- A "starts in" pre-window widget state.
- Hard, live cross-Function enforcement of collection-drift exclusivity (§6's accepted limitation).
- Any change to the existing discount system's code, data, or Function.
