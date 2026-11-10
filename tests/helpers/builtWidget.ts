import fs from 'node:fs'
import path from 'node:path'
import { inject } from 'vitest'

/** Every component of the tier widget; the core script finds the ones already on the page and adds none. */
export const WIDGET_COMPONENTS = ['tier-pricing-model.js', 'tier-pricing-paint.js', 'tier-pricing-flash.js', 'tier-pricing-siblings.js', 'tier-pricing-currency.js']
export const WIDGET_CORE = 'tier-pricing.js'

/** The components of the card prices embed: its own offer component, and the widget's currency component it shares. */
export const CARD_COMPONENTS = ['card-prices-offer.js', 'tier-pricing-currency.js']
export const CARD_CORE = 'card-prices.js'

/** The components of the bundle pop-up embed: its boxes, controller, drawing and facts components, and the widget's currency component it shares. */
export const POPUP_COMPONENTS = ['bundle-popup-boxes.js', 'bundle-popup-ui.js', 'bundle-popup-view.js', 'bundle-popup-facts.js', 'tier-pricing-currency.js']
export const POPUP_CORE = 'bundle-popup.js'

export type BuiltWidget = Record<string, string>

/** The scripts and stylesheets built for this test run (see buildWidgetGlobalSetup.ts), by file name. */
export function readBuiltWidget(): BuiltWidget {
  const folder = inject('builtWidgetFolder')
  const built: BuiltWidget = {}
  for (const name of fs.readdirSync(folder)) built[name] = fs.readFileSync(path.join(folder, name), 'utf8')
  return built
}

/** Runs the built scripts in the page's global scope: the components, then the core script that uses them. */
export function runWidgetScripts({ built, components = WIDGET_COMPONENTS }: { built: BuiltWidget; components?: string[] }): void {
  for (const name of [...components, WIDGET_CORE]) (0, eval)(built[name])
}

/** Runs the built card scripts in the page's global scope: the components, then the core script that uses them. */
export function runCardScripts({ built, components = CARD_COMPONENTS }: { built: BuiltWidget; components?: string[] }): void {
  for (const name of [...components, CARD_CORE]) (0, eval)(built[name])
}

/** Runs the built pop-up scripts in the page's global scope: the components, then the core script that uses them. */
export function runPopupScripts({ built, components = POPUP_COMPONENTS }: { built: BuiltWidget; components?: string[] }): void {
  for (const name of [...components, POPUP_CORE]) (0, eval)(built[name])
}

/** Forgets the components a test registered, so the next one starts from a page that has none. */
export function clearWidgetRegistry(): void {
  delete (window as unknown as Record<string, unknown>).SmoothDiscounts
}
