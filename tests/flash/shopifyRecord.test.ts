import { describe, it, expect, vi } from 'vitest'
import {
  buildFlashRecordInput,
  createFlashRecord,
  deleteFlashRecord,
  updateFlashRecord,
  type ShopifyQuery,
} from '@/flash/shopifyRecord'

const input = buildFlashRecordInput({
  title: 'Spring Flash Sale',
  discountId: 'disc_abc',
  startsAtUtc: '2026-11-27T09:00:00.000Z',
  endsAtUtc: '2026-11-30T23:59:00.000Z',
})

describe('buildFlashRecordInput', () => {
  it('runs the tier Function for the product class with the UTC window', () => {
    expect(input).toMatchObject({
      title: 'Spring Flash Sale',
      functionHandle: 'product-discount',
      discountClasses: ['PRODUCT'],
      startsAt: '2026-11-27T09:00:00.000Z',
      endsAt: '2026-11-30T23:59:00.000Z',
    })
  })

  it('carries only the id of the tier discount as the record config, never any tier data', () => {
    expect(input.metafields).toEqual([
      { namespace: '$app:smooth_discount', key: 'flash_record', type: 'json', value: '{"discountId":"disc_abc"}' },
    ])
  })
})

describe('createFlashRecord', () => {
  it('sends the input and returns the id of the new Shopify discount', async () => {
    const query = vi.fn(async () => ({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/7' }, userErrors: [] },
    }))
    const id = await createFlashRecord({ query: query as unknown as ShopifyQuery, input })
    expect(id).toBe('gid://shopify/DiscountAutomaticNode/7')
    expect(query).toHaveBeenCalledTimes(1)
    const [text, variables] = query.mock.calls[0] as unknown as [string, { automaticAppDiscount: unknown }]
    expect(text).toContain('discountAutomaticAppCreate')
    expect(variables.automaticAppDiscount).toEqual(input)
  })

  it('throws the text Shopify gives when it refuses (for example the limit of active discounts)', async () => {
    const query = vi.fn(async () => ({
      discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: ['x'], message: 'Maximum number of active discounts reached.' }] },
    }))
    await expect(createFlashRecord({ query: query as unknown as ShopifyQuery, input })).rejects.toThrow('Maximum number of active discounts reached.')
  })

  it('throws when Shopify returns neither a discount nor an error', async () => {
    const query = vi.fn(async () => ({ discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [] } }))
    await expect(createFlashRecord({ query: query as unknown as ShopifyQuery, input })).rejects.toThrow('Shopify did not return the created discount')
  })
})

describe('updateFlashRecord', () => {
  it('updates the discount with the new input', async () => {
    const query = vi.fn(async () => ({ discountAutomaticAppUpdate: { userErrors: [] } }))
    await updateFlashRecord({ query: query as unknown as ShopifyQuery, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/7', input })
    const [text, variables] = query.mock.calls[0] as unknown as [string, { id: string; automaticAppDiscount: unknown }]
    expect(text).toContain('discountAutomaticAppUpdate')
    expect(variables).toEqual({ id: 'gid://shopify/DiscountAutomaticNode/7', automaticAppDiscount: input })
  })

  it('throws the text Shopify gives for an invalid window', async () => {
    const query = vi.fn(async () => ({ discountAutomaticAppUpdate: { userErrors: [{ field: ['endsAt'], message: 'Ends at must be after starts at' }] } }))
    await expect(updateFlashRecord({ query: query as unknown as ShopifyQuery, shopifyDiscountId: 'x', input })).rejects.toThrow('Ends at must be after starts at')
  })
})

describe('deleteFlashRecord', () => {
  it('deletes the discount', async () => {
    const query = vi.fn(async () => ({ discountAutomaticDelete: { userErrors: [] } }))
    await deleteFlashRecord({ query: query as unknown as ShopifyQuery, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/7' })
    const [text, variables] = query.mock.calls[0] as unknown as [string, { id: string }]
    expect(text).toContain('discountAutomaticDelete')
    expect(variables).toEqual({ id: 'gid://shopify/DiscountAutomaticNode/7' })
  })

  it('treats a "not found" answer as success, so a retry after a half-finished delete is not stuck', async () => {
    const query = vi.fn(async () => ({ discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Discount does not exist' }] } }))
    await expect(deleteFlashRecord({ query: query as unknown as ShopifyQuery, shopifyDiscountId: 'x' })).resolves.toBeUndefined()
  })

  it('throws any other error', async () => {
    const query = vi.fn(async () => ({ discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Something else went wrong' }] } }))
    await expect(deleteFlashRecord({ query: query as unknown as ShopifyQuery, shopifyDiscountId: 'x' })).rejects.toThrow('Something else went wrong')
  })
})
