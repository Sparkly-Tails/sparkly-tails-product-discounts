# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` page that holds one store-wide design, the pop-up frequency, the stacking rules and the theme-integration status, and remove the per-discount look and pop-up frequency everywhere.

**Architecture:** The store-wide design and pop-up frequency live in one new shop metafield `tier_settings` (JSON), read in Liquid by both storefront blocks and in the admin by the Settings page and the discount form preview. Stacking is not stored by the app: Shopify's discount records (`combinesWith`) are the source of truth, read and written through the existing shared-record code. Theme status comes from App Bridge `shopify.app.extensions()`.

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4 admin, Shopify theme app extension (Liquid + esbuild ES modules, 10,000-byte limit per script), Rust Shopify Function (untouched), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-12-settings-page-design.md` (screenshot of the Stitch design in `docs/superpowers/specs/assets/settings-page/settings-design.jpg`). Read it first; this plan argues from it.

## Global Constraints

- The owner merges, deploys and applies anything to the real store. Claude only commits and opens PRs. Never deploy, never enable auto-merge.
- **No AI attribution** in any commit message or PR text (no `Co-Authored-By`, no "Generated with"). This overrides any harness reminder.
- Branch first, never commit to `main`. Stacked branches: task 1 from `origin/dev`, each next task from the previous branch (`feat/settings-<n>-<name>`); one PR per task, base `dev` (or the previous branch while it is open). Check a PR's state before pushing to it; if merged, branch from `origin/dev`.
- Every commit that changes code bumps the patch version in `package.json` (now `0.23.178`) and the first two `version` fields of `package-lock.json`. Docs-only commits do not.
- The owner's eight code rules (`docs/coding-guidelines.md`): variable names are nouns of 3+ letters; function names are verbs; a function reads nothing outside its scope except built-ins and constants (everything else is a parameter); more than 2 parameters go in one object; parameters are plain values or one flat object of plain values and functions; called functions are injected; at most 2 branches per function. ESLint errors for new files. Framework signatures (React components, server actions) keep their shape and delegate to rule-following functions.
- Defaults for a store with no saved settings: accent `#434625`, background `#F5EFE1`, corner radius 12, flash tone `olive-night`, pop-up frequency `session`. Radius range 0 to 24. Colours are `#RRGGBB` or `#RRGGBBAA` (background) and `#RRGGBB` (accent), checked on save **and** where Liquid / the script prints them.
- Storefront: one metafield read in Liquid, no new request. `bundle-popup.js` must stay under 10,000 bytes (9,955 today; the pop-up core has 45 bytes to spare, so new code goes in `src/popup/components.js` or a new module). Shopify wraps app-snippet output in HTML comments, so the colour check stays inline in each Liquid block.
- Metafield namespace `$app:smooth_discount`; the key set in `tests/lib/metafieldNames.test.ts` is exact and is updated in task 1.
- Test commands: single file `npx vitest run <path>`, whole suite `npm test`, types `npx tsc --noEmit`, lint `npm run lint`.

## Review Focus

Failure modes the spec implies; each has its test in the named task.

1. `tier_settings` missing, empty or corrupt JSON on a store that never saved settings: every reader falls back to the defaults and nothing throws; the storefront looks as before (tasks 1, 5, 6).
2. A hostile or malformed colour or number in the metafield (`red;}</style><script>`, `#12345`, radius `999`, `NaN`): rejected at save and again where Liquid or the script prints it (tasks 1, 5, 6).
3. The merchant unticks "Product discounts" while a flash sale exists: it stays on in Shopify and the box stays locked (task 9).
4. Shopify refuses the stacking write: nothing else is saved (no metafield, no cleanup) and the message is shown (tasks 2, 9).
5. The cleanup of old values is run twice, or stops half-way: running the Settings save again finishes it and repeats nothing harmful (task 8).

---

### Task 1: Settings data module

