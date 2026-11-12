'use server'

import { parseSettingsForm, readFormFields } from '@/settings/parseSettingsForm'
import { runSettingsSave, type SettingsSaveResult } from '@/settings/runSettingsSave'
import { saveStoreSettings } from '@/settings/settingsStore'

/** The one Save of the Settings page. */
export async function saveSettingsAction(_state: SettingsSaveResult | null, formData: FormData): Promise<SettingsSaveResult> {
  // A server action takes the form it is given and nothing else, so it wires its steps here, and only here.
  /* eslint-disable guidelines/no-outer-scope-calls -- see above */
  const settings = parseSettingsForm({ fields: readFormFields({ formData }) })
  return runSettingsSave({
    settings,
    steps: {
      writeShopify: async () => {},
      writeSettings: (next) => saveStoreSettings({ settings: next }),
    },
  })
  /* eslint-enable guidelines/no-outer-scope-calls */
}
