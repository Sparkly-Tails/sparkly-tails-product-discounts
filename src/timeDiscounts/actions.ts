'use server'

import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig,
  type TimeDiscount, type TimeDiscountItem, type TimeDiscountsConfig,
} from '@/timeDiscounts/config'
import { isAvailableEverywhere, fetchAvailabilityConfigs } from '@/lib/discount-availability'
import { getMemberInfo } from '@/lib/products'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { shopifyQuery } from '@/lib/shopify-client'
import { redirectWithToken } from '@/lib/auth-redirect'
import { itemKey, validateRule, validateItemsStructure, assertItemsFitFunctionConfig } from '@/timeDiscounts/items'

const METAFIELD_NAMESPACE = 'sparkly_time_discounts'
/** Must match the `handle` in extensions/time-based-discount/shopify.extension.toml. */
const FUNCTION_HANDLE = 'time-based-discount'

/** What the autosaving page shows: success, or the reason to display inline. */
export type SaveResult = { ok: true } | { ok: false; error: string }

export type SaveItemInput = {
  productId: string
  variantId?: string
  pricingMode: 'percent' | 'fixed'
  amount: number
}

type ProductKey = { productId: string; variantId?: string }

interface FunctionConfigMetafield {
  namespace: string
  key: string
  type: string
  value: string
}

/** The Function's own per-discount config, written atomically as part of the DiscountAutomaticAppInput on create/update. */
function buildFunctionConfigMetafield(items: TimeDiscountItem[]): FunctionConfigMetafield {
  assertItemsFitFunctionConfig(items)
  return { namespace: METAFIELD_NAMESPACE, key: 'function_config', type: 'json', value: JSON.stringify({ items }) }
}

