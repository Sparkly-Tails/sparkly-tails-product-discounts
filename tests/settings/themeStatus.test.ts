import { describe, it, expect, vi } from 'vitest'
import { buildEditorLink, flattenExtensions, readBlockStatus, readThemeBlocks } from '@/settings/themeStatus'

const BLOCKS = [{ handle: 'tier-pricing', status: 'active' }, { handle: 'card-prices', status: 'available' }]

describe('readBlockStatus', () => {
  it('is active for an active block, inactive for one that is only available, unknown when the handle is absent', () => {
    expect(readBlockStatus({ blocks: BLOCKS, handle: 'tier-pricing' })).toBe('active')
    expect(readBlockStatus({ blocks: BLOCKS, handle: 'card-prices' })).toBe('inactive')
    expect(readBlockStatus({ blocks: BLOCKS, handle: 'bundle-popup' })).toBe('unknown')
  })

  it('counts any other status as inactive, because the block is not running on the theme', () => {
    expect(readBlockStatus({ blocks: [{ handle: 'bundle-popup', status: 'unavailable' }], handle: 'bundle-popup' })).toBe('inactive')
  })
})

describe('buildEditorLink', () => {
  it('links a block to the product template of the current theme, in the main section', () => {
    expect(buildEditorLink({ shop: 'demo.myshopify.com', clientId: 'abc123', handle: 'tier-pricing', kind: 'block' }))
      .toBe('https://demo.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=abc123/tier-pricing&target=mainSection')
  })

  it('links an embed to the apps tab of the current theme editor with the embed ready to turn on', () => {
    expect(buildEditorLink({ shop: 'demo.myshopify.com', clientId: 'abc123', handle: 'bundle-popup', kind: 'embed' }))
      .toBe('https://demo.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=abc123/bundle-popup')
  })
})

describe('flattenExtensions', () => {
  it('lists the blocks of the theme app extensions and skips every other kind of extension', () => {
    const extensions = [
      { handle: 'checkout-ext', type: 'ui_extension', activations: [{ target: 'purchase.thank-you.block.render' }] },
      { handle: 'product-tier-pricing', type: 'theme_app_extension', activations: [{ handle: 'tier-pricing', name: 'Tier pricing', target: 'section', status: 'active', activations: [] }, { handle: 'bundle-popup', target: 'body', status: 'available', activations: [] }] },
    ]
    expect(flattenExtensions({ extensions })).toEqual([{ handle: 'tier-pricing', status: 'active' }, { handle: 'bundle-popup', status: 'available' }])
  })

  it('gives an empty list when the app has no extensions', () => {
    expect(flattenExtensions({ extensions: [] })).toEqual([])
  })
})

describe('readThemeBlocks', () => {
  it('reads the extensions with the function it is given and returns the flat blocks', async () => {
    const readExtensions = vi.fn(async () => [{ handle: 'x', type: 'theme_app_extension', activations: [{ handle: 'tier-pricing', status: 'active' }] }])
    expect(await readThemeBlocks({ readExtensions })).toEqual([{ handle: 'tier-pricing', status: 'active' }])
  })

  it('lets a failure of the read through, so the panel can say it could not read the status', async () => {
    await expect(readThemeBlocks({ readExtensions: async () => { throw new Error('no bridge') } })).rejects.toThrow('no bridge')
  })
})
