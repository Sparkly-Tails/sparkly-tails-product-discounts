import { shopifyQuery } from '@/lib/shopify-client'
import type { Tier } from '@/lib/config'

const NAMESPACE = 'sparkly_product_discounts'

export async function syncProductTierMetafield(productId: string, tiers: Tier[] | null): Promise<void> {
  if (tiers === null) {
    const data = await shopifyQuery<{
      metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
    }>(
      `mutation deleteProductTiers($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          { ownerId: productId, namespace: NAMESPACE, key: 'tiers' },
        ],
      },
    )

    if (data.metafieldsDelete.userErrors.length > 0) {
      throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
    }
    return
  }

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setProductTiers($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'tiers',
          type: 'json',
          value: JSON.stringify({ tiers }),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

export interface GroupTierSyncData {
  tiers: Tier[]
  siblings: { title: string; handle: string }[]
}

/**
 * Same shape as syncProductTierMetafield but under the 'group' key, so a
 * product can carry both an unrelated standalone-tiers metafield (never, in
 * practice, since membership is mutually exclusive) without collision, and
 * so the theme block can tell which mode to render from a single metafield
 * lookup per key.
 */
export async function syncGroupTierMetafield(productId: string, data: GroupTierSyncData | null): Promise<void> {
  if (data === null) {
    const result = await shopifyQuery<{
      metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
    }>(
      `mutation deleteProductGroupTiers($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          { ownerId: productId, namespace: NAMESPACE, key: 'group' },
        ],
      },
    )

    if (result.metafieldsDelete.userErrors.length > 0) {
      throw new Error(result.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
    }
    return
  }

  const result = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setProductGroupTiers($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'group',
          type: 'json',
          value: JSON.stringify(data),
        },
      ],
    },
  )

  if (result.metafieldsSet.userErrors.length > 0) {
    throw new Error(result.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}
