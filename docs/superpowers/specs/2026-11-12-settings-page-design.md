# Settings page: one store-wide design, and three new settings panels

Date: 2026-11-12. Status: draft for the owner's approval; nothing is built. Design source: Stitch project 6370617737489629500, screen 7ae58b97ac4748d6be1f2825b2d0eee7 ("Settings - Smooth Discounts"); screenshot in `docs/superpowers/specs/assets/settings-page/settings-design.jpg`.

## Intent

Today every discount carries its own look (background colour, corner radius) and its own pop-up frequency, set in the discount form. The owner wants one look for the whole store, set once, and a Settings page to hold it together with the store-wide behaviour of the storefront widget and the pre-checkout pop-up. The Settings page is a milestone: it replaces the per-discount design, and adds Impression Frequency, Stacking and Theme Integration panels that do not exist in the app yet.

## What the owner decided

1. The Design card is removed from the discount form. The design is **global**: stored once for the store, applied to the product-page widget and to the pre-checkout pop-up. No per-discount override.
2. **All old values are removed**: the per-discount `style` and `popupFrequency`, from the form, the code and the stored data.
3. The discount form **keeps its widget preview**; it shows that discount's products, tiers and flash window painted with the global design.
4. The Settings page follows the Stitch design and has **its own design preview**: the widget with mock data (3 products, 3 tiers), and the pre-checkout pop-up as **placeholder areas only**, so the owner can see how the colours work together.
5. Store the settings **where it loads fastest** (the app or the database; the owner leaves the choice to me).
6. **Impression Frequency, Stacking and Theme Integration** are all new; this milestone builds the panels and the code behind them.
7. **The Urgency & Micro-Interactions panel is removed** (2026-11-12): no countdown-animation switch and no milestone-celebration switch. The flash countdown keeps ticking every second as it does today, and nothing is added for celebrations.

## What I found (repo and docs, read 2026-11-12 on `origin/dev` at 51bdb8b)

- The Design card holds two values per discount, `backgroundColor` and `cornerRadius` (`src/lib/widgetStyle.ts`), saved with the discount and copied into each product's `tier_discount` metafield and into the card index (`src/lib/cardIndex.ts`). `popupFrequency` is a select in `DetailsCard.tsx`, also saved per discount and in the card index.
- The accent (moss) and sun colours exist only as theme-editor settings of the blocks (`blocks/tier-pricing.liquid`, `blocks/bundle-popup.liquid`); the widget block also has a `custom_css` box.
- The storefront reads the app's data from metafields in Liquid, with no request to our server (2026-10-31 spec, non-goals). The admin already reads one shop metafield (`tier_config`) per page in `getConfig`. The database holds metrics only, and `src/lib/db.ts` records a cold-start timeout of its connection.
- The shared "Product tier discounts" record is created with no `combinesWith` (`src/lib/tierDiscount.ts`), so Shopify's default applies: it combines with nothing. Flash-sale records set `combinesWith: { productDiscounts: true }`, and `src/flash/sharedRecord.ts` already updates the shared record the same way, because Shopify drops a flash discount that cannot combine with the shared record when a cart holds both.
- Shopify's docs (`DiscountCombinesWithInput`): `orderDiscounts`, `productDiscounts` and `shippingDiscounts` are booleans, default false; by default only one product discount applies per cart line. Two discounts combine only when **both** allow it.
- Shopify's docs (theme app extensions): `shopify.app.extensions()` called from the embedded admin returns each block's activation status (`active` or `available`) on the published theme and needs no extra scope; reading theme files needs `read_themes`, which the app's scopes (`shopify.app.toml`) do not include. The returned extension info carries a theme id, not a theme name or version.
- The Function already applies the highest tier a cart reaches within one discount (`max_by_key(min_qty)` in `cart_lines_discounts_generate_run.rs`), and a product can belong to only one live discount (overlap rule).
- The Stitch HTML has several empty containers (a typography preset, a price display format, a custom CSS accordion, a quick-metrics box, header buttons). They are not in the screenshot and not in this milestone.

## Goals

- One Settings page, reachable from the homepage, with four panels of the design (Appearance, Impression Frequency, Stacking, Theme Integration); one Save bar (as the discount form has) that saves everything on the page.
- The design applies to every discount at once: saving the Settings page changes the widget and the pop-up on the storefront without touching any product.
- Every setting on the page does something real on the storefront or at checkout.
- Old per-discount values are gone from the form, the code, the stored config and the product metafields.

## Non-goals

