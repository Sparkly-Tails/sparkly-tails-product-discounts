// The Settings form's values as plain, flat fields (what the controls hold and the form submits).
import type { FlashTone } from '@/settings/design'
import type { PopupFrequency } from '@/settings/frequency'
import type { StoreSettings } from '@/settings/storeSettings'

export interface SettingsFormValues {
  accentColor: string
  backgroundColor: string
  cornerRadius: number
  flashTone: FlashTone
  frequency: PopupFrequency
}

export function flattenSettings({ settings }: { settings: StoreSettings }): SettingsFormValues {
  return {
    accentColor: settings.design.accentColor,
    backgroundColor: settings.design.backgroundColor,
    cornerRadius: settings.design.cornerRadius,
    flashTone: settings.design.flashTone,
    frequency: settings.popup.frequency,
  }
}

/** True when a field differs from the saved one; both lists have the fields in the same order. */
export function isSettingsDirty({ saved, current }: { saved: SettingsFormValues; current: SettingsFormValues }): boolean {
  return JSON.stringify(saved) !== JSON.stringify(current)
}
