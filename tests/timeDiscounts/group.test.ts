import { describe, it, expect } from 'vitest'
import {
  expandGroup, summariseFailures, groupSizeMessage, coveredRows, cleanRule, cleanSelection, parseGroupSpec, parseRuleInput,
  ruleSaveDelay, isSelectionEmpty, selectionCount, memberKeys, addMember, removeMember, switchMode, previewKey, groupSaveBlocker,
  EMPTY_SELECTION_MESSAGE, type GroupFormState,
} from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const BASE = 'https://shop.myshopify.com/admin/products/'
const percent20 = { pricingMode: 'percent' as const, amount: 20 }

describe('expandGroup', () => {
  it('gives every member the shared rule, keeping a variant only when there is one', () => {
    expect(expandGroup(percent20, [{ productId: P1 }, { productId: P2, variantId: V10 }])).toEqual([
      { productId: P1, pricingMode: 'percent', amount: 20 },
      { productId: P2, variantId: V10, pricingMode: 'percent', amount: 20 },
    ])
  })

  it('lists a product once even when it is picked twice (for example in two collections)', () => {
    expect(expandGroup(percent20, [{ productId: P1 }, { productId: P1 }])).toHaveLength(1)
  })

  it('does not change the members it is given', () => {
    const members = [{ productId: P1 }]
    expandGroup(percent20, members)
    expect(members).toEqual([{ productId: P1 }])
  })
})

describe('summariseFailures', () => {
  it('is null when nothing failed', () => expect(summariseFailures([])).toBeNull())
  it('names the first product that failed', () => {
    expect(summariseFailures([{ title: 'Cat Toy', message: 'Too cheap' }])).toBe('Cat Toy: Too cheap')
  })
  it('says how many others also have a problem', () => {
    expect(summariseFailures([{ title: 'A', message: 'm' }, { title: 'B', message: 'n' }])).toBe('A: m (and 1 more product with a problem)')
    expect(summariseFailures([{ title: 'A', message: 'm' }, { title: 'B', message: 'n' }, { title: 'C', message: 'o' }])).toBe('A: m (and 2 more products with a problem)')
  })
})

describe('groupSizeMessage', () => {
  it('states the count and the limits', () => {
    expect(groupSizeMessage(120, false)).toBe('This selection covers 120 products. One discount fits about 63 variants or 107 whole products. Pick fewer, or split it into two discounts.')
  })
  it('says "more than 200" when resolution stopped early', () => {
    expect(groupSizeMessage(201, true)).toContain('covers more than 200 products')
  })
})

describe('coveredRows', () => {
  it('shows each row with its discounted and regular price and a link to its admin page', () => {
    const items = expandGroup({ pricingMode: 'fixed', amount: 7.5 }, [{ productId: P1 }, { productId: P2, variantId: V10 }])
    const prices = new Map([[`${P1}|`, { title: 'Cat Toy', price: 10 }], [`${P2}|${V10}`, { title: 'Bed – Grey', price: 40 }]])
    expect(coveredRows(items, prices, BASE)).toEqual([
      { productId: P1, title: 'Cat Toy', adminUrl: `${BASE}1`, regularPrice: 10, discountedPrice: 7.5 },
      { productId: P2, variantId: V10, title: 'Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 40, discountedPrice: 7.5 },
    ])
  })

  it('leaves out a row whose price is unknown', () => {
    expect(coveredRows(expandGroup(percent20, [{ productId: P1 }]), new Map(), BASE)).toEqual([])
  })
})

describe('cleanRule', () => {
  it('rounds the amount to pence and defaults an unknown mode to percent', () => {
    expect(cleanRule({ pricingMode: 'fixed', amount: 7.499 })).toEqual({ pricingMode: 'fixed', amount: 7.5 })
    expect(cleanRule({ pricingMode: 'weird', amount: '12' })).toEqual({ pricingMode: 'percent', amount: 12 })
  })
  it.each([[null], ['x'], [{ amount: 'abc' }], [{}]])('rejects %j', (raw) => {
    expect(() => cleanRule(raw)).toThrow('could not be read')
  })
})

describe('cleanSelection', () => {
  it('accepts products and collections picks', () => {
    expect(cleanSelection({ mode: 'products', members: [{ productId: P1, title: 'Toy' }, { productId: P2, variantId: V10, title: 'Bed' }] }))
      .toEqual({ mode: 'products', members: [{ productId: P1, title: 'Toy' }, { productId: P2, variantId: V10, title: 'Bed' }] })
    expect(cleanSelection({ mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }))
      .toEqual({ mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] })
  })
  it.each([
    [null], [{ mode: 'other' }], [{ mode: 'products', members: 'x' }], [{ mode: 'products', members: [{ title: 'no id' }] }],
    [{ mode: 'collections', collections: [{ id: '', title: 't' }] }],
  ])('rejects %j', (raw) => {
    expect(() => cleanSelection(raw)).toThrow('could not be read')
  })
})

describe('parseGroupSpec', () => {
  it('reads a whole group from JSON', () => {
    const json = JSON.stringify({ pricingMode: 'percent', amount: 15, selection: { mode: 'products', members: [{ productId: P1, title: 'Toy' }] } })
    expect(parseGroupSpec(json)).toEqual({ pricingMode: 'percent', amount: 15, selection: { mode: 'products', members: [{ productId: P1, title: 'Toy' }] } })
  })
  it('rejects text that is not a group', () => {
    expect(() => parseGroupSpec('not json')).toThrow('could not be read')
    expect(() => parseGroupSpec('{}')).toThrow('could not be read')
  })
})

