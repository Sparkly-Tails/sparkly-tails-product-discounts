import { describe, it, expect } from 'vitest'
import { flattenSettings, isSettingsDirty } from '@/settings/settingsFormValues'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'

describe('settings form values', () => {
  it('flattens the settings into the five plain fields', () => {
    expect(flattenSettings({ settings: DEFAULT_SETTINGS })).toEqual({ accentColor: '#434625', backgroundColor: '#F5EFE1', cornerRadius: 12, flashTone: 'olive-night', frequency: 'session' })
  })

  it('is dirty only when a field differs from the saved one', () => {
    const saved = flattenSettings({ settings: DEFAULT_SETTINGS })
    expect(isSettingsDirty({ saved, current: { ...saved } })).toBe(false)
    expect(isSettingsDirty({ saved, current: { ...saved, cornerRadius: 13 } })).toBe(true)
  })
})
