# Cart-Aware Mix & Match Widget — Root Cause & Fix

**Context:** Follow-up bug report on the mix & match tier-pricing widget shipped 2026-08-04 (PR #4, `docs/superpowers/plans/2026-08-03-mix-match-widget-redesign.md`). Debugged via `superpowers:systematic-debugging`.

## Reported symptoms

With 7 tins already in cart across different Canagan flavours (2 tuna, 2 ocean fish, 3 chicken), visiting the tuna product page showed:
1. Progress bar / callout read "6 of 7" instead of the true 7 already in cart.
2. No discount displayed (price not crossed out) even though the true combined quantity had already crossed the discount threshold.
3. The quantity stepper started at 1 with no indication that 2 tuna were already in the cart.
4. (Raised separately) the mix & match product list only showed *other* qualifying products, not the current product's own cart quantity.

## Root cause (confirmed live, reproduced with a real cart on production)

`otherQty` — the input to `combinedQty = otherQty + addingQty` — was computed from sibling products' cart quantity only, deliberately excluding this exact product's own cart-resident quantity (see the superseded note in the 2026-08-03 plan). The on-page quantity stepper was also never seeded from real cart state and never reset after a real Add to Cart. Net effect: "how many of *this* product are already in the customer's cart" never reached the pricing/progress math at all.

Live reproduction: cart = tuna 2, ocean fish 2, chicken 3 (7 true total). Widget showed `combinedQty: 6` (= 5 siblings-only + 1 default stepper), undiscounted price, stepper at "1" — exactly matching the report.

A second, related risk was found and confirmed live before shipping the fix: this theme's Add to Cart is AJAX (`<product-form>`, POST to `/cart/add.js`, no page navigation) and its quantity stepper does **not** reset after a successful add — verified by a real button click (qty 2→5 on Ocean Fish, stepper stayed at "3" afterward). Naively including self-quantity in the cart sum without addressing this would have reintroduced exactly the double-counting bug the 2026-08-03 plan's exclusion was protecting against, just relocated to immediately-after-add instead of "product revisited across sessions."

## Fix

1. **`otherQty` now reflects the true combined quantity already in the real cart**, across every product counting toward the discount *including this one* (`allDiscountHandles = [productHandle, ...siblingHandles]`, or just `[productHandle]` for standalone).
2. **`cartBaselineOtherQty(trueCartQty) = max(0, trueCartQty - 1)`** converts that true total into the `otherQty` value `computeProgressState` expects. The stepper's native floor of 1 (never 0) isn't "one extra unit being added" — it's just the widget's resting state — so the `-1` cancels it. Net result, confirmed against the user's exact spec: on load, combined reads the true cart total exactly; each `+` click moves it up by 1; each `-` click moves it down by 1, floored at the true cart total (enforced automatically by the stepper's own floor of 1 — no extra clamping needed).
3. **The stepper resets to 1 whenever the widget observes this product's own cart quantity increase** since the last check (`lastKnownSelfQty` tracked across renders, `null` sentinel avoids a false reset on first load). This is what makes point 2 safe against the double-counting risk above — it doesn't touch `/cart/add` semantics at all, only the display stepper's value afterward.
4. **Standalone (non-group) discounts got the same fix**, not just group/mix-and-match — the root cause ("this product's own cart quantity is invisible to the math") is identical for a single-product discount. Cart-fetching is now gated on `tiers.length > 0` instead of `group` truthiness, so plain non-discounted products still skip the network call entirely.
5. **The mix & match product list now includes the current product itself** (with its own live cart quantity), not just siblings — the Liquid block now serialises `group.self` (title/handle/image, mirroring each sibling's shape) alongside `group.siblings`.

## What did NOT change

- `/cart/add` submission semantics — still a plain "add N units, Shopify merges with the existing line" request. No delta/set-quantity logic was introduced.
- Tier buttons and the dashed temp-box preview — still keyed off the raw stepper value (`addingQty`) alone, untouched by this fix (per the 2026-08-03 plan's own note, still accurate).
