import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, readStoreSettings, buildSettingsValue } from '@/settings/storeSettings'
import { DEFAULT_FREQUENCY, readFrequency } from '@/settings/frequency'

describe('readStoreSettings', () => {
  it('returns the defaults for nothing, empty, broken or non-object text', () => {
    for (const text of [null, undefined, '', '{not json', '[]', '"x"', 'null']) {
      expect(readStoreSettings({ text })).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('round-trips through buildSettingsValue', () => {
    const settings = { design: { accentColor: '#112233', backgroundColor: '#AABBCC', cornerRadius: 5, flashTone: 'pure-onyx' as const }, popup: { frequency: 'checkout' as const } }
    expect(readStoreSettings({ text: buildSettingsValue({ settings }) })).toEqual(settings)
  })

  it('falls back to once per session for an unknown frequency', () => {
    expect(readStoreSettings({ text: JSON.stringify({ popup: { frequency: 'every' } }) }).popup.frequency).toBe('session')
  })
})

describe('readFrequency', () => {
  it('accepts session and checkout only', () => {
    expect(DEFAULT_FREQUENCY).toBe('session')
    expect(readFrequency({ value: 'checkout' })).toBe('checkout')
    expect(readFrequency({ value: 'session' })).toBe('session')
    expect(readFrequency({ value: 5 })).toBe('session')
  })
})