async function createShopifyDiscountRecord(input: {
  title: string
  startsAtUtc: string
  endsAtUtc: string
  items: TimeDiscountItem[]
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
        metafields: [buildFunctionConfigMetafield(input.items)],
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
  items?: TimeDiscountItem[]
}

/** Partial update — only the fields present in `update` are sent, matching Shopify's own documented partial-update behavior for this mutation. */
async function updateShopifyDiscountRecord(shopifyDiscountId: string, update: ShopifyDiscountRecordUpdate): Promise<void> {
  const automaticAppDiscount: Record<string, unknown> = {}
  if (update.title !== undefined) automaticAppDiscount.title = update.title
  if (update.startsAtUtc !== undefined) automaticAppDiscount.startsAt = update.startsAtUtc
  if (update.endsAtUtc !== undefined) automaticAppDiscount.endsAt = update.endsAtUtc
  if (update.items !== undefined) automaticAppDiscount.metafields = [buildFunctionConfigMetafield(update.items)]

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

/**
 * Uses the generic discountAutomaticDelete mutation — there is no
 * discount-type-specific delete mutation. A "not found"/"does not
 * exist"-shaped userError is treated as a successful no-op rather than an
 * error: it means Shopify's side of a previous delete already succeeded
 * (e.g. this delete is a retry after saveTimeDiscountsConfig failed on a
 * prior attempt), so retrying must not get permanently stuck.
 */
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

  const realErrors = data.discountAutomaticDelete.userErrors.filter(
    (e) => !/not found|does not exist/i.test(e.message),
  )
  if (realErrors.length > 0) {
    throw new Error(realErrors.map((e) => e.message).join('; '))
  }
}

function parseSchedule(startsAtRaw: string, endsAtRaw: string): { startsAt: string; endsAt: string } {
  const startsAt = startsAtRaw.trim()
  const endsAt = endsAtRaw.trim()
  if (!startsAt || !endsAt) throw new Error('Start and end date/time are required')
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('End must be after start')
  return { startsAt, endsAt }
}

function findDiscountOrThrow(config: TimeDiscountsConfig, discountId: string): TimeDiscount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Time discount ${discountId} not found`)
  return discount
}

/** Runs a save and turns a thrown error into the result the page shows inline. */
async function guarded(save: () => Promise<void>): Promise<SaveResult> {
  try {
    await save()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong — please try again' }
  }
}

/** The storefront sync runs after the discount is already saved and live, so a failure is logged, not surfaced as a failed save. */
async function syncBestEffort(label: string, discount: TimeDiscount, timezone: string, onlyProductIds?: string[]): Promise<void> {
  try {
    await syncTimeDiscountMetafields(discount, timezone, onlyProductIds)
  } catch (err) {
    console.error(`[${label}] storefront metafield sync failed (discount is saved and live; the storefront may be stale for some products):`, err)
  }
}

async function regularPriceOf(key: ProductKey): Promise<number> {
  const [info] = await getMemberInfo([key])
  if (!info) throw new Error('This product could not be found in Shopify')
  return info.price
}

async function assertAvailable(key: ProductKey, discountId: string): Promise<void> {
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()
  if (!isAvailableEverywhere(productConfig, timeConfig, key.productId, key.variantId, discountId)) {
    throw new Error(`This ${key.variantId ? 'variant' : 'product'} already belongs to another discount`)
  }
}

export async function createTimeDiscount(formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const { startsAt, endsAt } = parseSchedule(String(formData.get('startsAt') ?? ''), String(formData.get('endsAt') ?? ''))

  const timezone = await getShopTimezone()
  const shopifyDiscountId = await createShopifyDiscountRecord({
    title,
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    items: [],
  })

  const discountId = `time_disc_${crypto.randomUUID()}`
  const newDiscount: TimeDiscount = { discountId, shopifyDiscountId, name: title, title, startsAt, endsAt, items: [] }

  try {
    const config = await getTimeDiscountsConfig()
    await saveTimeDiscountsConfig({ discounts: [...config.discounts, newDiscount] })
  } catch (err) {
    // The Shopify discount record already exists and is live at checkout —
    // if we can't save it into this app's own config, it becomes an
    // orphan the merchant has no way to find or manage through this admin.
    // Best-effort compensating delete so a failed create doesn't silently
    // leave a live, invisible discount running.
    try {
      await deleteShopifyDiscountRecord(shopifyDiscountId)
    } catch (cleanupErr) {
      console.error(
        `[createTimeDiscount] FAILED TO ROLL BACK an orphaned Shopify discount record (id: ${shopifyDiscountId}) after the local config save failed — this discount is live at checkout but invisible in this app; delete it manually via Shopify Admin → Discounts.`,
        cleanupErr,
      )
      throw new Error(
        `Failed to save the discount, and automatic cleanup also failed. A live Shopify discount (id: ${shopifyDiscountId}) may still exist — please check Shopify Admin → Discounts and delete it manually if present.`,
      )
    }
    throw err
  }

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function saveTimeDiscountTitle(discountId: string, rawTitle: string): Promise<SaveResult> {
  return guarded(async () => {
    const title = rawTitle.trim()
    if (!title) throw new Error('A title is required')

    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)
    const timezone = await getShopTimezone()

    // Shopify's own record is updated FIRST — if it fails, the local config
    // is never saved, so the two never disagree.
    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { title })

    discount.title = title
    discount.name = title
    await saveTimeDiscountsConfig(config)
    await syncBestEffort('saveTimeDiscountTitle', discount, timezone)
  })
}

export async function saveTimeDiscountSchedule(discountId: string, startsAtRaw: string, endsAtRaw: string): Promise<SaveResult> {
  return guarded(async () => {
    const { startsAt, endsAt } = parseSchedule(startsAtRaw, endsAtRaw)

    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)
    const timezone = await getShopTimezone()

    await updateShopifyDiscountRecord(discount.shopifyDiscountId, {
      startsAtUtc: zonedTimeToUtc(startsAt, timezone),
      endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    })

    discount.startsAt = startsAt
    discount.endsAt = endsAt
    await saveTimeDiscountsConfig(config)
    await syncBestEffort('saveTimeDiscountSchedule', discount, timezone)
  })
}

/** Adds a row or replaces the rule of an existing one (same product/variant). */
export async function saveTimeDiscountItem(discountId: string, input: SaveItemInput): Promise<SaveResult> {
  return guarded(async () => {
    const pricingMode = input.pricingMode === 'fixed' ? 'fixed' : 'percent'
    const amount = Math.round(Number(input.amount) * 100) / 100
    const key: ProductKey = { productId: input.productId, ...(input.variantId ? { variantId: input.variantId } : {}) }

    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)

    const regularPrice = pricingMode === 'fixed' ? await regularPriceOf(key) : null
    const ruleError = validateRule({ pricingMode, amount }, regularPrice)
    if (ruleError) throw new Error(ruleError)

    const item: TimeDiscountItem = { ...key, pricingMode, amount }
    const exists = discount.items.some((existing) => itemKey(existing) === itemKey(key))
    const nextItems = exists
      ? discount.items.map((existing) => (itemKey(existing) === itemKey(key) ? item : existing))
      : [...discount.items, item]

    const structureError = validateItemsStructure(nextItems)
    if (structureError) throw new Error(structureError)
    if (!exists) await assertAvailable(key, discountId)

    const timezone = await getShopTimezone()
    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { items: nextItems })

    discount.items = nextItems
    await saveTimeDiscountsConfig(config)
    await syncBestEffort('saveTimeDiscountItem', discount, timezone, [key.productId])
  })
}

export async function removeTimeDiscountItem(discountId: string, key: ProductKey): Promise<SaveResult> {
  return guarded(async () => {
    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)

    const nextItems = discount.items.filter((existing) => itemKey(existing) !== itemKey(key))
    if (nextItems.length === discount.items.length) return // already gone — removing twice is a no-op

    const timezone = await getShopTimezone()
    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { items: nextItems })

    discount.items = nextItems
    await saveTimeDiscountsConfig(config)

    try {
      if (nextItems.some((existing) => existing.productId === key.productId)) {
        await syncTimeDiscountMetafields(discount, timezone, [key.productId])
      } else {
        await clearTimeDiscountMetafields([{ productId: key.productId }])
      }
    } catch (err) {
      console.error('[removeTimeDiscountItem] storefront metafield update failed (row is removed and no longer discounted at checkout; the storefront may be stale for this product):', err)
    }
  })
}

export async function deleteTimeDiscount(discountId: string): Promise<void> {
  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  // Shopify's own record is deleted FIRST — if it fails, the app hasn't yet
  // forgotten the discount exists, so the merchant can retry rather than
  // being left with a discount that discounts forever with no way to see
  // or remove it. deleteShopifyDiscountRecord itself treats "already gone"
  // as success, so a retry after a prior partial failure still succeeds.
  await deleteShopifyDiscountRecord(discount.shopifyDiscountId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveTimeDiscountsConfig({ discounts: remaining })

  try {
    await clearTimeDiscountMetafields(discount.items)
  } catch (err) {
    console.error('[deleteTimeDiscount] storefront metafield clear failed (discount is deleted and no longer live; the storefront may be stale for some products until the next successful save):', err)
  }

  await redirectWithToken('/')
}
