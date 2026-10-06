import { itemKey } from '@/timeDiscounts/items'
import type { PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

// Pure helpers for the product picker: `existingKeys` (the itemKey of every row already in the discount) is always passed in.

export function alreadyAdded(existingKeys: string[], productId: string, variantId?: string): boolean {
  return existingKeys.includes(itemKey({ productId, variantId }))
}

export function rowsForProduct(existingKeys: string[], productId: string): number {
  return existingKeys.filter((key) => key.startsWith(`${productId}|`)).length
}

/** Search results worth showing: a single-variant product not yet added, or a multi-variant product with variants left. */
export function visibleResults(matches: ProductSearchResult[], existingKeys: string[]): ProductSearchResult[] {
  return matches.filter((match) =>
    match.variantCount <= 1 ? !alreadyAdded(existingKeys, match.id) : rowsForProduct(existingKeys, match.id) < match.variantCount,
  )
}

/** The variants of a product that are not yet in the discount. */
export function availableVariants(options: ProductVariantOption[], existingKeys: string[], productId: string): ProductVariantOption[] {
  return options.filter((option) => !alreadyAdded(existingKeys, productId, option.variantId))
}

export function pickedProduct(product: ProductSearchResult, price: number): PickedItem {
  return { productId: product.id, title: product.title, price }
}

export function pickedVariant(product: ProductSearchResult, option: ProductVariantOption): PickedItem {
  return { productId: product.id, variantId: option.variantId, title: `${product.title} – ${option.title}`, price: option.price }
}
