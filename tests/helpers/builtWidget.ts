import fs from 'node:fs'
import path from 'node:path'
import { inject } from 'vitest'

/** Every component of the tier widget; the core script finds the ones already on the page and adds none. */
export const WIDGET_COMPONENTS = ['tier-pricing-model.js', 'tier-pricing-paint.js', 'tier-pricing-flash.js', 'tier-pricing-time-sale.js', 'tier-pricing-siblings.js']
export const WIDGET_CORE = 'tier-pricing.js'

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

/** Forgets the components a test registered, so the next one starts from a page that has none. */
export function clearWidgetRegistry(): void {
  delete (window as unknown as Record<string, unknown>).SparklyTierPricing
}
