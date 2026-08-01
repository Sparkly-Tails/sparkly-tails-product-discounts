import { shopifyQuery } from '@/lib/shopify-client'

export interface Tier {
  minQty: number
  percentOff: number
  /**
   * Optional exact total price to charge for minQty units (e.g. £10.00 for
   * 7 tins instead of the percentage's rounded £10.01). Units beyond minQty
   * still accrue at the normal percentOff per-unit rate — only the price at
   * exactly minQty is anchored. Omitted entirely when not set, in which case
   * this tier behaves exactly as a plain percentage-off tier always has.
   */
  anchorPrice?: number
}

export interface ProductDiscount {
  productId: string
  status: 'draft' | 'live'
  tiers: Tier[]
}

export interface GroupDiscount {
  groupId: string
  name: string
  status: 'draft' | 'live'
  productIds: string[]
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

  const parsed = JSON.parse(data.shop.metafield.value) as Partial<Config>
  return { products: parsed.products ?? [], groups: parsed.groups ?? [] }
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
