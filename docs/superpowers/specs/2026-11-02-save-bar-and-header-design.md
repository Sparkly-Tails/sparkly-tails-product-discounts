# Shopify's save bar, no in-app header, and the app's name

Date: 2026-11-02. Status: built (owner's request); the save bar is not yet seen in the real admin.

## The save bar

Save and Discard of the discount form moved from the footer to Shopify's contextual save bar (App Bridge `<ui-save-bar>`, at the top of the admin). App Bridge is already loaded by the root layout.

- `SaveBar` (`src/form/components/SaveBar.tsx`) renders `<ui-save-bar id="discount-save-bar">` with a primary Save and a Discard (plain `type="button"` buttons that call what the form gives them), outside the `<form>`. It calls `shopify.saveBar.show(id)` while the form has unsaved changes (the form's existing dirty check) and `hide(id)` when it has none and when the page goes away. Without App Bridge on the page it does nothing.
- Save calls `form.requestSubmit()`, so it is the same save as the footer's Save was (and Go live and Take offline, which stay in the footer, are still submit buttons). Save is off in the same cases as before (no product, an incomplete tier) and while a save is under way.
- Discard on the Edit page takes back every change since the last save; on the Create page nothing is saved yet, so it goes to the discounts.
- The footer keeps Delete (when the discount can be deleted) and Go live or Take offline; its "unsaved changes" line is gone, as Shopify's bar says it.
- Chosen from the two documented ways (the `data-save-bar` form attribute, or the `<ui-save-bar>` element with `shopify.saveBar`): the element, because the form's own dirty check and its Save rules are already in the page.

**Not verified in the real admin:** the bar only exists inside the embedded Shopify admin, which I cannot open. The tests use a stand-in for `shopify.saveBar` and check the element, the buttons, the show and hide calls, Save submitting and Discard resetting. The owner checks it on dev.

## The header and the app's name

- The bar with the "ST" mark and "Smooth Discounts" (`HomeHeader`) is gone from the home page and from the form pages. Shopify shows the app's name at the top of the admin, taken from the app's config.
- `name` is "Smooth Discounts" in `shopify.app.dev.toml` (it was "demo") and in `shopify.app.toml` (it was "st-product-discounts"). It reaches Shopify with the next `deploy:dev` / `deploy:prod`; whether the CLI applies a changed name on deploy was not checked.
- The logotype next to the name is the app icon, which is set in the Dev Dashboard, not in the toml.
- The small `v0.x.y` label stays (it is how the deployed version is seen).
