# Pre-checkout bundle pop-up

Date: 2026-11-10. Status: design for review; nothing is built. Design source: Stitch project 6370617737489629500, screen 6c39faa65d82499f8d82e4001a79fe07 ("Pre-Checkout Bundle Modal"), as the owner changed it below.

## Intent

A customer who has put some products of a bundle (a mix-and-match discount) in the cart, but not enough to reach its first tier, is about to leave for checkout and lose the offer without knowing how close they were. When they press Checkout, a pop-up shows one box per such bundle, says how many more items unlock the first tier, and lets them add those items right there. They can also carry on to checkout unchanged.

The goal is more bundles completed (larger carts) without getting between the customer and checkout.

## Goals

- One box per incomplete bundle in the cart, in the design's two forms: expanded (with the bundle's tier chips and the Quick auto-fill row) and contracted (title, badge, one line, two buttons).
- The customer completes a bundle in one or two taps: per-item Add buttons, or Quick auto-fill.
- A flash sale shows its countdown on its box.
- Everything in the customer's displayed currency, like the cards and the widget now do (#189, #190).
- The discount form gets its customer-facing title back, and the storefront data carries it.
- Per discount, the owner chooses whether the pop-up shows once per session or at every Checkout press.
- The pop-up never stops a customer reaching checkout: any failure means checkout goes ahead.

## Non-goals

