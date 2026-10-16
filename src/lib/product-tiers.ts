import { shopifyQuery } from '@/lib/shopify-client'
import type { Discount } from '@/lib/config'

const NAMESPACE = 'sparkly_product_discounts'

export const SIBLING_PRODUCTS_KEY = 'sibling_products'
export const SIBLING_VARIANTS_KEY = 'sibling_variants'

/**
 * Liquid loops over a reference list return only the first 50 items, so a longer
 * list would silently lose rows. Each list is cut at this size; the `siblings`
 * IDs in the discount JSON stay complete, so the extra rows still count toward
 * the combined quantity, they are just not listed.
 */
export const SIBLING_REFERENCE_LIMIT = 50

interface DiscountMetafieldSibling {
  productId: string
  variantId?: string
}

interface DiscountMetafieldValue {
  discountId: string
  title: string
  pricingMode: 'percent' | 'fixed'
  tiers: Discount['tiers']
  /** null = single-variant whole-product member; array = these specific variants of THIS product are members. */
  ownVariantIds: string[] | null
  /** IDs only: the theme reads each sibling's title, link and image live through the reference lists. */
  siblings: DiscountMetafieldSibling[]
}

export interface ProductMetafields {
  value: DiscountMetafieldValue
  /** Whole-product siblings, in member order, cut at the limit. */
  productRefs: string[]
  /** Variant siblings, in member order, cut at the limit. */
  variantRefs: string[]
}

interface MetafieldSetInput {
  ownerId: string
  namespace: string
  key: string
  type: string
  value: string
}

interface MetafieldIdentifier {
  ownerId: string
  namespace: string
  key: string
}

/**
 * What one product's metafields should hold for this discount. siblings has one
 * entry per OTHER member (not per other product) so a sibling product with two
 * variants in the discount produces two entries. A product with more than one
 * of its own variants in the discount gets ownVariantIds listing exactly which;
 * a whole-product member gets ownVariantIds: null.
 *
 * `existingIds` are the product and variant IDs that still exist in the store.
 * Shopify refuses a reference to a deleted resource, and the write is atomic, so
 * one deleted member would block the whole save: such an ID stays in `siblings`
 * (still counted, shown as not listed) but is left out of the reference lists and
 * does not use up a slot of the limit. Omitted = every ID is taken to exist.
 */
export function buildProductMetafields(
  discount: Discount,
  productId: string,
  limit: number,
  existingIds?: ReadonlySet<string>,
): ProductMetafields {
  const exists = (id: string) => !existingIds || existingIds.has(id)
  const own = discount.members.filter((m) => m.productId === productId)
  const others = discount.members.filter((m) => m.productId !== productId)
  const ownVariantIds = own.some((m) => m.variantId == null) ? null : own.map((m) => m.variantId!)

  return {
    value: {
      discountId: discount.discountId,
      title: discount.title,
      pricingMode: discount.pricingMode,
      tiers: discount.tiers,
      ownVariantIds,
      siblings: others.map((m) => (m.variantId == null ? { productId: m.productId } : { productId: m.productId, variantId: m.variantId })),
    },
    productRefs: others.filter((m) => m.variantId == null).map((m) => m.productId).filter(exists).slice(0, limit),
    variantRefs: others.filter((m) => m.variantId != null).map((m) => m.variantId!).filter(exists).slice(0, limit),
  }
}

/** The metafields to set and to delete for one product. An empty list is deleted, never written. */
export function metafieldWrites(productId: string, built: ProductMetafields): { toSet: MetafieldSetInput[]; toDelete: MetafieldIdentifier[] } {
  const lists = [
    { key: SIBLING_PRODUCTS_KEY, type: 'list.product_reference', ids: built.productRefs },
    { key: SIBLING_VARIANTS_KEY, type: 'list.variant_reference', ids: built.variantRefs },
  ]
  return {
    toSet: [
      { ownerId: productId, namespace: NAMESPACE, key: 'discount', type: 'json', value: JSON.stringify(built.value) },
      ...lists
        .filter((l) => l.ids.length > 0)
        .map((l) => ({ ownerId: productId, namespace: NAMESPACE, key: l.key, type: l.type, value: JSON.stringify(l.ids) })),
    ],
    toDelete: lists.filter((l) => l.ids.length === 0).map((l) => ({ ownerId: productId, namespace: NAMESPACE, key: l.key })),
  }
}

/** `nodes(ids:)` accepts at most 250 IDs per call. */
const NODES_BATCH_SIZE = 250

/** The IDs, out of `ids`, that still exist in the store. A draft or unpublished product exists; a deleted one does not. */
export async function findExistingIds(ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  for (let start = 0; start < ids.length; start += NODES_BATCH_SIZE) {
    const data = await shopifyQuery<{ nodes: ({ id: string } | null)[] }>(
      `query existingSiblings($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id }
          ... on ProductVariant { id }
        }
      }`,
      { ids: ids.slice(start, start + NODES_BATCH_SIZE) },
    )
    for (const node of data.nodes) if (node) existing.add(node.id)
  }
  return existing
}

/**
 * Writes the `discount` metafield, and the two sibling reference lists, for every
 * unique product touched by this discount's members.
 */
export async function syncDiscountMetafields(discount: Discount): Promise<void> {
  const uniqueProductIds = [...new Set(discount.members.map((m) => m.productId))]
  // What a sibling reference points at: the variant for a variant member, else the product.
  const existingIds = await findExistingIds([...new Set(discount.members.map((m) => m.variantId ?? m.productId))])

  const results = await Promise.allSettled(
    uniqueProductIds.map((productId) => {
      const { toSet, toDelete } = metafieldWrites(productId, buildProductMetafields(discount, productId, SIBLING_REFERENCE_LIMIT, existingIds))
      return writeProductMetafields(toSet, toDelete)
    }),
  )

  throwIfRejected(results)
}

async function writeProductMetafields(toSet: MetafieldSetInput[], toDelete: MetafieldIdentifier[]): Promise<void> {
  // Set first: if the delete fails, the product still has fresh data.
  await setMetafields(toSet)
  if (toDelete.length > 0) await deleteMetafields(toDelete)
}

async function setMetafields(metafields: MetafieldSetInput[]): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { metafields },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

async function deleteMetafields(metafields: MetafieldIdentifier[]): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteDiscountMetafield($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { metafields },
  )

  if (data.metafieldsDelete.userErrors.length > 0) {
    throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
  }
}

function throwIfRejected(results: PromiseSettledResult<void>[]): void {
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => r.reason?.message ?? String(r.reason)).join('; '))
  }
}

/** Deletes the `discount` metafield and both sibling lists from every unique product in the list. */
export async function clearDiscountMetafields(members: { productId: string }[]): Promise<void> {
  const uniqueProductIds = [...new Set(members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map((productId) =>
      deleteMetafields(
        ['discount', SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY].map((key) => ({ ownerId: productId, namespace: NAMESPACE, key })),
      ),
    ),
  )

  throwIfRejected(results)
}
