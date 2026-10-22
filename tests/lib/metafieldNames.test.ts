import { describe, it, expect } from 'vitest'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'

describe('metafield names', () => {
  it('uses the app-owned namespace', () => {
    expect(METAFIELD_NAMESPACE).toBe('$app:smooth_discount')
  })

  it('has the eight keys with these exact values', () => {
    expect(METAFIELD_KEYS).toEqual({
      tierConfig: 'tier_config',
      tierDiscount: 'tier_discount',
      tierSiblingProducts: 'tier_sibling_products',
      tierSiblingVariants: 'tier_sibling_variants',
      timeDiscount: 'time_discount',
      timeConfig: 'time_config',
      timeFunctionConfig: 'time_function_config',
      flashRecord: 'flash_record',
    })
  })

  it('keys are unique', () => {
    const values = Object.values(METAFIELD_KEYS)
    expect(new Set(values).size).toBe(values.length)
  })
})
