import { describe, it, expect } from 'vitest'
import { buildFunctionConfigMetafield } from '@/timeDiscounts/shopifyRecord'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'
import type { TimeDiscountItem } from '@/timeDiscounts/config'

describe('buildFunctionConfigMetafield', () => {
  it('writes the Function config as time_function_config in the app namespace', () => {
    const items: TimeDiscountItem[] = [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 }]
    expect(buildFunctionConfigMetafield(items)).toEqual({
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEYS.timeFunctionConfig,
      type: 'json',
      value: JSON.stringify({ items }),
    })
  })
})
