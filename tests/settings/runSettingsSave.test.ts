import { describe, it, expect, vi } from 'vitest'
import { runSettingsSave } from '@/settings/runSettingsSave'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'

const STACKING = { orderDiscounts: true, shippingDiscounts: false, productDiscounts: false }

describe('runSettingsSave', () => {
  it('writes Shopify first, the settings after and the clean-up last, and says it saved', async () => {
    const calls: string[] = []
    const steps = {
      writeShopify: vi.fn(async () => { calls.push('shopify') }),
      writeSettings: vi.fn(async () => { calls.push('settings') }),
      cleanOldValues: vi.fn(async () => { calls.push('clean') }),
    }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, stacking: STACKING, steps })
    expect(calls).toEqual(['shopify', 'settings', 'clean'])
    expect(steps.writeShopify).toHaveBeenCalledWith(STACKING)
    expect(steps.writeSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS)
    expect(result).toEqual({ ok: true, message: 'Settings saved.' })
  })

  it('saves nothing when Shopify refuses, and shows its message', async () => {
    const steps = {
      writeShopify: vi.fn(async () => { throw new Error('Shopify said no') }),
      writeSettings: vi.fn(async () => {}),
      cleanOldValues: vi.fn(async () => {}),
    }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, stacking: STACKING, steps })
    expect(steps.writeSettings).not.toHaveBeenCalled()
    expect(steps.cleanOldValues).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, message: 'Shopify said no' })
  })

  it('shows a plain message when the failure has none', async () => {
    const steps = { writeShopify: vi.fn(async () => {}), writeSettings: vi.fn(async () => { throw 'boom' }), cleanOldValues: vi.fn(async () => {}) }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, stacking: STACKING, steps })
    expect(result).toEqual({ ok: false, message: 'The settings could not be saved.' })
  })

  it('says the settings are saved but the clean-up is unfinished, and that saving again finishes it', async () => {
    const steps = {
      writeShopify: vi.fn(async () => {}),
      writeSettings: vi.fn(async () => {}),
      cleanOldValues: vi.fn(async () => { throw new Error('Shopify is busy') }),
    }
    const result = await runSettingsSave({ settings: DEFAULT_SETTINGS, stacking: STACKING, steps })
    expect(steps.writeSettings).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/settings are saved/i)
    expect(result.message).toMatch(/Shopify is busy/)
    expect(result.message).toMatch(/save again/i)
  })
})
