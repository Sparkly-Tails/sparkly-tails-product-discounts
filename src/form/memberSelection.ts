// What the products card knows about the chosen products: one entry per
// (product, variant) the discount applies to, and the text that sums a product up.

export interface SelectedMember {
  productId: string
  variantId?: string
  productTitle: string
  /** Absent for a whole product that has a single variant. */
  variantTitle?: string
  price: number
  imageUrl: string | null
}

/** The chosen variants of one product, shown as one row. */
export interface ProductGroup {
  productId: string
  productTitle: string
  imageUrl: string | null
  variantTitles: string[]
  prices: number[]
}

/** One group per product, in the order the products were added. */
export function groupMembersByProduct({ members }: { members: SelectedMember[] }): ProductGroup[] {
  const byProduct = Object.groupBy(members, (member) => member.productId)
  return Object.values(byProduct).map((items = []) => ({
    productId: items[0].productId,
    productTitle: items[0].productTitle,
    imageUrl: items[0].imageUrl,
    variantTitles: items.map((item) => item.variantTitle ?? '').filter(Boolean),
    prices: items.map((item) => item.price),
  }))
}

export function describeProductCount({ productCount }: { productCount: number }): string {
  return `${productCount} ${productCount === 1 ? 'product' : 'products'} selected`
}

/** "2 variants selected • 90 Chews, 180 Chews • $32.00–$58.00 USD" */
export function describeGroup({ group, currencyCode, formatPrice }: {
  group: ProductGroup
  currencyCode: string
  formatPrice: (amount: number) => string
}): string {
  const variantCount = group.prices.length
  const lowest = Math.min(...group.prices)
  const highest = Math.max(...group.prices)
  const prices = lowest === highest ? formatPrice(lowest) : `${formatPrice(lowest)}–${formatPrice(highest)}`
  const parts = [`${variantCount} ${variantCount === 1 ? 'variant' : 'variants'} selected`, group.variantTitles.join(', '), `${prices} ${currencyCode}`]
  return parts.filter(Boolean).join(' • ')
}

export function removeProductMembers({ members, productId }: { members: SelectedMember[]; productId: string }): SelectedMember[] {
  const kept: SelectedMember[] = []
  for (const member of members) if (member.productId !== productId) kept.push(member)
  return kept
}
