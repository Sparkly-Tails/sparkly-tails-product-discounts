# Product overlap only while live: implementation plan

**Goal:** a product is refused only while another discount that holds it is active.
**Spec:** `docs/superpowers/specs/2026-10-31-product-overlap-only-live-design.md`
**Tech:** Next.js server actions, vitest. New code follows the owner's 8 code guidelines (new files are lint errors; legacy files warn).

## Global constraints

- Messages are exactly those in the spec.
- Bump `package.json` and the first two version fields of `package-lock.json` in every code commit (now 0.23.102).
- Tests first, watched failing. One vitest process at a time.
- No AI attribution in commits or PR text. Never commit to main, never merge, never deploy.

## Review focus

- A discount does not conflict with itself (edit of a live discount).
- A whole product against a variant of it (both directions).
- A draft discount saves with an overlap; going live then refuses.
- An expired time-based discount does not refuse a live flash sale; an upcoming one does.
- A refusal changes nothing (nothing saved, storefront untouched).

## Tasks (each is its own PR, stacked on the one before)

### 1. `src/form/claims.ts` (pure)

Interfaces produced:
- `interface Claim { kind: 'tier' | 'time'; discountId: string; discountName: string; productId: string; variantId?: string }`
- `listLiveTierClaims({ discounts }: { discounts: Discount[] }): Claim[]` (members of `status === 'live'` discounts)
- `listOpenTimeClaims({ discounts, isOpen }: { discounts: TimeDiscount[]; isOpen: (window: { startsAt: string; endsAt: string }) => boolean }): Claim[]` (items of discounts for which `isOpen` is true; name is `title`)
- `findClaim({ claims, productId, variantId, discountId }: …): Claim | undefined` (same match rule as `isProductAvailable`; claims of `discountId` skipped)
- `describePickRefusal({ claim, isVariant }): string`, `describeSaveRefusal({ claim, memberTitle }): string`

Tests (`tests/form/claims.test.ts`): live claimed, draft not claimed, own discount skipped, whole product vs variant both ways, other variant free, time claim only when `isOpen`, both messages exactly as in the spec for a tier and a time claim.

### 2. `src/form/claimChecks.ts` (injected steps)

- `checkMemberFree({ productId, variantId, discountId, tools }): Promise<{ ok: true } | { ok: false; error: string }>` with `tools: { loadClaims: () => Promise<Claim[]>; findClaim; describePickRefusal }`.
- `assertFreeOfClaims({ members, discountId, tools }): Promise<void>` throws `Error(describeSaveRefusal(...))` for the first conflicting member; `tools: { loadClaims; findClaim; readMemberTitle: (member) => Promise<string>; describeSaveRefusal }`.

Tests with fakes (`tests/form/claimChecks.test.ts`): ok when no claim; error text naming the discount; throws naming product title and discount; first conflict only; title is looked up only on a conflict.

### 3. Picker stops hiding (`src/form/claimTools.ts`, `src/actions/memberPickerActions.ts`, `ProductSearch`, `ProductsCard`)

- `claimTools.ts` wires `loadLiveTierClaims`, `loadOpenTimeClaims` (shop timezone + `computeTimeDiscountStatusLabel`), `readMemberTitle` (`getMemberInfo`).
- `searchProductsAction(query)`, `listProductsAction()`, `getProductVariantsAction(productId)` no longer filter and no longer take `excludeDiscountId`. `validateMemberAction(productId, variantId, discountId?)` answers with `checkMemberFree`.
- `keepAvailableProducts` is deleted. `ProductSearch` tool types lose `excludeDiscountId` on find/list/variants (still passed to `checkMember`).

Tests: update `tests/actions/memberPickerActions.test.ts` (search returns a product that is claimed, validate returns the exact error for a live discount, ok for a draft, ok for its own discount) and the component tests whose tools change.

### 4. Save flow

- `SaveTools`: replace `assertMembersAvailable` and `assertMembersAvailableEverywhere` by `assertFreeOfLiveDiscounts(members, discountId)` and `assertFreeOfOpenTimeDiscounts(members, discountId)` (both wrap `assertFreeOfClaims` with `claimTools`).
- `checkAvailability`: when `next.status === 'live'` check `assertFreeOfLiveDiscounts(next.members, next.discountId)` first; then `assertPricingAllowed`; then `checkLiveAvailability` (live flash only) uses `assertFreeOfOpenTimeDiscounts`.

Tests: update `tests/form/saveFlow.test.ts`, `saveTools.test.ts`, `tests/actions/saveDiscountEndToEnd.test.ts`: draft saves with an overlap; go live refuses and nothing is saved; live edit of its own discount passes; live flash against an upcoming time-based discount refuses, against an expired one passes.

### 5. Cleanup

Remove `assertMembersAvailable` and `assertMembersAvailableEverywhere` from `src/actions/discountSteps.ts` (and now-unused imports); update the stale comments. Final self-review of the whole stack against the spec.
