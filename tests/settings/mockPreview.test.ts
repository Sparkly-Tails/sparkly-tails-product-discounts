import { describe, it, expect } from 'vitest'
import { buildMockFlash, buildMockPreview } from '@/settings/mockPreview'
import { parseStyleText } from '@/settings/styleVars'

describe('buildMockPreview', () => {
  it('has 3 products and 3 tiers that rise', () => {
    const { products, tiers } = buildMockPreview()
    expect(products.map((product) => [product.title, product.price])).toEqual([['Dog harness', 24], ['Chew toy', 18], ['Travel bowl', 12]])
    expect(tiers).toEqual([{ minQty: 2, percentOff: 10 }, { minQty: 3, percentOff: 15 }, { minQty: 4, percentOff: 20 }])
  })
})

describe('buildMockFlash', () => {
  it('starts an hour ago and ends in two hours, as shop wall-clock text', () => {
    const flash = buildMockFlash({ nowSeconds: Date.UTC(2026, 10, 12, 10, 30) / 1000 })
    expect(flash).toEqual({ startsAt: '2026-11-12T09:30', endsAt: '2026-11-12T12:30', showTeaser: false })
  })
})

describe('parseStyleText', () => {
  it('turns a style attribute text into a map of its variables', () => {
    expect(parseStyleText({ text: '--a:#fff;--b:12px' })).toEqual({ '--a': '#fff', '--b': '12px' })
  })
})
