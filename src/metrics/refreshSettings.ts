// Keeps the copy of "which product is in which live discount" that the visit counter reads. It is rewritten whenever the
// discounts are saved, so a storefront view never has to ask Shopify.

export interface LiveCandidate {
  discountId: string
  status: string
  members: { productId: string }[]
}

type LiveProducts = Record<string, string>
type SaveLiveProducts = (args: { shop: string; liveProducts: LiveProducts }) => Promise<void>

function isLiveDiscount(discount: LiveCandidate): boolean {
  return discount.status === 'live'
}

function addDiscountProducts(liveProducts: LiveProducts, discount: LiveCandidate): LiveProducts {
  for (const member of discount.members) liveProducts[member.productId] = discount.discountId
  return liveProducts
}

/** Product id to the id of the live discount it belongs to. */
export function mapLiveProducts({ discounts }: { discounts: LiveCandidate[] }): LiveProducts {
  return discounts.filter(isLiveDiscount).reduce<LiveProducts>(addDiscountProducts, {})
}

export async function refreshLiveProducts({ shop, discounts, saveLiveProducts, tools }: { shop: string; discounts: LiveCandidate[]; saveLiveProducts: SaveLiveProducts; tools: { mapLiveProducts: typeof mapLiveProducts } }): Promise<void> {
  await saveLiveProducts({ shop, liveProducts: tools.mapLiveProducts({ discounts }) })
}

/** The pieces the refresh calls, gathered once so each can be swapped in a test. */
export const REFRESH_TOOLS = { mapLiveProducts, refreshLiveProducts }

/** Never throws: the merchant's discount is saved already, and a stale copy is fixed by the next save or homepage load. */
export async function refreshLiveProductsSafely({ discounts, getShop, saveLiveProducts, report, tools }: { discounts: LiveCandidate[]; getShop: () => Promise<string>; saveLiveProducts: SaveLiveProducts; report: (message: string) => void; tools: typeof REFRESH_TOOLS }): Promise<void> {
  try {
    await tools.refreshLiveProducts({ shop: await getShop(), discounts, saveLiveProducts, tools })
  } catch (error) {
    report(`Could not refresh the products in live discounts: ${(error as Error).message}`)
  }
}
