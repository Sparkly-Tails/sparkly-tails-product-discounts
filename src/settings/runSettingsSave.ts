// The one Save of the Settings page. Shopify is written first and the store's settings after, so a refusal from
// Shopify leaves everything as it was (the order of the discount save: record before config).
import type { StoreSettings } from '@/settings/storeSettings'

export interface SettingsSaveResult {
  ok: boolean
  message: string
}

export interface SettingsSaveSteps {
  writeShopify: (settings: StoreSettings) => Promise<void>
  writeSettings: (settings: StoreSettings) => Promise<void>
}

export async function runSettingsSave({ settings, steps }: { settings: StoreSettings; steps: SettingsSaveSteps }): Promise<SettingsSaveResult> {
  try {
    await steps.writeShopify(settings)
    await steps.writeSettings(settings)
    return { ok: true, message: 'Settings saved.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The settings could not be saved.' }
  }
}
