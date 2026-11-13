import { describe, it, expect } from 'vitest'
import { parseSettingsForm, parseStackingForm } from '@/settings/parseSettingsForm'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'

describe('parseSettingsForm', () => {
  it('reads the five fields', () => {
    const settings = parseSettingsForm({ fields: { accentColor: '#112233', backgroundColor: '#445566AA', cornerRadius: '8', flashTone: 'deep-pine', frequency: 'checkout' } })
    expect(settings).toEqual({ design: { accentColor: '#112233', backgroundColor: '#445566AA', cornerRadius: 8, flashTone: 'deep-pine' }, popup: { frequency: 'checkout' } })
  })

  it('falls back to the defaults for no fields', () => {
    expect(parseSettingsForm({ fields: {} })).toEqual(DEFAULT_SETTINGS)
  })

  it('replaces each bad value by its default instead of passing it on', () => {
    const settings = parseSettingsForm({ fields: { accentColor: 'red;}</style>', backgroundColor: 'url(x)', cornerRadius: '999', flashTone: 'blue', frequency: 'always' } })
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, design: { ...DEFAULT_SETTINGS.design, cornerRadius: 24 } })
  })
})

describe('parseStackingForm', () => {
  it('reads each choice as on only when the field says true', () => {
    expect(parseStackingForm({ fields: { orderDiscounts: 'true', shippingDiscounts: 'false', productDiscounts: 'on' } })).toEqual({ orderDiscounts: true, shippingDiscounts: false, productDiscounts: false })
  })

  it('reads missing fields as off', () => {
    expect(parseStackingForm({ fields: {} })).toEqual({ orderDiscounts: false, shippingDiscounts: false, productDiscounts: false })
  })
})
