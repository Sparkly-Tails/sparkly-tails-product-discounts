# Each discount has its own widget style

Date: 2026-10-31. Status: draft, waiting for the owner's approval (one open decision, marked **Owner decision**).

## Why

The storefront widget has one look for the whole store: the block settings in the theme editor (price size, three colours, a custom CSS box). The form's Design card (theme colour, background colour, corner radius) only changes the preview and saves nothing. The owner wants every discount to carry its own style, saved with the discount and read by the widget on the storefront.

## What the owner decided

1. Each discount has its own style: **theme colour, background colour, corner radius and price size**.
2. The style is saved with the discount (on the backend) and reaches the page **only through the app metafield**; nothing for it is served from the theme.
3. **The widget's stylesheet and script stay in the theme app extension exactly as they are.** Only a small, per-discount custom style comes from the metafield.
4. The earlier idea of moving the flash bar, drawer and High Demand CSS into the metafield is dropped for now.

## Behaviour

- The Design card gets a fourth control, **price size**, and all four controls are saved with the discount when Save is pressed (Create and Edit).
- The preview paints the widget with the same style, so the form shows what customers will see.
- When a discount is live, its style is written into the product's `tier_discount` metafield next to the tiers, as plain values (two hex colours and two numbers), never as CSS text.
- The block reads those values in Liquid and prints one small `<style>` for this widget's element, setting the widget's existing CSS variables. Order of precedence, strongest first: the discount's style, the theme editor's block settings, the widget's built-in defaults.
- A style value that is not set falls back to the next level, so a discount with no style looks exactly as it does today.
- **Owner decision, untouched Design card:** the card's defaults (blue #0055C7, sand #F5EFE1, radius 12) are not the widget's current look (olive #434625, cream #f3ecd9). My recommendation: a discount only gets a style once something in the Design card is changed. A card left alone saves no style, and the widget keeps the store's theme-editor look. The alternative is to save the card's defaults every time, which would turn every new discount blue.
- A "Reset" for a style is not part of this work.

## Non-goals

- No CSS file, no stylesheet and no script moves; no request from the storefront to our server.
- No free-text CSS per discount, and no per-discount price size beyond the one number.
- No migration: discounts saved before this have no style and look as they do today until they are saved with one.
- No change to the time-based discount widget.

## Anti-goals

- A bad value (a malformed colour, a size out of range) must never reach the page as CSS: values are checked when the form is saved and again where the block prints them.
- The first load must not get heavier than a few hundred bytes per widget page.
- A discount that is not live must put nothing on the storefront (as today).

## My calls (the owner can overrule)

- **Theme colour** sets the widget's existing "moss" colour variable (the dark accent), and **background colour** sets the "cream" surface variable. The "sun" yellow stays as the store's setting.
- **Price size** is a whole number of pixels from 12 to 48 (the same range as the theme editor). Unset means the theme editor's value.
- **Corner radius** sets one number (0 to 24 px, the range the Design card's slider offers) as the widget's card radius; the smaller inner radii are derived from it in the stylesheet. This needs the stylesheet to use a radius variable instead of fixed pixel values, a small change to the extension's CSS with the same look at the default.
- The style is stored with the discount in the shop's tier config and copied into the product metafield by the same step that writes the tiers, so it reaches the storefront exactly when the tiers do.
- Colours are stored as `#RRGGBB`; the block checks the shape in Liquid before printing.

## What is left to the builder

Names of the stored fields, the exact Liquid for the `<style>` (scoped to the block's element), how the preview passes the same values, and the tests: a discount with no style renders as today; a style overrides only what it sets; a malformed value prints nothing.
