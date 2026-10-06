'use server'

import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig,
  type TimeDiscount, type TimeDiscountItem, type GroupSpec,
} from '@/timeDiscounts/config'
import { isAvailableEverywhere, fetchAvailabilityConfigs } from '@/lib/discount-availability'
import { getMemberInfo } from '@/lib/products'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { redirectWithToken } from '@/lib/auth-redirect'
import { itemKey, validateRule, validateItemsStructure, assertItemsFitFunctionConfig, END_PASSED_MESSAGE } from '@/timeDiscounts/items'
import {
  createShopifyDiscountRecord, updateShopifyDiscountRecord, deleteShopifyDiscountRecord,
  parseSchedule, findDiscountOrThrow, syncBestEffort, errorMessage, adminProductBaseUrl,
} from '@/timeDiscounts/shopifyRecord'
import { resolveGroup } from '@/timeDiscounts/groupServer'
import { parseGroupSpec } from '@/timeDiscounts/group'

/** What the autosaving page shows: success, or the reason to display inline. */
export type SaveResult = { ok: true } | { ok: false; error: string }

export type SaveItemInput = {
  productId: string
  variantId?: string
  pricingMode: 'percent' | 'fixed'
  amount: number
}

type ProductKey = { productId: string; variantId?: string }

/** Runs a save and turns a thrown error into the result the page shows inline. */
async function guarded(save: () => Promise<void>): Promise<SaveResult> {
  try {
    await save()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
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

const UNREADABLE_ROWS = 'The products could not be read — reload the page and try again'

/** The rows the form sends, as plain data. Anything that is not a well-formed row is rejected rather than guessed at. */
function parseItemsFromForm(raw: string): SaveItemInput[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(UNREADABLE_ROWS)
  }
  if (!Array.isArray(parsed)) throw new Error(UNREADABLE_ROWS)
  return parsed.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error(UNREADABLE_ROWS)
    const { productId, variantId, pricingMode, amount } = entry as Record<string, unknown>
    if (typeof productId !== 'string' || productId === '') throw new Error(UNREADABLE_ROWS)
    if (variantId != null && typeof variantId !== 'string') throw new Error(UNREADABLE_ROWS)
    return {
      productId,
      ...(variantId ? { variantId } : {}),
      pricingMode: pricingMode === 'fixed' ? 'fixed' : 'percent',
      amount: Math.round(Number(amount) * 100) / 100,
    }
  })
}

/**
 * Checks every row of a discount that does not exist yet, against Shopify's
 * current prices and every other discount, and returns the rows to store.
 * A row that fails is reported with its product's name.
 */
async function buildItemsForNewDiscount(raw: string): Promise<TimeDiscountItem[]> {
  const inputs = parseItemsFromForm(raw)
  if (inputs.length === 0) throw new Error('Add at least one product before saving')

  const keys: ProductKey[] = inputs.map(({ productId, variantId }) => ({ productId, ...(variantId ? { variantId } : {}) }))
  const info = new Map((await getMemberInfo(keys)).map((member) => [itemKey(member), member]))
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()

  const items: TimeDiscountItem[] = inputs.map((input, index) => {
    const key = keys[index]
    const found = info.get(itemKey(key))
    const label = found?.title ?? `Product ${key.productId.split('/').pop()}`
    try {
      if (!found) throw new Error('This product could not be found in Shopify')
      const ruleError = validateRule(input, input.pricingMode === 'fixed' ? found.price : null)
      if (ruleError) throw new Error(ruleError)
      if (!isAvailableEverywhere(productConfig, timeConfig, key.productId, key.variantId)) {
        throw new Error(`This ${key.variantId ? 'variant' : 'product'} already belongs to another discount`)
      }
    } catch (err) {
      throw new Error(`${label}: ${err instanceof Error ? err.message : 'could not be checked'}`)
    }
    return { ...key, pricingMode: input.pricingMode, amount: input.amount }
  })

  const structureError = validateItemsStructure(items)
  if (structureError) throw new Error(structureError)
  assertItemsFitFunctionConfig(items)
  return items
}

/** A new group: its picks are resolved now, and its rows come from them. */
async function buildGroupForNewDiscount(raw: string): Promise<{ items: TimeDiscountItem[]; group: GroupSpec }> {
  const group = parseGroupSpec(raw)
  const { items } = await resolveGroup(group, undefined, adminProductBaseUrl())
  return { items, group }
}

/**
 * Creates a discount with all of its rows in one request — nothing exists in
 * Shopify until the merchant presses Save on a complete form. Every problem
 * comes back as a result to show next to the Save button; success opens the
 * new discount's page (the redirect does not return).
 */
export async function createTimeDiscount(_previous: SaveResult | null, formData: FormData): Promise<SaveResult> {
  let discountId: string
  try {
    discountId = await createDiscountFromForm(formData)
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
  return { ok: true }
}

async function createDiscountFromForm(formData: FormData): Promise<string> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const { startsAt, endsAt } = parseSchedule(String(formData.get('startsAt') ?? ''), String(formData.get('endsAt') ?? ''))

  const timezone = await getShopTimezone()
  const endsAtUtc = zonedTimeToUtc(endsAt, timezone)
  // Filling in the form can take a while: refuse an end time that has slipped into the past.
  if (Date.parse(endsAtUtc) <= Date.now()) throw new Error(END_PASSED_MESSAGE)

  const kind = formData.get('kind') === 'group' ? 'group' : 'perProduct'
  const content: { items: TimeDiscountItem[]; group?: GroupSpec } =
    kind === 'group'
      ? await buildGroupForNewDiscount(String(formData.get('group') ?? ''))
      : { items: await buildItemsForNewDiscount(String(formData.get('items') ?? '[]')) }

  const shopifyDiscountId = await createShopifyDiscountRecord({
    title,
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc,
    items: content.items,
  })

  const discountId = `time_disc_${crypto.randomUUID()}`
  const newDiscount: TimeDiscount = {
    discountId, shopifyDiscountId, name: title, title, kind, startsAt, endsAt, items: content.items,
    ...(content.group ? { group: content.group } : {}),
  }

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

  await syncBestEffort('createTimeDiscount', newDiscount, timezone)
  return discountId
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
