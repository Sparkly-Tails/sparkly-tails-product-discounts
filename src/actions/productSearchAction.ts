'use server'

import { searchProducts, type ProductSearchResult } from '@/lib/products'

/**
 * Backs the product picker's search box. Swallows errors and returns no
 * results rather than throwing — this fires on every debounced keystroke.
 */
export async function searchProductsAction(query: string): Promise<ProductSearchResult[]> {
  try {
    return await searchProducts(query)
  } catch (err) {
    console.error('[searchProductsAction] search failed:', err)
    return []
  }
}
