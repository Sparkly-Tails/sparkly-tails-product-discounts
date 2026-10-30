# Redesign of the tier discount form (Create and Edit pages)

Date: 2026-10-29. Status: draft for the owner's approval. Nothing is built.

## Intent and why

The page where a merchant creates or edits a tier discount is redesigned from the Stitch screen "Create Tier Discount - Two-Column with Live Preview & Flash Sale" (project 6370617737489629500, screen 39c14e472c3d42818917cb204dcf5a25). The screenshot is `docs/superpowers/specs/assets/tier-form/stitch-tier-form.jpg` (2560 x 3892); Stitch's generated HTML is a reference only (Tailwind from a CDN, Inter, Material Symbols, its own colour tokens), not code to ship. What changes for the merchant: one page with the form on the left and a live preview of the storefront widget on the right, one Save instead of one button per section, and the flash sale settings inside the form.

## What the owner decided

- **Pages**: the Create page and the Edit page get the same design. The Edit page fills the form with the saved discount's values (name, products, tiers, flash sale, High Demand).
- **Layout**: two columns, the form on the left (about 58%) and the preview on the right (about 42%). The right column is **sticky**: it stays in view while the form column scrolls.
- **One Save**: every per-section Save button of today's form (title, products, tiers, flash sale, High Demand) is replaced by the one **Save** button in the footer.
- **Footer bar**, in the design's style (a white bar under the form with a status text on its left):
  - Create page: Discard, Go live, Save.
  - Edit page: Delete (far left, red text, with the confirmation it has today), Discard, Go live / Take offline (the label follows the discount's state), Save. "Save" replaces the design's "Save discount".
  - **Discard** reverts the unsaved changes: on the Edit page it reloads the saved values; on the Create page it leaves without saving.
- **Design card** (colour theme swatches, secondary background colour with a hex field, round corners slider): built as controls only. **Nothing is saved and nothing reads them**: they do not change the preview or the storefront widget in this milestone.
- **Preview**: it behaves exactly like the storefront widget (same pure functions, same stylesheet). It changes with the **products added**, the **flash sale dates** (the flash bar, teaser and countdown) and the **tiers** (the chips, the promo line and the progress bar; the owner listed title, dates and products, and the tiers are implied by the design: confirm). It does not change with the Design card. With **no product added** the preview shows a message asking to add a product, and the Mix & match list is hidden (as in the widget when a discount has no other products).
- **Header**: the design's Automations, Settings, Docs and bell are not built. The pages keep the app's current header.
- **High Demand**: its checkbox ("Show the High Demand tag") goes in the Flash sale card, **below** "Show a teaser before the sale starts".
- **Title**: the Title field is removed (the storefront widget never printed it).
- Work rules: a new branch, small atomic commits and PRs of **at most 200 lines each**, tests first, and each step compared with the design in the localhost harness until it matches; the owner merges and deploys.

## Goals

1. Create and Edit look like the screenshot at desktop width, element by element (position, size, font, colour, padding, radius), apart from the explained differences below.
2. One Save saves the whole discount, with the same safety as today's flash sale work: if Shopify refuses (limit, invalid window), nothing is saved and the message is shown.
3. The preview is trustworthy: it is the widget code, fed with the form's current values.
4. The page works on a narrow screen (single column; the preview comes after the form, no longer sticky).

## Non-goals

- Saving or applying the Design settings (colour, background, corners). The Design card does nothing yet.
- New pages (Automations, Settings), the notification bell, the Docs link.
- A new data model for tiers, flash sales or products. The stored discount keeps its shape; the time-based discount form is untouched.
- Showing the title anywhere.

## Anti-goals

- A Save that saves only part of the form, or leaves the discount saved but its Shopify discount not in step.
- A preview that computes prices with its own copy of the maths (it must call the widget's functions).
- Changes to the storefront widget's look or behaviour (this milestone is the admin form).
- A PR over 200 lines of change (tests and generated lock files excluded); split it instead.

## What exists today (so the builder does not rediscover it)

- Create page: `src/app/discounts/new/page.tsx` (server, reads the shop timezone) and `NewDiscountForm.tsx` (client; internal name, title, products with `MemberPicker`, tiers with `PricingModeTierFields`, `FlashSaleFields`, High Demand checkbox, one submit button posting `createDiscount`).
- Edit page: `src/app/discounts/[discountId]/page.tsx` (server): one form and Save button per section (`updateDiscountTitle`, `updateDiscountMembers`, `updateDiscountTiers`, `updateDiscountFlash`, `updateDiscountHighDemand`), Go live / Take offline and Delete with `ConfirmForm`, and a "Resulting prices" table.
- Actions: `src/actions/discountActions.ts` (legacy file for the lint guidelines; new logic goes in new files). The flash sale pieces are in `src/flash/` (`discountRecord.ts`, `sharedRecord.ts`, `formFields.ts`, `schedule.ts`, `components/FlashSaleFields.tsx`).
- The widget: `extensions/product-tier-pricing/assets/tier-pricing.js` (pure functions `computeWidgetViewModel`, `buildTierChips`, `buildFlashBar`, ...; exported with `module.exports`) and `tier-pricing.css`; the markup is in `blocks/tier-pricing.liquid`. A localhost comparison harness method is in the session log of the flash sale work (the Liquid block rendered next to the Stitch HTML in iframes; compare computed styles per element).
- Code guidelines in `docs/coding-guidelines.md` apply to every new TS/JS file (errors in lint), tests first, version bump in every code commit.

## Calls I made (not discussed; the owner checks them)

1. **Title.** Removing the field means new discounts have no title. To change as little as possible, a new discount stores `title` equal to its internal name (the Shopify discount of a flash sale, the homepage row and the product metafield keep working untouched); existing discounts keep their stored title. The edit form neither shows nor changes it.
2. **High Demand outside a flash sale.** The checkbox sits in the Flash sale card but stays usable when "Run as a flash sale" is off (it works for any discount today). When the switch is off the date fields are hidden, as today.
3. **One Save, one action.** A new server action `saveDiscount` takes the whole form, validates everything first, then changes Shopify before it saves the config (the order of the flash sale work), so a refusal changes nothing. The existing per-section actions stay in the code until the new form no longer posts to them (a later PR removes them).
4. **Go live / Take offline** is its own action from the footer: it saves the form first (so a live discount never differs from the form), then changes the status. On the Create page, "Go live" creates the discount live.
5. **Preview data.** The preview needs each product's price, title and image: it reads them from what `MemberPicker` already loads when products are added (builder: confirm; if a field is missing, add it to that lookup, not a second query). "Product previewing" lists the products added to the form.
6. **Reusing the widget code.** The preview imports the widget's pure functions and stylesheet instead of copying them (one source of truth). The markup is a React copy of the Liquid block; a test renders both for the same input and compares the text they print.
7. **Stock badge** ("In stock (248)") and the variant summary line in the design's product rows are shown only if the data is already available; otherwise the row shows the title, the selected variants and the price, and the owner is told in the PR.
8. **Tiers table.** The Percentage off / Fixed price toggle and the four columns follow the design (minimum quantity, discount rate with the computed price and percentage, anchor price with a `$` prefix, Remove). The anchor price keeps its meaning (the exact total for the minimum quantity).
9. **Unsaved-changes text** in the footer ("Unsaved changes on this discount tier") shows only while the form differs from the saved values; it reads "All changes saved" otherwise.
10. **Sticky preview** uses CSS `position: sticky` below the header, with the column's height capped to the viewport (scrolls inside if taller).

## Suggested split (the plan decides the exact steps; every PR at most 200 lines)

1. Page shell: two columns, sticky right column, footer bar (static), styles and tokens of the design.
2. Details card (internal name) and the Flash sale card with High Demand.
3. Products card (search, Browse, rows).
4. Tiers card (toggle, table, add tier).
5. Design card (controls only).
6. Preview: the widget markup in React with the pure functions and the stylesheet, fed by products, dates and tiers; the empty-product message.
7. `saveDiscount` and the Create page wired to it; Discard.
8. The Edit page: load the saved values, Go live / Take offline, Delete in the footer; remove the old per-section forms.
9. Narrow-screen layout; final comparison with the design.

## Definition of done

- Create and Edit match the screenshot in the localhost harness, with no unexplained difference.
- One Save saves everything; a Shopify refusal saves nothing and shows the message; Discard reverts; Go live / Take offline and Delete work from the footer on the Edit page.
- The preview changes with the products, the flash sale dates and the tiers, never with the Design card, and shows the "add a product" message when empty.
- All gates pass (vitest, tsc, lint with 0 errors, `next build`), each PR is at most 200 lines, nothing is merged or deployed by the agent.
