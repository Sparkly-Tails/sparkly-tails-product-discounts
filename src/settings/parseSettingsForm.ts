// The Settings form's submitted fields as settings: every bad or missing value becomes its default.
import { readDesign } from '@/settings/design'
import { readFrequency } from '@/settings/frequency'
import type { StackingFlags } from '@/settings/stacking'
import type { StoreSettings } from '@/settings/storeSettings'

export const PARSE_SETTINGS_TOOLS = { readDesign, readFrequency }

/** The text fields of a submitted form (files are left out). */
export function readFormFields({ formData }: { formData: FormData }): Record<string, string> {
  return Object.fromEntries([...formData].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

export function parseSettingsForm({ fields, tools = PARSE_SETTINGS_TOOLS }: { fields: Record<string, string>; tools?: typeof PARSE_SETTINGS_TOOLS }): StoreSettings {
  return {
    design: tools.readDesign({ value: fields }),
    popup: { frequency: tools.readFrequency({ value: fields.frequency }) },
  }
}

/** The stacking choices of a submitted form; a choice is on only when its field says "true". */
export function parseStackingForm({ fields }: { fields: Record<string, string> }): StackingFlags {
  return {
    orderDiscounts: fields.orderDiscounts === 'true',
    shippingDiscounts: fields.shippingDiscounts === 'true',
    productDiscounts: fields.productDiscounts === 'true',
  }
}
