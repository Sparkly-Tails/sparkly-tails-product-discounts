# Per-discount widget style: implementation plan

**Goal:** each discount carries four style values (theme colour, background colour, corner radius, price size), saved with it and read by the storefront widget from the product metafield.
**Spec:** `docs/superpowers/specs/2026-10-31-per-discount-widget-style-design.md` (PR #154).
**Tech:** Next.js server action, vitest, the theme app extension (Liquid + CSS). New code follows the owner's 8 code guidelines (lint errors on new files).

## Global constraints

- The extension's stylesheet and script stay as they are, except the radius variable (task 6). Nothing new is fetched from our server.
- Defaults saved every time (owner's decision): theme colour `#0055C7`, background `#F5EFE1`, corner radius `12`, price size `24`.
- Ranges: radius 0 to 24 (whole px), price size 12 to 48 (whole px), colours `#RRGGBB`.
- A bad value must never reach the page as CSS (checked in the parser and in Liquid).
- Bump `package.json` and the first two version fields of `package-lock.json` in every code commit; tests first; no AI attribution; one PR into dev; I never merge or deploy.

## Review focus

- A discount saved before this work (no style) renders as today; the form opens it with the card's defaults.
- Untouched Design card: the four default values are saved.
- A malformed colour or out-of-range number sent by hand is replaced by the default and never stored.
- The preview paints the same four values the metafield carries.
- Changing only the style makes the form dirty and saveable.

## Tasks (commits, in order)

1. `src/lib/widgetStyle.ts`: `WidgetStyle` type, `DEFAULT_WIDGET_STYLE`, ranges, `readWidgetStyle({ values, tools })` (any input to a safe style). `designOptions.ts` takes its defaults from it.
2. `src/form/parseStyle.ts` reads the form fields `style-themeColor|backgroundColor|cornerRadius|priceSize`; `ParsedDiscount.style`; `buildDiscountFields` carries it; `Discount.style?` in `config.ts`; PARSE_TOOLS and SAVE flow keep working (tests: saveSteps, parseDiscountForm, end-to-end save stores it).
3. `product-tiers.ts`: the `tier_discount` value gets `style: WidgetStyle | null`; test in `tests/lib/product-tiers.test.ts`.
4. Form values: `FormValues.style`, `EMPTY_FORM_VALUES`, `buildFormValues` (saved style or defaults), `buildComparable`, `isFormDirty`.
5. Design card controlled by the form (`style` + `onChange`), a Price size control, hidden inputs so the four values are submitted; `TierDiscountForm` passes them; `WidgetPreview`/`WidgetView` paint them (CSS variables).
6. Stylesheet: `--sparkly-tier-radius` with derived `-md` and `-sm` variables (same look at 16px); Liquid block prints the style attribute with precedence discount, block settings, defaults and checks the colour shape; contract tests on the Liquid and the CSS.
7. Whole suite, lint, build; look at the preview in the browser harness; self-review against the spec; session log; PR.
