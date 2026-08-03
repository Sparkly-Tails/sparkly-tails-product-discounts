import { shopifyQuery } from '@/lib/shopify-client'

export interface Tier {
  minQty: number
  percentOff?: number
  /**
   * Optional exact total price to charge for minQty units (e.g. £10.00 for
   * 7 tins instead of the percentage's rounded £10.01). Units beyond minQty
   * still accrue at the normal percentOff per-unit rate — only the price at
   * exactly minQty is anchored. percent mode only.
   */
  anchorPrice?: number
  /**
   * Absolute price per unit for a fixed-price tier (e.g. £1.50) — every
   * unit in the reached tier is charged this price directly, no percentage
   * involved. fixed mode only. Mutually exclusive with percentOff/
   * anchorPrice, enforced by the admin actions that construct a Tier, not
   * by this type.
   */
  fixedPrice?: number
}

export interface ProductDiscount {
  productId: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  tiers: Tier[]
}

export interface GroupDiscount {
  groupId: string
  name: string
  status: 'draft' | 'live'
  productIds: string[]
  pricingMode: 'percent' | 'fixed'
  tiers: Tier[]
}

export interface Config {
  products: ProductDiscount[]
  groups: GroupDiscount[]
}

const NAMESPACE = 'sparkly_product_discounts'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(
    `query { shop { id } }`,
  )
  return data.shop.id
}

export async function getConfig(): Promise<Config> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) {
    return { products: [], groups: [] }
  }

  const parsed = JSON.parse(data.shop.metafield.value) as {
    products?: Partial<ProductDiscount>[]
    groups?: Partial<GroupDiscount>[]
  }
  const products = (parsed.products ?? []).map((p) => ({ pricingMode: 'percent' as const, ...p })) as ProductDiscount[]
  const groups = (parsed.groups ?? []).map((g) => ({ pricingMode: 'percent' as const, ...g })) as GroupDiscount[]
  return { products, groups }
}

export async function saveConfig(config: Config): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: 'config',
          type: 'json',
          value: JSON.stringify(config),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}

/**
 * True when productId isn't already claimed by a standalone discount or by
 * any group other than excludeGroupId — pass the group's own id when
 * validating an in-progress edit so it doesn't flag its own members.
 */
export function isProductAvailable(config: Config, productId: string, excludeGroupId?: string): boolean {
  if (config.products.some((p) => p.productId === productId)) return false
  return !config.groups.some((g) => g.groupId !== excludeGroupId && g.productIds.includes(productId))
}