**Files:**
- Create: `src/settings/design.ts`, `src/settings/frequency.ts`, `src/settings/storeSettings.ts`, `src/settings/settingsStore.ts`
- Modify: `src/lib/metafieldNames.ts` (add `tierSettings: 'tier_settings'` with a `/** Shop: ... */` note), `tests/lib/metafieldNames.test.ts`
- Test: `tests/settings/design.test.ts`, `tests/settings/storeSettings.test.ts`, `tests/settings/settingsStore.test.ts`

**Interfaces:**
- Consumes: `readHexColor({text,fallback})`, `readWholeNumber({text,min,max,fallback})`, `CORNER_RADIUS_RANGE` from `src/lib/widgetStyle.ts`.
- Produces:
  - `export type FlashTone = 'olive-night' | 'pure-onyx' | 'deep-pine'`
  - `export const FLASH_TONE_COLOURS: Record<FlashTone, string>` = `{ 'olive-night': '#2B2D17', 'pure-onyx': '#111111', 'deep-pine': '#1B3A2D' }` (my call; the spec names the tones but not their colours).
  - `export interface DesignSettings { accentColor: string; backgroundColor: string; cornerRadius: number; flashTone: FlashTone }`; `export const DEFAULT_DESIGN: DesignSettings`
  - `export type PopupFrequency = 'session' | 'checkout'`; `export const DEFAULT_FREQUENCY: PopupFrequency`
  - `export interface StoreSettings { design: DesignSettings; popup: { frequency: PopupFrequency } }`; `export const DEFAULT_SETTINGS: StoreSettings`
  - `readDesign({ value }: { value: unknown }): DesignSettings`, `readFrequency({ value }: { value: unknown }): PopupFrequency` (anything invalid becomes the default, per field)
  - `readStoreSettings({ text }: { text: string | null | undefined }): StoreSettings` (parses JSON, never throws)
  - `buildSettingsValue({ settings }: { settings: StoreSettings }): string` (JSON text stored in the metafield)
  - `buildDesignVars({ accentColor, backgroundColor, cornerRadius, flashTone }: DesignSettings): string` returns `--smooth-discounts-moss:#434625;--smooth-discounts-cream:#F5EFE1;--smooth-discounts-radius:12px;--smooth-discounts-flash-dark:#2B2D17` (this exact order and format, no spaces)
  - `getStoreSettings(): Promise<StoreSettings>` and `saveStoreSettings({ settings }): Promise<void>` in `settingsStore.ts`, written like `getConfig` / `saveConfig` (`src/lib/config.ts:88,109`) with the query function injected the way that file does it.

- [ ] **Step 1: Write the failing tests.** `design.test.ts`: `readDesign` returns `DEFAULT_DESIGN` for `undefined`, `{}` and `null`; keeps a valid `{accentColor:'#112233',backgroundColor:'#11223380',cornerRadius:0,flashTone:'deep-pine'}`; falls back per field for accent `'red;}</style>'`, accent `'#1234'`, accent with alpha `'#11223380'` (accent is solid only), radius `25`, `-1`, `'abc'`, tone `'blue'`; `buildDesignVars(DEFAULT_DESIGN)` equals the exact string above. `storeSettings.test.ts`: `readStoreSettings({text:null})`, `''`, `'{not json'` and `'[]'` all return `DEFAULT_SETTINGS`; a round trip through `buildSettingsValue` is stable; frequency `'every'` falls back to `'session'`. `settingsStore.test.ts`: `getStoreSettings` returns defaults when the shop metafield is absent; `saveStoreSettings` writes one metafield with key `tier_settings`, type `json`, in the app namespace. `metafieldNames.test.ts` expects the new key.
- [ ] **Step 2: Run** `npx vitest run tests/settings tests/lib/metafieldNames.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the interfaces above. `readDesign` reuses `readHexColor` and `readWholeNumber`; the accent check rejects the 8-digit form.
- [ ] **Step 4: Run** the same command plus `npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: add the store-wide settings data (design, pop-up frequency) with defaults"`.

