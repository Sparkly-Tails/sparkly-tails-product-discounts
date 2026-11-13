'use server'

import { getConfig, saveConfig } from '@/lib/config'
import { shopifyQuery } from '@/lib/shopify-client'
import { syncDiscountMetafields } from '@/lib/product-tiers'
import { cleanOldValues } from '@/settings/cleanOldValues'
import { parseSettingsForm, parseStackingForm, readFormFields } from '@/settings/parseSettingsForm'
import { runSettingsSave, type SettingsSaveResult } from '@/settings/runSettingsSave'
import { saveStoreSettings } from '@/settings/settingsStore'
import { hasFlashSale, writeStacking } from '@/settings/stacking'

/** The one Save of the Settings page. */
export async function saveSettingsAction(_state: SettingsSaveResult | null, formData: FormData): Promise<SettingsSaveResult> {
  // A server action takes the form it is given and nothing else, so it wires its steps here, and only here.
  /* eslint-disable guidelines/no-outer-scope-calls -- see above */
  const fields = readFormFields({ formData })
  return runSettingsSave({
    settings: parseSettingsForm({ fields }),
    stacking: parseStackingForm({ fields }),
    steps: {
      writeShopify: async (flags) => {
        const config = await getConfig()
        await writeStacking({ flags, hasFlash: hasFlashSale({ discounts: config.discounts }), query: shopifyQuery })
      },
      writeSettings: (next) => saveStoreSettings({ settings: next }),
      cleanOldValues: async () => {
        await cleanOldValues({ tools: { readConfig: getConfig, writeConfig: saveConfig, syncProducts: syncDiscountMetafields } })
      },
    },
  })
  /* eslint-enable guidelines/no-outer-scope-calls */
}