describe('parseRuleInput', () => {
  it('has no rule and no problem while the amount is empty', () => {
    expect(parseRuleInput('percent', '  ')).toEqual({ rule: null, problem: null })
  })
  it('returns the rule, rounded, when it is valid', () => {
    expect(parseRuleInput('fixed', '7.499')).toEqual({ rule: { pricingMode: 'fixed', amount: 7.5 }, problem: null })
  })
  it('returns the problem and no rule when it is not valid', () => {
    expect(parseRuleInput('percent', '0')).toEqual({ rule: null, problem: 'Enter an amount greater than zero' })
    expect(parseRuleInput('percent', '150')).toEqual({ rule: null, problem: 'A percentage discount cannot exceed 100%' })
    expect(parseRuleInput('fixed', 'abc').rule).toBeNull()
  })
})

describe('ruleSaveDelay', () => {
  it('saves at once when the type changed, and after a pause while the amount changes', () => {
    expect(ruleSaveDelay({ pricingMode: 'percent', amount: 10 }, 'fixed')).toBe(0)
    expect(ruleSaveDelay({ pricingMode: 'percent', amount: 10 }, 'percent')).toBe(600)
    expect(ruleSaveDelay(null, 'percent')).toBe(600)
  })
})

describe('selection edits', () => {
  const products: GroupSelection = { mode: 'products', members: [{ productId: P1, title: 'Toy' }] }
  const collections: GroupSelection = { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }

  it('counts and lists what is picked', () => {
    expect(selectionCount(products)).toBe(1)
    expect(isSelectionEmpty(products)).toBe(false)
    expect(isSelectionEmpty({ mode: 'collections', collections: [] })).toBe(true)
    expect(memberKeys(products)).toEqual([`${P1}|`])
    expect(memberKeys(collections)).toEqual([])
  })

  it('adds a picked product or variant with its title, in products mode only', () => {
    expect(addMember(products, { productId: P2, variantId: V10, title: 'Bed – Grey', price: 40 })).toEqual({
      mode: 'products', members: [{ productId: P1, title: 'Toy' }, { productId: P2, variantId: V10, title: 'Bed – Grey' }],
    })
    expect(addMember(collections, { productId: P2, title: 'x', price: 1 })).toBe(collections)
  })

  it('removes a pick by its row key', () => {
    expect(removeMember(products, `${P1}|`)).toEqual({ mode: 'products', members: [] })
    expect(removeMember(products, `${P2}|`)).toBe(products)
  })

  it('switching mode starts an empty selection of the other mode, and keeps the same mode as it is', () => {
    expect(switchMode(products, 'collections')).toEqual({ mode: 'collections', collections: [] })
    expect(switchMode(collections, 'products')).toEqual({ mode: 'products', members: [] })
    expect(switchMode(products, 'products')).toBe(products)
  })
})

describe('previewKey', () => {
  it('changes when the rule or the picks change, and not otherwise', () => {
    const sel: GroupSelection = { mode: 'products', members: [{ productId: P1, title: 'Toy' }] }
    expect(previewKey(percent20, sel)).toBe(previewKey({ ...percent20 }, { ...sel }))
    expect(previewKey(percent20, sel)).not.toBe(previewKey({ pricingMode: 'percent', amount: 21 }, sel))
    expect(previewKey(percent20, sel)).not.toBe(previewKey(percent20, { mode: 'products', members: [] }))
  })
})

describe('groupSaveBlocker', () => {
  const ready: GroupFormState = {
    title: 'T', startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', scheduleProblem: null,
    amountText: '20', ruleProblem: null, selectionEmpty: false, preview: { status: 'ok' },
  }
  it('is null when the form is complete and the preview is ok', () => expect(groupSaveBlocker(ready)).toBeNull())
  it.each([
    [{ title: ' ' }, 'Add a title to save.'],
    [{ startsAt: '' }, 'Set a start and an end time to save.'],
    [{ scheduleProblem: 'End must be after start.' }, 'Fix the schedule to save.'],
    [{ amountText: '' }, 'Enter the shared price to save.'],
    [{ ruleProblem: 'Enter an amount greater than zero' }, 'Fix the shared price to save.'],
    [{ selectionEmpty: true }, 'Pick at least one product, variant or collection to save.'],
    [{ preview: { status: 'idle' as const } }, 'Checking the products…'],
    [{ preview: { status: 'loading' as const } }, 'Checking the products…'],
    [{ preview: { status: 'error' as const } }, 'Fix the problem shown above to save.'],
  ])('names the first thing missing: %o', (change, message) => {
    expect(groupSaveBlocker({ ...ready, ...change })).toBe(message)
  })
  it('reports the most basic problem first', () => {
    expect(groupSaveBlocker({ ...ready, title: '', selectionEmpty: true, preview: { status: 'error' } })).toBe('Add a title to save.')
  })
})

describe('messages', () => {
  it('has the empty-selection text the server and the form share', () => expect(EMPTY_SELECTION_MESSAGE).toBe('This selection covers no products.'))
})
