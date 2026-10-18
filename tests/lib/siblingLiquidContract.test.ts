import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY } from '@/lib/product-tiers'
import { METAFIELD_NAMESPACE } from '@/lib/metafieldNames'

const liquid = readFileSync(join(process.cwd(), 'extensions/product-tier-pricing/blocks/tier-pricing.liquid'), 'utf8')

describe('tier-pricing.liquid reads what the writer writes', () => {
  it('reads both sibling reference lists by the exact keys the writer uses', () => {
    expect(liquid).toContain(`product.metafields['${METAFIELD_NAMESPACE}'].${SIBLING_PRODUCTS_KEY}`)
    expect(liquid).toContain(`product.metafields['${METAFIELD_NAMESPACE}'].${SIBLING_VARIANTS_KEY}`)
  })

  it('no longer reads copied own-variant titles from the metafield', () => {
    expect(liquid).not.toContain('discount_metafield.value.ownVariantOptions')
  })

  it('marks each sibling listed or not, so the widget can hide unresolved ones', () => {
    expect(liquid).toContain('"listed"')
  })

  it('keeps the temporary fallback in one clearly marked block', () => {
    expect(liquid).toContain('TEMPORARY FALLBACK')
  })
})
