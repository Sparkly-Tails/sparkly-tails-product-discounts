'use server'

import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig, pricesUniform,
  type TimeDiscount, type TimeDiscountSelection, type DiscountMember, type TimeDiscountsConfig,
} from '@/timeDiscounts/config'
import { getConfig } from '@/lib/config'
import { isAvailableEverywhere } from '@/lib/discountAvailability'
import { resolveCollectionMembers } from '@/lib/collections'
import { getMemberInfo } from '@/lib/products'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { shopifyQuery } from '@/lib/shopify-client'
import { redirectWithToken } from '@/lib/auth-redirect'

const METAFIELD_NAMESPACE = 'sparkly_time_discounts'
/** Must match the `handle` in extensions/time-based-discount/shopify.extension.toml (Task 13). */
const FUNCTION_HANDLE = 'time-based-discount'

interface FunctionConfigMetafield {
  namespace: string
  key: string
  type: string
  value: string
}

/** The Function's own per-discount config — see spec §5. Written atomically as part of the DiscountAutomaticAppInput on create/update, not via a separate metafieldsSet call. */
function buildFunctionConfigMetafield(resolvedMembers: DiscountMember[], pricingMode: 'percent' | 'fixed', amount: number): FunctionConfigMetafield {
  return {
    namespace: METAFIELD_NAMESPACE,
    key: 'function_config',
    type: 'json',
    value: JSON.stringify({ resolvedMembers, pricingMode, amount }),
  }
}

async function createShopifyDiscountRecord(input: {
  title: string
  startsAtUtc: string
  endsAtUtc: string
  resolvedMembers: DiscountMember[]
  pricingMode: 'percent' | 'fixed'
  amount: number
}): Promise<string> {
  const data = await shopifyQuery<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation createTimeDiscountRecord($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      automaticAppDiscount: {
        title: input.title,
        functionHandle: FUNCTION_HANDLE,
        discountClasses: ['PRODUCT'],
        startsAt: input.startsAtUtc,
        endsAt: input.endsAtUtc,
        metafields: [buildFunctionConfigMetafield(input.resolvedMembers, input.pricingMode, input.amount)],
      },
    },
  )

  if (data.discountAutomaticAppCreate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppCreate.userErrors.map((e) => e.message).join('; '))
  }
  if (!data.discountAutomaticAppCreate.automaticAppDiscount) {
    throw new Error('Shopify did not return the created discount')
  }
  return data.discountAutomaticAppCreate.automaticAppDiscount.discountId
}

interface ShopifyDiscountRecordUpdate {
  title?: string
  startsAtUtc?: string
  endsAtUtc?: string
  resolvedMembers?: DiscountMember[]
  pricingMode?: 'percent' | 'fixed'
  amount?: number
}

/** Partial update — only the fields present in `update` are sent, matching Shopify's own documented partial-update behavior for this mutation. */
async function updateShopifyDiscountRecord(shopifyDiscountId: string, update: ShopifyDiscountRecordUpdate): Promise<void> {
  const automaticAppDiscount: Record<string, unknown> = {}
  if (update.title !== undefined) automaticAppDiscount.title = update.title
  if (update.startsAtUtc !== undefined) automaticAppDiscount.startsAt = update.startsAtUtc
  if (update.endsAtUtc !== undefined) automaticAppDiscount.endsAt = update.endsAtUtc
  if (update.resolvedMembers !== undefined && update.pricingMode !== undefined && update.amount !== undefined) {
    automaticAppDiscount.metafields = [buildFunctionConfigMetafield(update.resolvedMembers, update.pricingMode, update.amount)]
  }

  const data = await shopifyQuery<{
    discountAutomaticAppUpdate: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation updateTimeDiscountRecord($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId, automaticAppDiscount },
  )

  if (data.discountAutomaticAppUpdate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppUpdate.userErrors.map((e) => e.message).join('; '))
  }
}

/** Uses the generic discountAutomaticDelete mutation — there is no discount-type-specific delete mutation. */
async function deleteShopifyDiscountRecord(shopifyDiscountId: string): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteTimeDiscountRecord($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId },
  )

  if (data.discountAutomaticDelete.userErrors.length > 0) {
    throw new Error(data.discountAutomaticDelete.userErrors.map((e) => e.message).join('; '))
  }
}

function parseMembersFromForm(formData: FormData): DiscountMember[] {
  const members: DiscountMember[] = []
  let i = 0
  while (formData.has(`member-${i}-productId`)) {
    const productId = String(formData.get(`member-${i}-productId`) ?? '').trim()
    const rawVariantId = String(formData.get(`member-${i}-variantId`) ?? '').trim()
    if (productId) members.push(rawVariantId ? { productId, variantId: rawVariantId } : { productId })
    i++
  }
  return members
}

function parseCollectionIdsFromForm(formData: FormData): string[] {
  return formData.getAll('collectionId').map((v) => String(v).trim()).filter(Boolean)
}

async function resolveSelection(formData: FormData): Promise<{ selection: TimeDiscountSelection; resolvedMembers: DiscountMember[] }> {
  const mode: 'products' | 'collections' = formData.get('selectionMode') === 'collections' ? 'collections' : 'products'

  if (mode === 'products') {
    const members = parseMembersFromForm(formData)
    if (members.length === 0) throw new Error('At least one product or variant is required')
    return { selection: { mode: 'products', members }, resolvedMembers: members }
  }

  const collectionIds = parseCollectionIdsFromForm(formData)
  if (collectionIds.length === 0) throw new Error('At least one collection is required')
  const resolvedMembers = await resolveCollectionMembers(collectionIds)
  return { selection: { mode: 'collections', collectionIds }, resolvedMembers }
}