- No footer bar (the design's sticky footer is dropped).
- Not for "Buy it now" (it skips the cart; a separate component) and not for express buttons (Shop Pay, PayPal, Apple Pay) that do not go through the Checkout button.
- No per-discount on/off switch, no analytics or metrics, no translations (English only, like the widget's copy).
- Bundles that already reached their first tier get no box. (Tier 2 and up are not promoted here.)
- Zero-decimal currencies, as for the cards.

## Anti-goals (would make this a failure even if it works)

- A pop-up that blocks checkout, or that loops (Checkout pressed, pop-up, Continue, pop-up again).
- A pop-up on a bundle the customer cannot complete (not enough stock).
- Wrong-currency prices, or prices that differ from the cart's.
- Anything thrown into the page: a theme that does not match what the script expects must simply see no pop-up.

## Owner's decisions

1. The design above, without the footer; a "Continue to checkout" link at the bottom of the content instead.
2. Per-item Add buttons are the main way to add; Quick auto-fill ("add all") is the shortcut.
3. The bundle title is the discount's customer-facing `title`; it returns to the form and to the data.
4. The pop-up and the card embed show the customer's active currency.
5. Quick auto-fill stays. It takes products already in the cart first. Its label is "Quick auto-fill: Add {count} more items" ("items", not tins); the button is "Add {count} & unlock tier".
6. A per-discount option: once per session, or at every Checkout press.
7. The currency fix and the card split come first (done: #189, #190).
8. The pop-up gets its look from the app as the widget does: each box follows its discount's style (the Design card of the form), with the embed's colour settings behind it (see "The look").
9. Fonts are the theme's own; nothing is loaded from outside the shop.

## What the customer sees

### When it opens

The customer presses a Checkout button (`[name="checkout"]`: the cart page, the cart drawer and the cart notification of the demo theme). The script stops that press, reads the cart (`/cart.js`, fresh each time), and works out the boxes due:

- A live discount is *incomplete* when the cart holds at least 1 and fewer than its first tier's `minQty` of its members' units. A member without a variant counts all lines of that product; a member with a variant counts that variant only (the widget's `sumMemberQuantityInCart` rule). A flash sale counts only while it runs (the cards' `flashPhase` rule).
- A product belongs to at most one live discount (the overlap rule), so units are never counted twice.
- A discount is *due* when it is incomplete, can be completed from available stock, and either its option is "every press" or it has not been shown in this tab's session. "Can be completed" means: the available eligible variants (see "The eligible items") could supply the missing units, taking each available variant as able to supply any number of units. The pop-up knows only `available` (yes or no) per variant, not quantities; an add the store refuses for stock is handled when it happens (see "Adding").
- The press waits for `/cart.js` and then, in parallel, for `/products/{handle}.js` of the member products of the due discounts. The whole wait has a budget of 2 seconds; when it runs out, or any request fails, the press goes ahead (checkout is never held up longer). Nothing is fetched before the press.
- No box due: the checkout press goes ahead at once, as if nothing was there.
- One or more due: the pop-up opens with the first box expanded.

"Shown in this session" is a `sessionStorage` key per discount, written when the pop-up shows its box (not when the customer adds something), always inside try/catch; with storage blocked, the pop-up shows every time.

### The pop-up

A modal dialog (a `<dialog>` opened with `showModal`): a heading ("Complete your bundle" / "Complete your bundles", my wording), a close button, the boxes in a scrolling list, and the "Continue to checkout" link under them. Escape, the close button and a click on the backdrop close it *without* going to checkout. On a phone it fills the width and scrolls. Focus moves into the dialog and returns to the Checkout button when it closes.

### The boxes

The box in view is expanded; the others are contracted. "In view" is worked out with an `IntersectionObserver` on the list: the most visible box is expanded; the first box is expanded when the pop-up opens; pressing "View & mix eligible products" on a contracted box expands it and contracts the other. With reduced motion, no animation.

**Both forms:** the discount's `title` (heading), a badge, and the incentive line.
- Badge: "Tier 1 at {minQty} items" for a fixed-price tier; "Unlock {percent}% off at {minQty} units" for a percentage tier.
- Incentive line: "Currently {units} units selected • Add {missing} more to unlock {price}/ea" for a fixed-price tier, with " (Save {amount} on these items!)" after it, where the amount is `(base price − tier price) × minQty` (fixed-price tiers need one shared base price, so it is known). For a percentage tier: "{units} of {minQty} items selected • Add {missing} more to unlock {percent}% off the whole bundle".

**Expanded form adds:**
- The flash bar on top when the discount is a flash sale: "⚡ TIER 1 FLASH SALE ENDS IN" with the countdown (the widget's `formatFlashCountdown`).
- The tier chips, as in the design: each chip is a quantity and the *total* price for that quantity, like the widget's tier buttons on the product page ("1 × £1.69", "5 × £8.45 (Current)", "8 × £13.00 (Tier 1)", "16 × £24.80"). The chips are: 1 unit at the plain price, the customer's current units at the plain price (marked "Current"; when the current units are 1 this is the first chip, marked "Current"), the first tier, and the next tier when there is one. The next-tier chip is information only: no box is promoted for tier 2. The totals are the widget's own (`computeTierState` and `unitPriceAtTier`), so a percentage tier with an `anchorPrice` shows its anchored total like the widget. Chips show only when the members share one base price (fixed mode always); with different prices in percent mode there are no chips.
- The list of eligible items (below), then the Quick auto-fill row: "⚡ Quick auto-fill: Add {missing} more items (+{cost})" and the button "Add {missing} & unlock tier".

**Contracted form adds:** two buttons: "View & mix eligible products ({count} available)" (expands the box) and "⚡ Quick-add {missing} to unlock {percent or price} (+{cost})".

`{cost}` is the sum of the live prices of the units Quick auto-fill would add.

### The eligible items

Each eligible item is one variant: image, "Product – Variant" (just the product when it has one variant), its live price, and an Add button. Eligible means: a variant of a member product (all variants for a member without a variant; only the listed one for a member with a variant), available. Items come from `/{root}products/{handle}.js`, which gives prices in the customer's currency (shopify.dev Ajax Product API reference). Each press adds 1 unit; the item shows how many are in the cart.

### Quick auto-fill

It adds `missing = firstTier.minQty − units` units, one unit per variant per pass: first the eligible variants already in the cart, in cart order, then the others in the index's order, repeating the passes until `missing` units are chosen; sold-out variants are skipped. All in one `POST /cart/add.js` with several items.

### Adding, and what happens after

After an add the box is recomputed from a fresh `/cart.js`. When it reaches the first tier it shows "Tier unlocked" and its buttons go; a completed box stays until the pop-up closes. If an add is refused (for example 422: more than is in stock), the box shows "We couldn't add that. Try again." and the cart is re-read.

- **Continue to checkout, when nothing was added:** resumes the stopped press. The script sets a "let this one through" flag, then `form.requestSubmit(button)` for a button inside a form, or follows the link for a link. The flag makes sure the pop-up does not open again.
- **Continue to checkout, when something was added:** the script goes to `{root}checkout` instead of resubmitting the theme's form. On the cart page the Checkout button belongs to the cart form, which also holds the quantity fields (`updates[]`) as they were when the page loaded, so submitting it would send the old quantities. Going to checkout directly loses nothing: checkout reads the cart on the server, and the demo theme saves quantity changes and the cart note as soon as they are changed (read in its `cart.js`), not on submit.
- **Close without continuing:** if something was added, the page is reloaded so the cart on the page shows it; otherwise nothing happens.

## Data and the form

### The discount form

A "Title" text input returns to the Details card (`DetailsCard.tsx`), labelled as what customers see. The field is optional. A new discount's title is prefilled from its name (it is its name today). A blank title makes the storefront use the discount's name.

### The discount

- `title` already exists (`Discount.title`, "Customer-facing copy… Blank allowed") and is already saved; the form just never lets the owner change it. `saveSteps` must save what the form sends instead of `values.name` for a new discount, and keep the saved one for an existing discount only when the form has none.
- New optional field `popupFrequency?: 'session' | 'checkout'` on `Discount`; absent means `'session'`. It is a select on the form ("Show the pop-up: once per session / at every checkout press"). It is stored in the same shop metafield as the rest of the discount, so there is no database migration.

### The storefront data

The pop-up needs more than the card index has. The card index (`tier_card_index`, `src/lib/cardIndex.ts`) gets three more fields per discount: `title` (the title, or the name when blank), `popupFrequency`, and `style` (the discount's `{ backgroundColor, cornerRadius }`, absent when the discount was saved before styles existed). Members already carry `productId`, `handle` and `variantIds`; tiers and the flash window are already there. Adding fields is backward compatible: the card script ignores what it does not know.

## The look

Each box takes the look of its discount the way the widget does (`src/lib/widgetStyle.ts`, `blocks/tier-pricing.liquid`): a discount's own style, saved with it from the Design card, wins; where it has no usable value the embed's theme-editor setting applies; below that the stylesheet's default.

- **Background colour:** the discount's `style.backgroundColor` (`#RRGGBB` or `#RRGGBBAA`), else the embed's `cream_color` setting (default `#f3ecd9`, as the widget block), else the stylesheet's.
- **Corner radius:** the discount's `style.cornerRadius` (0 to 24 px; the inner corners derived from it as the widget does), else the stylesheet's default.
- **Accent colours:** the embed's `moss_color` (default `#434625`) and `sun_color` (default `#ffdc4c`) settings, as the widget's block settings.
- **Safety:** nothing but a whole hex colour and a number inside the range can reach CSS: the script checks both again (the same rule as `readHexColor` and the Liquid check) because the index is text. A bad value falls back as above.
- **In the page:** the values are set as the widget's CSS custom properties (`--smooth-discounts-cream`, `--smooth-discounts-moss`, `--smooth-discounts-sun`, `--smooth-discounts-radius`) on each box, so the stylesheet shares the widget's tokens.
- Fonts are the theme's own and nothing is loaded from outside (owner's decision 9); the design's Fraunces and Plus Jakarta Sans are not used.

## Currency

The same rule as the cards. Live prices from `.js` and `cart.js` are already in the customer's currency. The index's fixed and anchor prices are in the shop currency and are converted with `Shopify.currency.rate` by the existing `currency` component (`tier-pricing-currency.js`); amounts are written with the theme's `money` format from the sample the embed prints. If the rate or the sample cannot be read, the pop-up does not open (checkout goes ahead).

## Where the code lives

A new app embed, "Bundle pop-up" (`blocks/bundle-popup.liquid`, target body), with its own script and stylesheet, switched on in the theme editor. It prints the index and the currency attributes itself (`data-shop-currency` and `data-money-sample`, as the card embed does from #190 and the widget block does; both embeds may be on, so the index can be printed twice) and does not depend on the card embed.

The embed's schema has the widget block's three colour settings (`moss_color`, `cream_color`, `sun_color`, same defaults) for the fallback of "The look".

**Base:** this builds on #190 (the card script split, which adds the card embed's currency attributes and the `runCardScripts` test helper) and shares files with it (`scripts/extensionFiles.mjs`, `tests/helpers/builtWidget.ts`, `tests/scripts/extensionContract.test.ts`). The pop-up branch is stacked on `feat/card-prices-currency` while #190 is open and is retargeted to `dev` once the owner merges it (the owner merges in order).

Scripts follow the widget and card pattern: a core script and components, each under Shopify's limit of 10,000 bytes (the build refuses larger). The builder decides the exact split; what the design expects:
- core (`bundle-popup.js`): finding the Checkout buttons, stopping and resuming the press, reading the cart, working out the boxes due, the loader.
- a UI component: the dialog, the boxes, the list, the adding, the countdown.
- reused as they are: the `currency` component, and `tierMath.js` (`computeTierState`, `unitPriceAtTier`, `formatMoney`, `sumMemberQuantityInCart`, `extractNumericId`) and `flash.js` (`flashPhase`, `formatFlashCountdown`).
- code rules as the rest of the project (pure functions, the owner's eight rules).

## When something goes wrong

| What | What the customer gets |
|---|---|
| `/cart.js` fails, or throws, or the 2 second budget runs out | checkout goes ahead |
| a component fails to load, the rate or sample cannot be read | checkout goes ahead |
| `/products/{handle}.js` fails for a product | that product is left out of the list; a box with nothing left to add is dropped |
| not enough available stock to complete a bundle | that bundle gets no box |
| an add is refused | message in the box; Continue still works |
| `sessionStorage` blocked | pop-up shows at every press |
| the theme's Checkout button is not `[name="checkout"]` | no pop-up (checkout works as before) |

## Calls I made (to check while reading)

1. A separate app embed, not part of the card embed (so cards and pop-up can be switched on separately; the cost is the index printed twice when both are on).
2. Frequency default is once per session (less intrusive), and the option's values are `session` / `checkout`.
3. Only bundles with 1 to first-tier-minus-1 units get a box; bundles with no units in the cart do not.
4. Quick auto-fill passes (one unit per variant per pass, in-cart variants first) is my reading of "products already in the cart first".
5. No chips when members have different prices in percent mode.
6. (Fonts: now the owner's decision 9, no longer a call.)
7. A bundle that cannot be completed from available stock gets no box; stock is known only as `available` per variant, so an over-ask is caught by the refused add.
8. Closing after an add reloads the page (themes differ in how a drawer refreshes); Continue does not need to, since checkout reads the cart.
9. The wording of the heading, the badge, "Tier unlocked" and the error message.
10. Continue goes to `/checkout` directly when something was added, and resumes the theme's own press otherwise.
11. A 2 second budget for everything the press waits for; nothing is fetched before the press (fetching ahead would cost every page a request for a pop-up few customers will see).
12. "Can be completed" means enough available variants, not real stock quantities (those would need inventory in the index, stale until the next save).
13. The chips are totals, as in the widget's tier buttons, with the next tier shown for information only.

## Verification

Tests, written first, in the existing styles:
- storefront tests (jsdom, the built scripts): which discounts are incomplete and due; the Checkout press stopped and resumed once (no loop); `requestSubmit` for a form button and navigation for a link; the once-per-session and every-press options; `sessionStorage` blocked; expanded and contracted forms; the flash countdown; Quick auto-fill choosing units (in-cart first, sold-out skipped, one request); a refused add; currency (converted fixed price, percent unchanged, unreadable rate means no pop-up); Continue after an add goes to `/checkout` and does not submit the form, Continue without an add resumes the press once; the 2 second budget (a slow `/cart.js` ends in checkout going ahead); every failure row of the table above ends with checkout going ahead.
- the look: a box takes its discount's background colour and radius; a missing style, a colour that is not a whole hex code, or a radius out of range falls back to the embed setting and then to the stylesheet; two boxes can have two looks.
- form and server tests: the Title input, `popupFrequency`, saving, loading; `cardIndex` carrying `title`, `popupFrequency` and `style`.
- contract tests: the new scripts in the build list, the block's attributes and component addresses; sizes under 10,000 bytes.

On the demo store (the owner types the storefront password in their own terminal tab, per the project guide): the pop-up opens from the cart page, the drawer and the notification; adds work; Continue reaches checkout; the page is checked in a phone-width viewport.

## Not verified

- The checkout press behaviour was seen only on the demo theme (one theme): other themes may differ. That the cart form holds the old quantities, and that the theme saves quantity and note on change, was read in the demo theme's code, not run.
- No second currency exists on the demo store, so nothing here has run in a real foreign currency (same as #189 and #190).
- Whether the page's rate equals the Function's `presentmentCurrencyRate`.
- Behaviour with infinite scroll or heavy third-party cart apps is not known.

## Order of work (for the plan)

1. Data and form: `title` field, `popupFrequency`, the index fields (server side, with tests).
2. The storefront scripts and the embed (core, UI component).
3. Demo-store check, then the PR(s). The owner merges and deploys.
