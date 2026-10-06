import { describe, it, expect } from 'vitest'
import {
  dropUnsavedRows, newDraftRow, addDraftRow, keepRow, removeRow, omitKey,
  titleSaveDecision, shouldSaveSchedule, settledTitle, saveBlocker, hasUnsavedWork,
  keptRows, itemsPayload, isRedirectError,
} from '@/timeDiscounts/rows'
import { itemKey } from '@/timeDiscounts/items'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'

const BASE = 'https://shop.myshopify.com/admin/products/'
const row = (id: number, over: Partial<DisplayRow> = {}): DisplayRow => ({
  productId: `gid://shopify/Product/${id}`, title: `Product ${id}`, adminUrl: `${BASE}${id}`,
  regularPrice: 10, pricingMode: 'percent', amount: 20, ...over,
})
const unsaved = (id: number) => row(id, { isNew: true, amount: 0 })

describe('dropUnsavedRows', () => {
  it('drops rows that were added but never kept', () => {
    const list = [row(1), unsaved(2)]
    expect(dropUnsavedRows(list, null, null)).toEqual([row(1)])
  })

  it('keeps the unsaved row being edited, and the one whose save is in flight', () => {
    const list = [row(1), unsaved(2), unsaved(3), unsaved(4)]
    expect(dropUnsavedRows(list, itemKey(unsaved(2)), itemKey(unsaved(3))).map((r) => r.title)).toEqual(['Product 1', 'Product 2', 'Product 3'])
  })

  it('does not change the list it is given', () => {
    const list = [row(1), unsaved(2)]
    dropUnsavedRows(list, null, null)
    expect(list).toHaveLength(2)
  })
})

describe('newDraftRow', () => {
  it('opens as an unsaved percentage row linked to the product in the Shopify admin', () => {
    expect(newDraftRow({ productId: 'gid://shopify/Product/7', variantId: 'gid://shopify/ProductVariant/70', title: 'Bed – Grey', price: 40 }, BASE)).toEqual({
      productId: 'gid://shopify/Product/7', variantId: 'gid://shopify/ProductVariant/70', title: 'Bed – Grey',
      adminUrl: `${BASE}7`, regularPrice: 40, pricingMode: 'percent', amount: 0, isNew: true,
    })
  })
})

describe('addDraftRow', () => {
  it('appends the new row after dropping other unsaved rows, but not the one being saved', () => {
    const list = [row(1), unsaved(2), unsaved(3)]
    const added = addDraftRow(list, unsaved(4), itemKey(unsaved(3)))
    expect(added.map((r) => r.title)).toEqual(['Product 1', 'Product 3', 'Product 4'])
  })
})

describe('keepRow', () => {
  it('stores the rule on that row and marks it as kept, leaving the others alone', () => {
    const list = [row(1), unsaved(2)]
    const kept = keepRow(list, itemKey(unsaved(2)), { pricingMode: 'fixed', amount: 7.5 })
    expect(kept[1]).toMatchObject({ pricingMode: 'fixed', amount: 7.5, isNew: false })
    expect(kept[0]).toBe(list[0])
  })
})

describe('removeRow', () => {
  it('removes the row with that key only', () => {
    expect(removeRow([row(1), row(2)], itemKey(row(1))).map((r) => r.title)).toEqual(['Product 2'])
  })
})

describe('omitKey', () => {
  it('returns a copy without the key', () => {
    const errors = { a: 'x', b: 'y' }
    expect(omitKey(errors, 'a')).toEqual({ b: 'y' })
    expect(errors).toEqual({ a: 'x', b: 'y' })
  })
})

describe('titleSaveDecision', () => {
  it('asks for a title when it is blank', () => {
    expect(titleSaveDecision('   ', 'Old')).toEqual({ action: 'error', message: 'A title is required' })
  })

  it('skips a title that is already the last one requested', () => {
    expect(titleSaveDecision('  Old ', 'Old')).toEqual({ action: 'skip' })
  })

  it('saves the trimmed title when it changed', () => {
    expect(titleSaveDecision('  New  ', 'Old')).toEqual({ action: 'save', title: 'New' })
  })
})

