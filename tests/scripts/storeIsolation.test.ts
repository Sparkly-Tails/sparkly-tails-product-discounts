import { describe, it, expect } from 'vitest'
import { compareStoreSnapshots, type StoreSnapshot } from '../../scripts/storeIsolation'

const A = 'a.myshopify.com'
const B = 'b.myshopify.com'

/** Store A holds the marker written for it; store B does not. One tier discount each, with their own ids. */
const snapshotA = (over: Partial<StoreSnapshot> = {}): StoreSnapshot => ({
  shop: A, marker: 'marker-123', discountIds: ['gid://shopify/DiscountAutomaticNode/1', 'gid://shopify/DiscountAutomaticNode/2'], tierDiscountCount: 1, ...over,
})
const snapshotB = (over: Partial<StoreSnapshot> = {}): StoreSnapshot => ({
  shop: B, marker: null, discountIds: ['gid://shopify/DiscountAutomaticNode/9'], tierDiscountCount: 1, ...over,
})

describe('compareStoreSnapshots', () => {
  it('reports no violations for two disjoint stores with one tier discount each', () => {
    expect(compareStoreSnapshots(snapshotA(), snapshotB())).toEqual([])
  })

  it('reports a violation when store B can read a config written for store A', () => {
    const violations = compareStoreSnapshots(snapshotA(), snapshotB({ marker: 'marker-123' }))

    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(B)
    expect(violations[0]).toContain('written for')
  })

  it('reports a violation when store B reads any value that was only written for A', () => {
    expect(compareStoreSnapshots(snapshotA(), snapshotB({ marker: 'something-else' }))).toHaveLength(1)
  })

  it('reports a violation when the marker written on A cannot be read back on A', () => {
    const violations = compareStoreSnapshots(snapshotA({ marker: null }), snapshotB())

    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(A)
  })

  it('reports a violation when a store has two tier discounts', () => {
    const violations = compareStoreSnapshots(snapshotA({ tierDiscountCount: 2 }), snapshotB())

    expect(violations).toEqual([expect.stringContaining(A)])
    expect(violations[0]).toContain('2')
  })

  it('reports a violation when a store has no tier discount', () => {
    expect(compareStoreSnapshots(snapshotA(), snapshotB({ tierDiscountCount: 0 }))).toEqual([expect.stringContaining(B)])
  })

  it('reports every discount id that both stores list', () => {
    const shared = 'gid://shopify/DiscountAutomaticNode/2'
    const violations = compareStoreSnapshots(snapshotA(), snapshotB({ discountIds: [shared, 'gid://shopify/DiscountAutomaticNode/9'] }))

    expect(violations).toEqual([expect.stringContaining(shared)])
  })

  it('reports each problem separately', () => {
    const violations = compareStoreSnapshots(
      snapshotA({ tierDiscountCount: 2 }),
      snapshotB({ marker: 'marker-123', tierDiscountCount: 0, discountIds: ['gid://shopify/DiscountAutomaticNode/1'] }),
    )

    expect(violations).toHaveLength(4)
  })
})
