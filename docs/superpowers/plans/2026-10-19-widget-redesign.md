# Widget redesign (Stitch design) — milestone plan

**Goal:** migrate the storefront tier-pricing widget to the Stitch screen "Tiered Discount Widget - Multi-Tier Explorations (8 & 16+ Tins)" (project 6370617737489629500, screen 25433097afea432dbbe9ff2564f3f213, "direction 2"), keeping the theme's own fonts and colours.

**Branching:** `milestone/widget-redesign` (cut from `origin/dev` at 2c798da). Every PR below targets it. One final PR into `dev` with a real merge commit (never squash). The owner merges and deploys (`shopify app deploy`); nothing here deploys. Code PRs bump `package.json` and the two top fields of `package-lock.json`; docs-only PRs do not.

## What the owner decided (2026-10-19)

1. The mix & match list changes the **real cart** (`/cart/add.js`, `/cart/change.js`); the progress bar, dot, copy and tier buttons must update and stay aligned with it.
2. Rows and variants: in the discount admin a product with several variants must always be added as a specific variant; only a single-variant product is added whole (owner, confirmed in code: `src/lib/config.ts` documents it and `src/components/MemberPicker.tsx` enforces it by forcing a variant choice when `variantCount > 1`). So every row resolves to exactly one variant and always gets a stepper. Edge case, inferred and not verified: a whole-product member whose product later gains a second variant; that row falls back to a "Choose options" link.
3. A row's price is the per-unit price at the current combined quantity.
4. Copy: "Tier 1 / Tier 2" is replaced by **"Offer unlocked"** for any middle tier and **"Highest discount unlocked"** for the highest tier. No emoji.
5. The "State 1/2/3" tags on the design are annotations and do not ship.

Things the owner said about the design: it shows the tier layout, the active tier and the checkout; it lacks the **dashed temporary box** for a quantity between tiers (keep the existing one); it shows the copy to use per selection; it does **not** use the right fonts and colours (use the theme's, as the widget does now); the progress dot shows the **current quantity** and the bar shows the **start and end number of each tier**; mix & match rows allow adding products directly; it defines the layout and structure.

## Copy per state (derived from the design; wording not given by the owner is marked *mine*)

| State | Line under the price | Status row (left / right) |
|---|---|---|
| Below the first offer | "Mix and match 8+ for £1.63 or 16+ for £1.55" (not a group: "Buy 8+ for …") | "You have 5 units" / "Add 3 for £1.63/ea" |
| Middle tier reached | "Offer unlocked! Add 6 more to unlock the highest discount for £1.55" *(mine: the last clause; "the next offer" when the next tier is not the highest)* | "10 units × £1.63 (Offer unlocked)" / badge "Save £0.60" |
| Highest tier reached | "Highest discount unlocked: £1.55/each applied! (Save £2.24)" | "You have 16 units" / "✓ Highest discount (£1.55/ea)" |

Savings are measured on the combined quantity (10 × (1.69 − 1.63) = 0.60; 16 × (1.69 − 1.55) = 2.24, both match the design).

## Milestones (atomic PRs)

| # | Branch | Contents | Verification |
|---|---|---|---|
| 1 | `feat/widget-view-model` | Pure functions and view-model fields: dot position and start/end markers, offer/highest state, new copy, savings. No visual change. | `node --test`, theme check |
| 2 | `feat/widget-layout` | New Liquid + CSS: status row, white inner card, progress bar with the quantity dot; theme variables only. | tests, `theme dev` + `app dev` screenshots vs design |
| 3 | `feat/widget-tier-pills` | Tier pills with ✓ on the active one, Save badge, dashed temporary box restyled, every copy state wired. | same |
| 4 | `feat/widget-mix-match-rows` | Rows with thumbnail, name, price, quantity (read-only). Liquid passes each sibling's price, availability and a purchasable variant id. | same |
| 5 | `feat/widget-mix-match-cart` | − / + steppers that change the cart; errors (sold out, stock limit); re-render; keep the theme's cart count/drawer in step. | same + cart check |
| 6 | `feat/widget-hardening` | Keyboard and screen reader, reduced motion, phone width, time discount next to tiers, variant change, docs, skill update. | same |

Local testing for PRs 2–6 follows the skill `building-multistore-shopify-apps` (guide/06): `shopify theme dev` and `shopify app dev` on `demo-nlmhyat3` (the owner types the storefront password in their own Terminal tab), reload after each extension edit, then `shopify app dev clean`.

## Not verified yet

- Whether development theme 189405102334 still exists, and what tier/sibling data the demo product holds.
- How the live theme's cart drawer reacts to cart changes made by the widget (needed for PR 5).
- The project's two "Accessibility audit" screens have not been read; they are read before PR 6 and treated as requirements.
