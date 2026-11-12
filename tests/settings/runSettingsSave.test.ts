import { describe, it, expect, vi } from 'vitest'
import { runSettingsSave } from '@/settings/runSettingsSave'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'

describe('runSettingsSave', () => {
  it('writes Shopify first and the settings after, and says it saved', async () => {
    const calls: string[] = []
    const steps = {
      writeShopify: vi.fn(async () => { calls.push('shopify') }),
      writeSettings: vi.fn(async () => { calls.push('settings') }),
    }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, steps })
    expect(calls).toEqual(['shopify', 'settings'])
    expect(steps.writeShopify).toHaveBeenCalledWith(DEFAULT_SETTINGS)
    expect(steps.writeSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS)
    expect(result).toEqual({ ok: true, message: 'Settings saved.' })
  })

  it('saves nothing when Shopify refuses, and shows its message', async () => {
    const steps = {
      writeShopify: vi.fn(async () => { throw new Error('Shopify said no') }),
      writeSettings: vi.fn(async () => {}),
    }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, steps })
    expect(steps.writeSettings).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, message: 'Shopify said no' })
  })

  it('shows a plain message when the failure has none', async () => {
    const steps = { writeShopify: vi.fn(async () => {}), writeSettings: vi.fn(async () => { throw 'boom' }) }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, steps })
    expect(result).toEqual({ ok: false, message: 'The settings could not be saved.' })
  })
})
