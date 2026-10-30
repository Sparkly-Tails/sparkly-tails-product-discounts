import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

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

export function isMemberSelected({ members, productId, variantId }: { members: SelectedMember[]; productId: string; variantId: string | undefined }): boolean {
  const keys = members.map((member) => `${member.productId}|${member.variantId ?? ''}`)
  return keys.includes(`${productId}|${variantId ?? ''}`)
}

/** The members with this one at the end, unless the same product and variant is already there. */
export function addMemberOnce({ members, member }: { members: SelectedMember[]; member: SelectedMember }): SelectedMember[] {
  const keys = members.map((chosen) => `${chosen.productId}|${chosen.variantId ?? ''}`)
  return keys.includes(`${member.productId}|${member.variantId ?? ''}`) ? members : [...members, member]
}

export function countMembersOfProduct({ members, productId }: { members: SelectedMember[]; productId: string }): number {
  let count = 0
  for (const member of members) if (member.productId === productId) count += 1
  return count
}

/** True when nothing of the product is left to choose (a product always has at least one variant). */
export function isProductFullySelected({ variantCount, selectedCount }: { variantCount: number; selectedCount: number }): boolean {
  return selectedCount >= Math.max(variantCount, 1)
}

interface UnselectedProductTools {
  countMembersOfProduct: typeof countMembersOfProduct
  isProductFullySelected: typeof isProductFullySelected
}

/** The search results the person can still add something from. */
export function keepUnselectedProducts({ results, members, tools }: {
  results: ProductSearchResult[]
  members: SelectedMember[]
  tools: UnselectedProductTools
}): ProductSearchResult[] {
  const kept: ProductSearchResult[] = []
  for (const result of results) {
    const selectedCount = tools.countMembersOfProduct({ members, productId: result.id })
    if (!tools.isProductFullySelected({ variantCount: result.variantCount, selectedCount })) kept.push(result)
  }
  return kept
}

/** The variants of one product the person has not chosen yet. */
export function keepUnselectedVariants({ options, members, productId, tools }: {
  options: ProductVariantOption[]
  members: SelectedMember[]
  productId: string
  tools: { isMemberSelected: typeof isMemberSelected }
}): ProductVariantOption[] {
  const kept: ProductVariantOption[] = []
  for (const option of options) if (!tools.isMemberSelected({ members, productId, variantId: option.variantId })) kept.push(option)
  return kept
}
