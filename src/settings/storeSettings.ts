// The store-wide settings kept in the `tier_settings` shop metafield: the design and the pop-up frequency.
// Stacking is not kept here: Shopify's discount records are its source of truth.
import { DEFAULT_DESIGN, DESIGN_TOOLS, pickRecord, readDesign, type DesignSettings } from '@/settings/design'
import { DEFAULT_FREQUENCY, readFrequency, type PopupFrequency } from '@/settings/frequency'

export interface StoreSettings {
  design: DesignSettings
  popup: { frequency: PopupFrequency }
}

export const DEFAULT_SETTINGS: StoreSettings = { design: DEFAULT_DESIGN, popup: { frequency: DEFAULT_FREQUENCY } }

/** The text as data, or null when it is empty or not JSON. */
export function parseJson({ text }: { text: string | null | undefined }): unknown {
  try {
    return JSON.parse(text ?? '')
  } catch {
    return null
  }
}

export const SETTINGS_TOOLS = { parseJson, pickRecord, readDesign, readFrequency, designTools: DESIGN_TOOLS }

/** The settings from the stored text; nothing stored, or text that is broken, reads as the defaults. */
export function readStoreSettings({ text, tools = SETTINGS_TOOLS }: { text: string | null | undefined; tools?: typeof SETTINGS_TOOLS }): StoreSettings {
  const record = tools.pickRecord({ value: tools.parseJson({ text }) })
  return {
    design: tools.readDesign({ value: record.design, tools: tools.designTools }),
    popup: { frequency: tools.readFrequency({ value: tools.pickRecord({ value: record.popup }).frequency }) },
  }
}

/** The JSON text stored in the metafield. */
export function buildSettingsValue({ settings }: { settings: StoreSettings }): string {
  return JSON.stringify(settings)
}