- No per-discount design, frequency or overrides of any kind.
- No theme name or version ("Live in Dawn v15.0" in the design): it needs `read_themes`, a new scope merchants would have to approve.
- No Urgency & Micro-Interactions panel and no switches for the countdown or a milestone pulse (owner's decision).
- No typography presets, price display format, custom CSS accordion or metrics box (empty in the design).
- No translations (English only, as the widget).
- No change to how tiers are calculated.

## Anti-goals (a failure even if it works)

- A saved colour or number that can reach the page as unchecked CSS. Values are checked when saved and again where the block and the pop-up script print them (the rule of `readHexColor` and the Liquid check today).
- A Settings save that applies half: Shopify (stacking) is written first and the store settings after, as the discount save does (`syncRecordOf` before `saveConfig`); a refusal shows its message and saves nothing.
- Stacking that breaks flash sales: the shared record and the flash records must keep `productDiscounts: true` while any flash sale exists.
- Heavier storefront loads: one metafield read in Liquid, no new request.
- The pop-up or the widget scripts going over Shopify's 10,000-byte limit (`bundle-popup.js` is 9,955 bytes today).

## The Settings page

Route `/settings` in the embedded app, linked from the homepage header (where the design shows its header buttons). Two columns as in the design: panels on the left, sticky previews on the right. It reuses the form's look (`--color-form-*` tokens, `SaveBar`, the colour picker); the Stitch HTML is a reference for layout, not code to copy.

### 1. Storefront Appearance & Theme

- **Accent colour** (swatches and a hex box): sets the widget's and the pop-up's moss colour (selection rings, milestone bars, progress badges).
- **Widget background tone** (swatches and a hex box): sets the cream surface. As today, `#RRGGBB` or `#RRGGBBAA`; the existing colour picker with transparency is reused.
- **Flash sale bar tone**: Olive Night, Pure Onyx or Deep Pine, one of three fixed colours for the flash bar of the widget and the pop-up box.
- **Corner roundness**: 0 to 24 px (the range of today's slider).
- Defaults for a store that has not saved settings: moss `#434625`, background `#F5EFE1`, radius 12, flash tone Olive Night. (The sun yellow stays a theme-editor setting of the blocks; the design has no control for it.)

### 2. Impression Frequency

One store-wide choice, replacing the discount form's "Show the pop-up" select: **once per shopping session** (default) or **at every cart-to-checkout press until the tier is unlocked**. The pop-up reads it instead of each discount's `popupFrequency`.

### 3. Discount Combination & Stacking

Shopify decides combining by **discount class** (order, product, shipping), not by "coupon" or "automatic"; so the panel has one checkbox per class, with labels and help text that say what Shopify does (owner's decision, 2026-11-12: "align labels and explanation to how Shopify works"). They set `combinesWith` on the shared tier discount and on every flash record:

| Checkbox | Sets | Help text (my wording) |
|---|---|---|
| Order discounts | `orderDiscounts` | Discounts on the whole order, such as a code that takes 10% off the order. Allow them to apply together with your tier discounts. |
| Shipping discounts | `shippingDiscounts` | Free or reduced shipping, from a code or an automatic discount. Allow them to apply together with your tier discounts. |
| Product discounts | `productDiscounts` | Other discounts on products. Shopify applies one product discount per cart line, so these can only apply to other lines. Always on, and locked, while a flash sale exists, because flash sales need it. |

- The design's third checkbox ("Always prioritize highest tier discount rate", owner's decision: **dropped**) is not built.
- The panel says that two discounts combine only if **both** allow it: the other discount must allow combining in Shopify Admin too; the app can set only its own side.
- The checkboxes start from the **current** state of the shared record in Shopify (all three false today, because it is created with no `combinesWith`), not from the design's mock defaults, so deploying changes nothing until the owner saves.

### 4. Shopify Theme Integration

A status panel with no setting to save. For the product-page widget block, the card-prices embed and the bundle pop-up embed it shows **Active** or **Not active** on the live theme, from `shopify.app.extensions()` (needs no scope), and a deep link to the theme editor to add the block or turn the embed on (URL format from Shopify's deep-linking docs, with the app's `client_id`). If the status cannot be read, the panel says so and shows the links.

### The previews

- **Widget preview** (right column): the existing `WidgetPreview` with mock data: 3 products at one price and 3 tiers, and the "Preview flash sale countdown" checkbox of the design. It repaints as the controls change.
- **Pre-checkout pop-up preview**: placeholder blocks only (title, tier chips, rail, item row, buttons), as the design's "Wireframe Preview", painted with the same variables, so accent, background, flash tone and radius can be judged together. No real pop-up content and no scripts.

## Data

- **Where:** a new shop metafield `tier_settings` (JSON, key added to `METAFIELD_KEYS` next to `tier_config`), written by the Settings save, read by `getConfig`-style code in the admin and by Liquid in both blocks. No database table. Reason: the storefront needs no request to read it, the admin read joins a query it already makes, and the database has a recorded cold-start cost. Not measured.
- **Shape (my calls on the names):** `{ design: { accentColor, backgroundColor, cornerRadius, flashTone }, popup: { frequency }, stacking: { orderDiscounts, shippingDiscounts, productDiscounts } }`. A missing or invalid value reads as its default.
- **Blocks:** the widget block and the pop-up embed print the design as the existing `--smooth-discounts-*` variables, plus a `data-` attribute for the frequency; they stop reading a discount's `style`. The theme-editor settings `moss_color` and `cream_color` are removed from both block schemas (the global design replaces them); `sun_color` and `custom_css` stay.
- **Card index:** loses `style` and `popupFrequency`.

## Removing the old values

- The Design card, `DesignControls`'s two controls, `parseStyle`, `style` in `FormValues`, `loadFormValues`, `emptyValues`, `saveSteps`, `parseDiscountForm`, `config.ts`, `cardIndex.ts` and `product-tiers.ts`, and the Liquid that reads a discount's style: all deleted. The Details card loses the "Show the pop-up" select.
- **Stored data:** the first Settings save also rewrites `tier_config` without `style` and `popupFrequency` on every discount, and rewrites the `tier_discount` metafield of every live discount without `style`, through the existing save path. After that the old values exist nowhere in the store and cannot be recovered from it. A discount that was saved before this work shows the global design from the moment the new blocks are deployed, whether or not the cleanup has run, because nothing reads the old values any more.

## For the owner (answers that change what is built)

None open. Answered: "Always prioritize highest tier" is dropped; the stacking labels follow Shopify's classes (see the Stacking panel); the Urgency panel is removed.

## Calls I made (to check while reading)

1. The store-wide settings live in one shop metafield, not a table.
2. The default look equals what a discount saved from the form has today (background `#F5EFE1`, radius 12) with the moss default of the blocks.
3. The theme-editor colour settings `moss_color` and `cream_color` go; `sun_color` and `custom_css` stay.
4. The colour picker with transparency is reused for the background; the accent is a solid colour.
5. The names of the stored fields and of the `/settings` route.
6. The cleanup of old values runs on the first Settings save (nothing runs at deploy).
7. The Settings link sits in the homepage header.
8. The theme panel shows block status only, no theme name.

## What is left to the builder

The exact Liquid and the CSS variable for the flash tone, how the frequency setting reaches the pop-up script without passing 10,000 bytes (the pop-up core has 45 bytes to spare; components are the place), the exact deep-link URLs, how the shared and flash records are updated and kept in step (one query of all records of the Function), the mock data, and the tests.

## Verification

Tests first, in the existing styles:
- Settings: parse and read with defaults; a bad colour or radius falls back; saving writes Shopify first and the metafield after; a refused stacking write saves nothing.
- Stacking: each class checkbox sets the matching `combinesWith` field on the shared record and the flash records; the panel starts from the record's current state; `productDiscounts` stays true and the box is locked while a flash sale exists.
- Removal: no `style` or `popupFrequency` in the form, the card index, the product metafield or the saved config after the cleanup.
- Blocks and scripts: the Liquid prints the global variables and attributes and nothing from a discount's style; the pop-up uses the global frequency; sizes under 10,000 bytes.
- Previews: the form preview paints the global design; the Settings preview repaints on every control; the pop-up preview has no real content.
- On the demo store (the owner types the storefront password in their own terminal tab): a design change reaches a product page and the pop-up; the stacking boxes change the record in Shopify Admin; the theme panel reads the blocks' status.

## Not verified

- Nothing of this has run. Which product discount Shopify keeps when two compete on a line, and how a real coupon combines with the shared record, are not tested.
- `shopify.app.extensions()` was read in Shopify's docs, not run; the deep-link query parameters are taken from the docs' parameter list.
- The load-speed reasoning for the metafield is from the repo and docs, not measured.

## Order of work (for the plan)

1. Settings data: type, defaults, read and write, with tests.
2. The Settings page with the design panel and its previews.
3. Blocks and scripts read the global design; the per-discount look is removed from the form, the card index and the metafields; the cleanup.
4. Impression Frequency.
5. Stacking (Shopify records).
6. Theme Integration.
7. Demo-store check, then the PRs (each at most 200 changed lines without tests, as the project's plans do); the owner merges and deploys.
