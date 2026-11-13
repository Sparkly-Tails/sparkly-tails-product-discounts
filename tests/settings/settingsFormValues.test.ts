import { describe, it, expect } from 'vitest'
import { flattenSettings, isSettingsDirty } from '@/settings/settingsFormValues'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'

const STACKING = { orderDiscounts: true, shippingDiscounts: false, productDiscounts: true }

describe('settings form values', () => {
  it('flattens the settings and the stacking choices into plain fields', () => {
    expect(flattenSettings({ settings: DEFAULT_SETTINGS, stacking: STACKING })).toEqual({ accentColor: '#434625', backgroundColor: '#F5EFE1', cornerRadius: 12, flashTone: 'olive-night', frequency: 'session', orderDiscounts: true, shippingDiscounts: false, productDiscounts: true })
  })

  it('is dirty only when a field differs from the saved one', () => {
    const saved = flattenSettings({ settings: DEFAULT_SETTINGS, stacking: STACKING })
    expect(isSettingsDirty({ saved, current: { ...saved } })).toBe(false)
    expect(isSettingsDirty({ saved, current: { ...saved, cornerRadius: 13 } })).toBe(true)
    expect(isSettingsDirty({ saved, current: { ...saved, shippingDiscounts: true } })).toBe(true)
  })
})
