# Design card fixes

Date: 2026-11-02. Status: built (owner's list of five changes, confirmed in chat); part 3 is explained below.

## What the owner asked for

1. Remove the "Colour theme" section from the Design card; it does not do anything.
2. Rename "Secondary background color" to "Background colour".
3. A background colour change shows in the preview but does not reach the storefront widget.
4. The colour picker icon opens a colour picker: a selection of colours, and the transparency and red, green and blue of the colour.
5. Move the Flash sale card after the Products card.

## What changed

- **Style values:** a discount's style is now three values: `backgroundColor`, `cornerRadius`, `priceSize`. `themeColor` is gone from the form, the parse, the metafield and the Liquid block. The accent colour on the storefront is the theme editor's block setting (`moss_color`), which was already its fallback. A style saved earlier that still carries `themeColor` loads without it (`buildStyleValues`) and the next save writes the three values; the block no longer reads the old one.
- **Transparency:** `backgroundColor` is `#RRGGBB` while the colour is solid and `#RRGGBBAA` once it is partly transparent, so every colour saved before this change is still valid and unchanged. `readHexColor` (server), `isHexColor` (form) and the Liquid `sparkly-safe-hex` snippet accept exactly six or exactly eight hexadecimal digits and nothing else. The picker's maths is in `src/form/colour.ts` (`splitColour`, `joinColour`); the opacity is a whole percent and the alpha byte is `percent × 255 / 100`, rounded.
- **Colour picker:** the icon in the code box is a button (`Open colour picker`). Its panel holds the 16 colours of the design (the seven backgrounds and the nine palette colours that used to be the theme colours), a preview over a checkerboard, and a slider with a number box for Red, Green, Blue and Transparency. A colour chosen from the selection keeps the transparency. Done, Escape and a press outside close it. The panel opens below the Background colour group at full width; the card no longer clips its content.
- **Card order:** Details, Products & variants, Flash sale, Tiers, Design.

## Point 3: what was found

The owner reported that on the dev storefront nothing changes after saving a new background colour. Checked, with the result:

- **The save writes it.** The product's `tier_discount` metafield on the dev store holds the saved `style` (read with the dev console's GraphiQL; for example `backgroundColor "#191C16"` saved on 2026-11-01).
- **The stylesheet uses it.** `--sparkly-tier-surface` is `var(--sparkly-tier-cream, …)` and the block sets `--sparkly-tier-cream` on the widget; the minified stylesheet keeps both.
- **The hex snippet works on real Shopify**, for six digits and for the new eight (18 cases on a temporary test template: capitals, lower case, padding, and every bad or injected value printing nothing).
- **Every discounted product on the dev store has a flash sale whose end time has passed.** `tier-pricing.liquid` renders a product whose flash sale has ended as a plain product (no tiers, and so no style: the block's own defaults apply), because a flash discount no longer applies at checkout. A copy of the live theme served by `shopify theme dev` showed exactly that: the deployed block carries the new `data-component-urls`, and each of those products renders with no tiers and the default colours. The saves on 1 November were made while the sale was running (it ended later that day), which is when the widget and the style showed correctly.

So the saved background colour is not lost anywhere between the form and the storefront; the storefront does not show a discount whose flash sale is over. The admin preview deliberately keeps showing the card, with a "Flash sale ended" bar. The check for the owner: on a discount, untick Flash sale (or give it an end time in the future), save, and the widget returns with the saved colour.

## Layout follow-up (owner's second list, 2026-11-02)

- **Card order** is now Details, Products & variants, Tiers, Flash sale, Design.
- **The colour picker panel** is 60% of the width of the Background colour group (at least 16rem), no longer the full width.
- **Round corners and Price size** share one row, a half of the width each (one `grid grid-cols-2`); the sliders line up.
- **The colour in use** is the first circle of the swatch row (a `role="img"` named "Current colour #RRGGBB[AA]"), laid over a checkerboard so any transparency shows. The seven swatches follow it and keep their own chosen state. It shows a colour typed, picked from a swatch or set in the picker.
- The change applies to the Create and the Edit form alike: they are one component.