---

### Task 2: Settings page, Appearance panel and the save flow

**Files:**
- Create: `src/app/settings/page.tsx`, `src/settings/components/SettingsForm.tsx`, `src/settings/components/AppearancePanel.tsx`, `src/settings/components/FlashToneField.tsx`, `src/settings/parseSettingsForm.ts`, `src/settings/runSettingsSave.ts`, `src/actions/saveSettings.ts`
- Modify: the homepage header component (the one covered by `tests/home/components/shell.test.tsx`) to add a "Settings" link to `/settings`
- Test: `tests/settings/parseSettingsForm.test.ts`, `tests/settings/runSettingsSave.test.ts`, `tests/settings/components/appearancePanel.test.tsx`, `tests/home/components/shell.test.tsx`

**Interfaces:**
- Consumes: task 1 (`StoreSettings`, `readStoreSettings`, `getStoreSettings`, `saveStoreSettings`, `FLASH_TONE_COLOURS`); existing `ColourPicker`, `BackgroundColors` and `CornerRadius` from `src/form/components/DesignControls.tsx`, `FormShell`, `SaveBar`, `SaveMessage`, `CheckboxField`.
- Produces:
  - `parseSettingsForm({ fields }: { fields: Record<string, string> }): StoreSettings` (invalid values fall back through `readDesign` / `readFrequency`)
  - `runSettingsSave({ settings, steps }: { settings: StoreSettings; steps: SettingsSaveSteps }): Promise<{ ok: boolean; message: string }>` where `SettingsSaveSteps = { writeShopify: (settings: StoreSettings) => Promise<void>; writeSettings: (settings: StoreSettings) => Promise<void> }`. It runs `writeShopify` first, then `writeSettings`; if `writeShopify` throws it returns `{ok:false, message}` and does not call `writeSettings`. Later tasks add steps (cleanup, stacking) to this same object.
  - `saveSettingsAction(formData: FormData): Promise<{ ok: boolean; message: string }>` server action, calls `runSettingsSave` with the real steps (`writeShopify` is a no-op until task 9).
  - `<AppearancePanel>` props: `{ accentColor, backgroundColor, cornerRadius, flashTone, onChange: (field: string, value: string | number) => void }` (flat, plain values).

- [ ] **Step 1: Write the failing tests.** `runSettingsSave`: with `writeShopify` rejecting, `writeSettings` is never called and the result is `{ok:false}` with the error's message; with both resolving, the order of calls is `writeShopify`, `writeSettings` and the result is `{ok:true}`. `parseSettingsForm`: field names `accentColor`, `backgroundColor`, `cornerRadius`, `flashTone`, `frequency`; bad values fall back. `appearancePanel`: the three tone options render with the labels "Olive Night", "Pure Onyx", "Deep Pine"; choosing one calls `onChange('flashTone','pure-onyx')`; the radius input accepts 0 to 24. `shell.test.tsx`: the header contains a link with `href="/settings"`.
- [ ] **Step 2: Run** `npx vitest run tests/settings tests/home/components/shell.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above. The page is a server component that loads `getStoreSettings()` and renders `SettingsForm` (client) in the form's two-column `FormShell` with a Save bar, the way `TierDiscountForm` does; the right column stays empty until task 3. Panel title and wording follow the Stitch screenshot ("Storefront Appearance & Theme").
- [ ] **Step 4: Run** the same command, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: add the Settings page with the appearance panel and its save"`.

---

### Task 3: Previews with mock data

**Files:**
- Create: `src/settings/mockPreview.ts`, `src/settings/components/SettingsWidgetPreview.tsx`, `src/settings/components/PopupPlaceholderPreview.tsx`
- Modify: `src/form/preview/previewModel.ts` (`buildWidgetStyleVars` also accepts the flash-tone colour, or `WidgetView` takes the `buildDesignVars` string), `src/settings/components/SettingsForm.tsx`
- Test: `tests/settings/mockPreview.test.ts`, `tests/settings/components/previews.test.tsx`