describe('shouldSaveSchedule', () => {
  const requested = { startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00' }

  it('saves a new valid pair', () => {
    expect(shouldSaveSchedule('2026-07-01T12:00', '2026-07-03T12:00', requested)).toBe(true)
  })

  it('does not save the pair that was already requested', () => {
    expect(shouldSaveSchedule(requested.startsAt, requested.endsAt, requested)).toBe(false)
  })

  it.each([
    ['a missing date', '', '2026-07-03T12:00'],
    ['an end before the start', '2026-07-05T12:00', '2026-07-03T12:00'],
    ['an implausible year', '0202-07-01T12:00', '2026-07-03T12:00'],
  ])('does not save %s', (_label, startsAt, endsAt) => {
    expect(shouldSaveSchedule(startsAt, endsAt, requested)).toBe(false)
  })
})

describe('settledTitle', () => {
  it('shows the tidied title when nothing else was typed since', () => {
    expect(settledTitle('  Summer ', 'Summer')).toBe('Summer')
  })

  it('never overwrites what was typed since the blur', () => {
    expect(settledTitle('Summer Sale', 'Summer')).toBe('Summer Sale')
  })
})

describe('saveBlocker', () => {
  const ready = { title: 'T', startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', scheduleProblem: null, editingKey: null, keptCount: 1 }

  it('is null when the form is complete', () => {
    expect(saveBlocker(ready)).toBeNull()
  })

  it.each([
    [{ title: '  ' }, 'Add a title to save.'],
    [{ startsAt: '' }, 'Set a start and an end time to save.'],
    [{ endsAt: '' }, 'Set a start and an end time to save.'],
    [{ scheduleProblem: 'End must be after start.' }, 'Fix the schedule to save.'],
    [{ editingKey: 'k' }, "Save or cancel the row you're editing."],
    [{ keptCount: 0 }, 'Add at least one product to save.'],
  ])('names the first thing missing: %o', (change, message) => {
    expect(saveBlocker({ ...ready, ...change })).toBe(message)
  })

  it('reports the most basic problem first', () => {
    expect(saveBlocker({ ...ready, title: '', keptCount: 0, editingKey: 'k' })).toBe('Add a title to save.')
  })
})

describe('hasUnsavedWork', () => {
  it('is false for an empty form and true once anything is entered', () => {
    expect(hasUnsavedWork({ title: '', startsAt: '', endsAt: '', rowCount: 0 })).toBe(false)
    expect(hasUnsavedWork({ title: 'x', startsAt: '', endsAt: '', rowCount: 0 })).toBe(true)
    expect(hasUnsavedWork({ title: '', startsAt: '2026-01-01T00:00', endsAt: '', rowCount: 0 })).toBe(true)
    expect(hasUnsavedWork({ title: '', startsAt: '', endsAt: '', rowCount: 1 })).toBe(true)
  })
})

describe('keptRows and itemsPayload', () => {
  it('keeps only rows that are not still being added', () => {
    expect(keptRows([row(1), unsaved(2)]).map((r) => r.title)).toEqual(['Product 1'])
  })

  it('sends product, rule and amount only, with a variant only when there is one', () => {
    const payload = itemsPayload([row(1), row(2, { variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'fixed', amount: 7.5 }), unsaved(3)])
    expect(JSON.parse(payload)).toEqual([
      { productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'fixed', amount: 7.5 },
    ])
  })
})

describe('isRedirectError', () => {
  it('recognises the error a server redirect arrives as', () => {
    expect(isRedirectError({ digest: 'NEXT_REDIRECT;replace;/time-discounts/x;307;' })).toBe(true)
  })

  it('does not mistake ordinary failures for a redirect', () => {
    expect(isRedirectError(new Error('boom'))).toBe(false)
    expect(isRedirectError(null)).toBe(false)
    expect(isRedirectError({ digest: 'OTHER' })).toBe(false)
  })
})