async function assertMembersAvailable(members: DiscountMember[], excludeDiscountId?: string): Promise<void> {
  const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
  for (const member of members) {
    if (!isAvailableEverywhere(productConfig, timeConfig, member.productId, member.variantId, excludeDiscountId)) {
      throw new Error(`${member.productId}${member.variantId ? ` (variant ${member.variantId})` : ''} already belongs to another discount`)
    }
  }
}

/**
 * Throws if a fixed-price discount's members don't share one base price —
 * mirroring the existing tiered-discount system's own gate (see this
 * plan's Global Constraints for why pricesUniform is redefined locally
 * rather than imported).
 */
async function assertPricingAllowed(resolvedMembers: DiscountMember[], pricingMode: 'percent' | 'fixed'): Promise<void> {
  if (pricingMode !== 'fixed') return
  const info = await getMemberInfo(resolvedMembers)
  if (!pricesUniform(info.map((m) => m.price))) {
    throw new Error('These products/variants have different prices — a fixed price requires a shared price. Use a percentage instead, or narrow the selection.')
  }
}

function findDiscountOrThrow(config: TimeDiscountsConfig, discountId: string): TimeDiscount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Time discount ${discountId} not found`)
  return discount
}

function parseSchedule(formData: FormData): { startsAt: string; endsAt: string } {
  const startsAt = String(formData.get('startsAt') ?? '').trim()
  const endsAt = String(formData.get('endsAt') ?? '').trim()
  if (!startsAt || !endsAt) throw new Error('Start and end date/time are required')
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('End must be after start')
  return { startsAt, endsAt }
}

function parsePricing(formData: FormData): { pricingMode: 'percent' | 'fixed'; amount: number } {
  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const amount = Number(formData.get('amount'))
  if (!(amount > 0)) throw new Error('A discount amount greater than zero is required')
  return { pricingMode, amount }
}

export async function createTimeDiscount(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('A name is required')

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const { startsAt, endsAt } = parseSchedule(formData)
  const { pricingMode, amount } = parsePricing(formData)

  const { selection, resolvedMembers } = await resolveSelection(formData)
  await assertMembersAvailable(resolvedMembers)
  await assertPricingAllowed(resolvedMembers, pricingMode)

  const timezone = await getShopTimezone()
  const shopifyDiscountId = await createShopifyDiscountRecord({
    title,
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    resolvedMembers,
    pricingMode,
    amount,
  })

  const config = await getTimeDiscountsConfig()
  const discountId = `time_disc_${crypto.randomUUID()}`
  const newDiscount: TimeDiscount = {
    discountId, shopifyDiscountId, name, title, pricingMode, amount, startsAt, endsAt, selection, resolvedMembers,
  }
  await saveTimeDiscountsConfig({ discounts: [...config.discounts, newDiscount] })
  await syncTimeDiscountMetafields(newDiscount, timezone)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function updateTimeDiscountSelection(discountId: string, formData: FormData): Promise<void> {
  const { selection, resolvedMembers } = await resolveSelection(formData)
  await assertMembersAvailable(resolvedMembers, discountId)

  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(resolvedMembers, discount.pricingMode)

  const timezone = await getShopTimezone()

  const previousProductIds = new Set(discount.resolvedMembers.map((m) => m.productId))
  const nextProductIds = new Set(resolvedMembers.map((m) => m.productId))
  const removed = [...previousProductIds].filter((id) => !nextProductIds.has(id))

  discount.selection = selection
  discount.resolvedMembers = resolvedMembers
  await saveTimeDiscountsConfig(config)

  await updateShopifyDiscountRecord(discount.shopifyDiscountId, {
    resolvedMembers, pricingMode: discount.pricingMode, amount: discount.amount,
  })
  if (removed.length > 0) await clearTimeDiscountMetafields(removed.map((productId) => ({ productId })))
  await syncTimeDiscountMetafields(discount, timezone)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function updateTimeDiscountSchedule(discountId: string, formData: FormData): Promise<void> {
  const { startsAt, endsAt } = parseSchedule(formData)
  const { pricingMode, amount } = parsePricing(formData)

  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(discount.resolvedMembers, pricingMode)

  const timezone = await getShopTimezone()

  discount.startsAt = startsAt
  discount.endsAt = endsAt
  discount.pricingMode = pricingMode
  discount.amount = amount
  await saveTimeDiscountsConfig(config)

  await updateShopifyDiscountRecord(discount.shopifyDiscountId, {
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    resolvedMembers: discount.resolvedMembers,
    pricingMode,
    amount,
  })
  await syncTimeDiscountMetafields(discount, timezone)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function updateTimeDiscountTitle(discountId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)
  discount.title = title
  await saveTimeDiscountsConfig(config)

  const timezone = await getShopTimezone()
  await updateShopifyDiscountRecord(discount.shopifyDiscountId, { title })
  await syncTimeDiscountMetafields(discount, timezone)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function deleteTimeDiscount(discountId: string): Promise<void> {
  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveTimeDiscountsConfig({ discounts: remaining })

  await deleteShopifyDiscountRecord(discount.shopifyDiscountId)
  await clearTimeDiscountMetafields(discount.resolvedMembers)

  await redirectWithToken('/')
}