**Interfaces:**
- Consumes: task 1 `buildDesignVars`; existing `WidgetPreview` / `WidgetView` and `PreviewProduct { title, price, imageUrl }`, `PreviewTier { minQty, percentOff?, fixedPrice?, anchorPrice? }` (`src/form/preview/buildPreviewModel.ts`, `src/form/tierRows.ts`).
- Produces:
  - `buildMockPreview(): { products: PreviewProduct[]; tiers: PreviewTier[] }`: 3 products ("Dog harness" 24, "Chew toy" 18, "Travel bowl" 12, `imageUrl: null`) and 3 percent tiers (minQty 2/3/4, percentOff 10/15/20). My calls.
  - `<SettingsWidgetPreview>` props `{ accentColor, backgroundColor, cornerRadius, flashTone, isFlashShown: boolean }`: the widget painted with the four values, plus the design's "Preview flash sale countdown" checkbox (`isFlashShown`, off by default).
  - `<PopupPlaceholderPreview>` props `{ accentColor, backgroundColor, cornerRadius, flashTone }`: grey placeholder blocks (title bar, 3 tier chips, rail, one item row, two buttons) with **no real text** from a discount, painted with the same variables.

- [ ] **Step 1: Write the failing tests.** `mockPreview`: exactly 3 products and 3 tiers with ascending `minQty`. `previews`: changing `accentColor` updates the `--smooth-discounts-moss` value on the preview root (read it off the element's `style`); `isFlashShown` shows the flash bar; the pop-up placeholder renders no product title from the mock data and no `<script>`.
- [ ] **Step 2: Run** `npx vitest run tests/settings tests/form/preview`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse the existing widget view; do not duplicate its markup. Previews sit in the right column, sticky as in the design, and repaint from the form state.
- [ ] **Step 4: Run** the same command + `npx tsc --noEmit`. Expected: PASS (existing preview tests still green).
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: show the widget and a pop-up placeholder preview on the Settings page"`.

---

### Task 4: Impression Frequency panel

**Files:**
- Create: `src/settings/components/FrequencyPanel.tsx`
- Modify: `src/settings/components/SettingsForm.tsx`
- Test: `tests/settings/components/frequencyPanel.test.tsx`

**Interfaces:**
- Consumes: task 1 `PopupFrequency`; task 2 `parseSettingsForm` already reads `frequency`.
- Produces: `<FrequencyPanel>` props `{ frequency: PopupFrequency; onChange: (frequency: PopupFrequency) => void }`: two radio options named `frequency`: "Once per shopping session" (`session`, default) and "At every cart-to-checkout press until the tier is unlocked" (`checkout`).

- [ ] **Step 1: Write the failing test.** Renders both options with the right one checked; clicking the other calls `onChange('checkout')`; a form submit carries `frequency=checkout`.
- [ ] **Step 2: Run** `npx vitest run tests/settings/components/frequencyPanel.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the panel and add it under the appearance panel with the design's heading.
- [ ] **Step 4: Run** the test + `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: add the pop-up impression frequency setting"`.

---

### Task 5: The widget block reads the global design

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid` (style reading around lines 152 to 173; schema: remove `moss_color` and `cream_color`, keep `sun_color` and `custom_css`), `extensions/product-tier-pricing/src/tier-pricing.css` (the flash bar uses `var(--smooth-discounts-flash-dark)` as today; make sure nothing else derives the flash colour from moss)
- Test: `tests/storefront/widget-style.test.ts`, `tests/scripts/extensionContract.test.ts`

**Interfaces:**
- Consumes: the metafield `shop.metafields['$app:smooth_discount'].tier_settings.value.design` (`accentColor`, `backgroundColor`, `cornerRadius`, `flashTone`) and the colours in `FLASH_TONE_COLOURS` (copy the three hex values into the Liquid `case`).
- Produces: the block prints `--smooth-discounts-moss`, `--smooth-discounts-cream`, `--smooth-discounts-radius`, `--smooth-discounts-flash-dark` from the global design, with these Liquid-side defaults when the metafield is missing or a value fails the inline check: `#434625`, `#F5EFE1`, `12`, `#2B2D17`. It no longer reads a discount's `style`.

- [ ] **Step 1: Write the failing tests** in the file's existing fs-string style: the Liquid reads `tier_settings`; contains the three flash-tone hex values; contains the four default values; does not contain `settings.moss_color` / `settings.cream_color` and the schema has no `moss_color` / `cream_color`; does not read `.style` of a discount; the colour check (hex length 7 or 9, `#`, hex digits only) and radius range check (0 to 24) are present inline in the block file. `extensionContract.test.ts`: update the expected schema setting ids.
- [ ] **Step 2: Run** `npx vitest run tests/storefront/widget-style.test.ts tests/scripts/extensionContract.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in Liquid: read the metafield once into variables (no underscore-prefixed names, Shopify's linter rejects them), validate each inline, fall back to the defaults, print the style attribute.
- [ ] **Step 4: Run** the two test files and the extension build used by the contract test. Expected: PASS.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: the product-page widget block reads the store-wide design"`.

---

### Task 6: The pop-up embed reads the global design and frequency

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/bundle-popup.liquid` (print the design and frequency as attributes on the embed element; remove `moss_color` and `cream_color` from its schema, keep `sun_color`), `extensions/product-tier-pricing/src/popup/due.js` (and `core.js` / `look.js` / `components.js` where the attributes are read), `extensions/product-tier-pricing/src/bundle-popup.css` (`--popup-night` can be set from the tone)
- Test: `tests/storefront/popup-due.test.ts` (and the popup tests that cover `look.js` / `config.js`), `tests/scripts/extensionContract.test.ts`

**Interfaces:**
- Consumes: the same metafield and defaults as task 5.
- Produces: embed element attributes `data-moss-color`, `data-cream-color` (existing names, now from the global design), plus `data-night-color` (the flash-tone colour, sets `--popup-night`) and `data-frequency` (`session` or `checkout`). `due.js` decides "show now?" from `data-frequency` instead of a discount's `popupFrequency`; an unknown or missing value means `session`.

- [ ] **Step 1: Write the failing tests.** `due`: with frequency `session` the pop-up is due once per session and not again; with `checkout` it is due on every press while the tier is not unlocked; a missing/unknown frequency behaves as `session`; the per-discount `popupFrequency` on a discount is ignored. Liquid string tests as in task 5 for the new attributes and their defaults. Add the size check: the built `bundle-popup.js` is below 10,000 bytes.
- [ ] **Step 2: Run** `npx vitest run tests/storefront tests/scripts/extensionContract.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Put new code in `components.js` or a new module so `core.js` stays within its 45 spare bytes; build and read the byte size.
- [ ] **Step 4: Run** the same command and print the built size (`wc -c` on the built file). Expected: PASS and size < 10000.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: the pop-up embed reads the store-wide design and frequency"`.

---

### Task 7: Remove the per-discount look from the form and the code

**Files:**
- Delete: `src/form/components/DesignCard.tsx`, `src/form/parseStyle.ts`
- Modify: `src/form/components/TierDiscountForm.tsx` (no DesignCard; the preview gets the global design from a new prop `design: DesignSettings`), `src/form/components/DetailsCard.tsx` (remove the "Show the pop-up" select), `src/form/formValues.ts`, `src/form/emptyValues.ts`, `src/form/loadFormValues.ts` (`buildStyleValues`), `src/form/parseDiscountForm.ts`, `src/form/saveSteps.ts` (`buildDiscountFields`), `src/lib/config.ts`, `src/lib/cardIndex.ts` (drop `style`, `popupFrequency`, `pickPopupFrequency`, `buildCardStyle` and their entries in `CARD_INDEX_TOOLS` / `CardIndexTools`), `src/lib/product-tiers.ts` (`tier_discount` loses `style`), `src/lib/widgetStyle.ts` (keep `readHexColor`, `readWholeNumber`, `CORNER_RADIUS_RANGE`; delete `WidgetStyle`, `DEFAULT_WIDGET_STYLE`, `readWidgetStyle` if nothing else uses them), the discount pages that render the form (`src/app/discounts/new/page.tsx`, `src/app/discounts/[discountId]/page.tsx`: load `getStoreSettings()` and pass `design`)
- Test: update `tests/form/**`, `tests/app/discounts/*`, `tests/lib/cardIndex.test.ts`, `tests/lib/product-tiers.test.ts`, `tests/lib/config*.test.ts`; add `tests/form/formUsesGlobalDesign.test.tsx`

**Interfaces:**
- Consumes: task 1 `DesignSettings`; task 3's preview takes the design vars.
- Produces: `FormValues` without `style` and `popupFrequency`; `TierDiscountForm` prop `design: DesignSettings`; `CardIndexDiscount` = `{ discountId, title, tiers, members, flash }`; `readConfig` ignores unknown stored fields (an old config with `style` / `popupFrequency` still loads).

- [ ] **Step 1: Write the failing tests.** Form: no element named `backgroundColor` / `cornerRadius` / `popupFrequency` renders; the preview root carries `--smooth-discounts-moss:#112233` when the page passes `design.accentColor = '#112233'`; saving a discount sends no `style` or `popupFrequency`. Card index: the built JSON has no `style` / `popupFrequency` keys. Product metafield value has no `style`. Config: an old config with `style` and `popupFrequency` on a discount loads without error and `saveConfig` writes it back without them.
- [ ] **Step 2: Run** `npx vitest run tests/form tests/app tests/lib`. Expected: FAIL.
- [ ] **Step 3: Implement** the deletions and the new prop; follow the TypeScript errors (`npx tsc --noEmit`) to find every remaining reference; remove the now-dead exports and their tests.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: all green, and `grep -rn "popupFrequency\|buildCardStyle\|parseStyle" src extensions tests` finds nothing.
- [ ] **Step 5: Commit** (bump version): `git commit -m "refactor: remove the per-discount design and pop-up frequency; the form preview uses the store-wide design"`.

---

### Task 8: Clean the old values on the first Settings save

**Files:**
- Create: `src/settings/cleanOldValues.ts`
- Modify: `src/settings/runSettingsSave.ts` (new step), `src/actions/saveSettings.ts` (real step)
- Test: `tests/settings/cleanOldValues.test.ts`, `tests/settings/runSettingsSave.test.ts`

**Interfaces:**
- Consumes: task 2 `SettingsSaveSteps`; `getConfig`, `saveConfig` (`src/lib/config.ts`), `syncDiscountMetafields(discount)` (`src/lib/product-tiers.ts:150`).
- Produces: `cleanOldValues({ tools }: { tools: { readConfig: () => Promise<Config>; writeConfig: (config: Config) => Promise<void>; syncProducts: (discount: Discount) => Promise<void> } }): Promise<number>` returns how many live discounts it rewrote. Because task 7 makes `readConfig` drop unknown fields, rewriting the config removes `style` and `popupFrequency`; each live discount's `tier_discount` metafields are re-synced through `syncProducts`, and the card index is rebuilt by the existing `saveConfig`. `SettingsSaveSteps` gains `cleanOldValues: () => Promise<void>`, called after `writeSettings`.

- [ ] **Step 1: Write the failing tests.** With two live discounts and one draft: `syncProducts` is called for the two live ones only and `writeConfig` once; the config passed to `writeConfig` contains no `style` / `popupFrequency` on any discount; run twice: the second run produces the same config and no error (idempotent); if `syncProducts` throws on the second discount, `runSettingsSave` returns `{ok:false}` with a message that says the settings are saved but the cleanup is unfinished and can be finished by saving again.
- [ ] **Step 2: Run** `npx vitest run tests/settings`. Expected: FAIL.
- [ ] **Step 3: Implement** `cleanOldValues` and wire it as the last step of `runSettingsSave`.
- [ ] **Step 4: Run** `npx vitest run tests/settings` + `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: the first Settings save removes the old per-discount values from the store"`.

---

### Task 9: Stacking (Shopify discount records)

**Files:**
- Create: `src/settings/stacking.ts`, `src/settings/components/StackingPanel.tsx`
- Modify: `src/flash/sharedRecord.ts` (read all three `combinesWith` booleans; add a function that writes all three on the shared record and on every flash record of the Function), `src/flash/shopifyRecord.ts` (a new flash record takes `orderDiscounts` and `shippingDiscounts` from the shared record's current state, `productDiscounts` stays true), `src/settings/runSettingsSave.ts` (`writeShopify` becomes the real stacking write), `src/actions/saveSettings.ts`, `src/app/settings/page.tsx`, `src/settings/components/SettingsForm.tsx`
- Test: `tests/settings/stacking.test.ts`, `tests/flash/sharedRecord.test.ts`, `tests/flash/shopifyRecord.test.ts`, `tests/settings/components/stackingPanel.test.tsx`, `tests/settings/runSettingsSave.test.ts`

**Interfaces:**
- Consumes: task 2 `SettingsSaveSteps.writeShopify`; existing `findSharedRecord`, `readCombineState`, `SHARED_RECORD_TOOLS`, `allowSharedCombining` in `src/flash/sharedRecord.ts` and `RECORDS_QUERY`.
- Produces:
  - `export interface StackingFlags { orderDiscounts: boolean; shippingDiscounts: boolean; productDiscounts: boolean }`
  - `buildCombinesWith({ orderDiscounts, shippingDiscounts, productDiscounts, hasFlash }: StackingFlags & { hasFlash: boolean }): StackingFlags` (flat; `productDiscounts` is forced `true` when `hasFlash`)
  - `readSharedStacking({ query, tools }): Promise<StackingFlags>` (all false when the record has no `combinesWith`)
  - `writeStacking({ flags, query, tools }): Promise<void>` updates the shared record and every flash record of the Function; throws on a Shopify `userErrors` answer.
  - `<StackingPanel>` props `{ orderDiscounts: boolean; shippingDiscounts: boolean; productDiscounts: boolean; hasFlash: boolean; onChange: (field: string, checked: boolean) => void }`: three `CheckboxField`s with the spec's labels "Order discounts", "Shipping discounts", "Product discounts" and the spec's help text; the product box is checked and disabled when `hasFlash`; a line states that two discounts combine only when both allow it.

- [ ] **Step 1: Write the failing tests.** `buildCombinesWith`: `hasFlash` with `productDiscounts:false` returns `true`; without flash it keeps the value. `readSharedStacking`: record with no `combinesWith` returns all false. `writeStacking`: calls the update once for the shared record and once per flash record, each with all three booleans; a `userErrors` answer throws. `runSettingsSave`: when `writeStacking` throws, `writeSettings` and the cleanup are not called and the message is returned. Panel: starts from the passed state (not from the design's mock), the product box is disabled and checked when `hasFlash`, unticking order calls `onChange('orderDiscounts', false)`. New flash record: carries the shared record's `orderDiscounts` / `shippingDiscounts`.
- [ ] **Step 2: Run** `npx vitest run tests/settings tests/flash`. Expected: FAIL.
- [ ] **Step 3: Implement.** One query lists all records of the Function (`RECORDS_QUERY` extended to the three fields); `hasFlash` is "some discount in the config has a flash window", computed in the page and passed down. The page reads `readSharedStacking` once for the initial state.
- [ ] **Step 4: Run** `npx vitest run tests/settings tests/flash` + `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: add the stacking settings, written to the shared and flash discount records"`.

---

### Task 10: Theme Integration panel

**Files:**
- Create: `src/settings/themeStatus.ts`, `src/settings/components/ThemePanel.tsx`
- Modify: `src/types/appBridge.d.ts` (add `app?: { extensions?: () => Promise<{ handle: string; activations: { target: string; status: string }[] }[]> }` and `config?: { shop?: string }` to `Window.shopify`; check the exact return shape against Shopify's `shopify.app.extensions()` docs while implementing), `src/app/settings/page.tsx` (pass the app's client id from the environment variable the root layout already uses for App Bridge), `src/settings/components/SettingsForm.tsx`
- Test: `tests/settings/themeStatus.test.ts`, `tests/settings/components/themePanel.test.tsx`

**Interfaces:**
- Consumes: block handles `tier-pricing` (widget block), `card-prices` (embed), `bundle-popup` (embed) from `extensions/product-tier-pricing/blocks/`.
- Produces:
  - `readBlockStatus({ blocks, handle }: { blocks: { handle: string; status: string }[]; handle: string }): 'active' | 'inactive' | 'unknown'`
  - `buildEditorLink({ shop, clientId, handle, kind }: { shop: string; clientId: string; handle: string; kind: 'block' | 'embed' }): string`: `https://{shop}/admin/themes/current/editor?context=apps&template=product&addAppBlockId={clientId}/{handle}&target=mainSection` for a block and `https://{shop}/admin/themes/current/editor?context=apps&activateAppId={clientId}/{handle}` for an embed (confirm both against Shopify's deep-linking docs in this task; correct the format and the test if the docs differ).
  - `<ThemePanel>` props `{ shop: string; clientId: string; readBlocks: () => Promise<{ handle: string; status: string }[]> }` (the function is injected; the page passes a wrapper over `window.shopify.app.extensions`). Shows each block's "Active" / "Not active" with its link; when `readBlocks` rejects it shows "Status could not be read" and the three links. No theme name, no save field.

- [ ] **Step 1: Write the failing tests.** `readBlockStatus`: `active` for status `active`, `inactive` for `available`, `unknown` when the handle is absent. `buildEditorLink`: exact URLs for one block and one embed with `shop='demo.myshopify.com'`, `clientId='abc123'`. Panel: renders three rows; a rejecting `readBlocks` shows the unknown message and still renders the links.
- [ ] **Step 2: Run** `npx vitest run tests/settings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: all green.
- [ ] **Step 5: Commit** (bump version): `git commit -m "feat: add the theme integration status panel"`.

---

## Self-Review

- **Spec coverage:** global design (1, 2, 5, 6), Design card removal and kept form preview (7), Settings previews with mock data and pop-up placeholders (3), Impression Frequency (4, 6), Stacking by discount class with product lock and Shopify as source of truth (9), Theme Integration without a theme name (10), removal of old values from code and from the store (7, 8), Urgency panel and highest-tier checkbox not built (no task, by decision), Settings link in the homepage header (2), `tier_settings` metafield (1), card index loses `style` / `popupFrequency` (7). Demo-store check and the PRs are the owner's step after task 10 (spec, Verification).
- **Spec correction in this commit:** the spec listed `stacking` inside the `tier_settings` shape; it contradicted "starts from the shared record's current state". Stacking is not stored in the metafield; the spec line is fixed in the same commit as this plan.
- **Calls this plan makes (not in the spec):** the three flash-tone hex values, the mock products and tiers, the `data-night-color` / `data-frequency` attribute names, `hasFlash` meaning "any discount has a flash window", new flash records copy order/shipping flags from the shared record, cleanup failure leaves the settings saved and says so.
- **Not verified:** nothing has run; `shopify.app.extensions()` return shape and both editor deep-link formats are confirmed against Shopify's docs inside task 10, not here; the byte cost of the pop-up changes is known only after task 6's build.
