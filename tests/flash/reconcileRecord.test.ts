import { describe, it, expect, vi } from 'vitest'
import { RECORD_TOOLS, decideRecordAction, syncFlashRecord } from '@/flash/reconcileRecord'
import type { ShopifyQuery } from '@/flash/shopifyRecord'

describe('decideRecordAction', () => {
  it.each([
    ['live', true, undefined, 'create'],
    ['live', true, 'gid://x/1', 'update'],
    ['live', false, undefined, 'none'],
    ['live', false, 'gid://x/1', 'delete'],
    ['draft', true, undefined, 'none'],
    ['draft', true, 'gid://x/1', 'delete'],
    ['draft', false, undefined, 'none'],
    ['draft', false, 'gid://x/1', 'delete'],
  ] as const)('status %s, flash %s, record %s gives %s', (status, hasFlash, shopifyDiscountId, expected) => {
    expect(decideRecordAction({ status, hasFlash, shopifyDiscountId })).toBe(expected)
  })
})

function fakes() {
  const createRecord = vi.fn(async () => 'gid://shopify/DiscountAutomaticNode/NEW')
  const updateRecord = vi.fn(async () => undefined)
  const deleteRecord = vi.fn(async () => undefined)
  return { createRecord, updateRecord, deleteRecord, tools: { ...RECORD_TOOLS, createRecord, updateRecord, deleteRecord } }
}

const query = (() => undefined) as unknown as ShopifyQuery
const convertToUtc = (naive: string) => naive + ':00.000Z'
const flash = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59' }
const base = { title: 'Spring Flash Sale', discountId: 'disc_abc', query, convertToUtc }

describe('syncFlashRecord', () => {
  it('creates the record for a live flash discount without one, once, with the UTC window and the discount title, and returns its id', async () => {
    const { tools, createRecord, updateRecord, deleteRecord } = fakes()
    const id = await syncFlashRecord({ ...base, status: 'live', flash, shopifyDiscountId: undefined, tools })
    expect(id).toBe('gid://shopify/DiscountAutomaticNode/NEW')
    expect(createRecord).toHaveBeenCalledTimes(1)
    const call = createRecord.mock.calls[0] as unknown as [{ input: { title: string; startsAt: string; endsAt: string; metafields: { value: string }[] } }]
    expect(call[0].input).toMatchObject({ title: 'Spring Flash Sale', startsAt: '2026-11-27T09:00:00.000Z', endsAt: '2026-11-30T23:59:00.000Z' })
    expect(call[0].input.metafields[0].value).toBe('{"discountId":"disc_abc"}')
    expect(updateRecord).not.toHaveBeenCalled()
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('updates the record of a live flash discount that has one and keeps its id (re-running an ended sale with new dates)', async () => {
    const { tools, createRecord, updateRecord } = fakes()
    const id = await syncFlashRecord({ ...base, status: 'live', flash, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/7', tools })
    expect(id).toBe('gid://shopify/DiscountAutomaticNode/7')
    expect(updateRecord).toHaveBeenCalledTimes(1)
    expect((updateRecord.mock.calls[0] as unknown as [{ shopifyDiscountId: string }])[0].shopifyDiscountId).toBe('gid://shopify/DiscountAutomaticNode/7')
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('deletes the record and gives no id when the flash is switched off', async () => {
    const { tools, deleteRecord, createRecord } = fakes()
    const id = await syncFlashRecord({ ...base, status: 'live', flash: undefined, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/7', tools })
    expect(id).toBeUndefined()
    expect(deleteRecord).toHaveBeenCalledTimes(1)
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('deletes the record when the discount goes back to Draft', async () => {
    const { tools, deleteRecord } = fakes()
    const id = await syncFlashRecord({ ...base, status: 'draft', flash, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/7', tools })
    expect(id).toBeUndefined()
    expect(deleteRecord).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a Draft flash discount without a record and for a regular discount', async () => {
    const { tools, createRecord, updateRecord, deleteRecord } = fakes()
    expect(await syncFlashRecord({ ...base, status: 'draft', flash, shopifyDiscountId: undefined, tools })).toBeUndefined()
    expect(await syncFlashRecord({ ...base, status: 'live', flash: undefined, shopifyDiscountId: undefined, tools })).toBeUndefined()
    expect(createRecord).not.toHaveBeenCalled()
    expect(updateRecord).not.toHaveBeenCalled()
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('passes a Shopify refusal on, so the caller can keep the old state and show the message', async () => {
    const { tools } = fakes()
    tools.createRecord = vi.fn(async () => { throw new Error('Maximum number of active discounts reached.') })
    await expect(syncFlashRecord({ ...base, status: 'live', flash, shopifyDiscountId: undefined, tools })).rejects.toThrow('Maximum number of active discounts reached.')
  })

  it('passes a failed update and a failed delete on as well', async () => {
    const { tools } = fakes()
    tools.updateRecord = vi.fn(async () => { throw new Error('update failed') })
    tools.deleteRecord = vi.fn(async () => { throw new Error('delete failed') })
    await expect(syncFlashRecord({ ...base, status: 'live', flash, shopifyDiscountId: 'x', tools })).rejects.toThrow('update failed')
    await expect(syncFlashRecord({ ...base, status: 'draft', flash, shopifyDiscountId: 'x', tools })).rejects.toThrow('delete failed')
  })
})
