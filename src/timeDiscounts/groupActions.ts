'use server'

import { getTimeDiscountsConfig, saveTimeDiscountsConfig, type GroupSpec } from '@/timeDiscounts/config'
import { getShopTimezone } from '@/lib/shop'
import { adminProductBaseUrl, errorMessage, findDiscountOrThrow, updateShopifyDiscountRecord } from '@/timeDiscounts/shopifyRecord'
import { resolveGroup, syncGroupMetafields } from '@/timeDiscounts/groupServer'
import {
  NOT_A_GROUP_MESSAGE, cleanRule, cleanSelection, type GroupSaveResult, type PreviewResult,
} from '@/timeDiscounts/group'

/**
 * Answers "what would this group do?" without writing anything: the products
 * it covers and their prices, or the first thing wrong with it. Backs the new
 * group form, which cannot know what a collection holds until the server looks.
 * `excludeDiscountId` is the group's own id when previewing an existing one.
 */
export async function previewGroup(rule: unknown, selection: unknown, excludeDiscountId?: string): Promise<PreviewResult> {
  try {
    const group = { ...cleanRule(rule), selection: cleanSelection(selection) }
    const { covered } = await resolveGroup(group, excludeDiscountId, adminProductBaseUrl())
    return { ok: true, covered }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

/**
 * Saves a change to an existing group. The group is re-checked as a whole
 * (its own rows never count as conflicts), Shopify's record is updated FIRST
 * so a failure there leaves the app config untouched, and the storefront
 * update is best effort, like every other save.
 */
async function saveGroup(discountId: string, change: (group: GroupSpec) => GroupSpec): Promise<GroupSaveResult> {
  try {
    const config = await getTimeDiscountsConfig()
    const discount = findDiscountOrThrow(config, discountId)
    if (discount.kind !== 'group' || !discount.group) throw new Error(NOT_A_GROUP_MESSAGE)

    const group = change(discount.group)
    const { items, covered } = await resolveGroup(group, discountId, adminProductBaseUrl(), { allowEmpty: true })
    const timezone = await getShopTimezone()

    await updateShopifyDiscountRecord(discount.shopifyDiscountId, { items })

    const itemsBefore = discount.items
    discount.group = group
    discount.items = items
    await saveTimeDiscountsConfig(config)

    try {
      await syncGroupMetafields(itemsBefore, discount, timezone)
    } catch (err) {
      console.error('[saveGroup] storefront metafield update failed (the discount is saved and live; the storefront may be stale for some products):', err)
    }
    return { ok: true, covered }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export async function saveGroupRule(discountId: string, rule: unknown): Promise<GroupSaveResult> {
  try {
    const cleaned = cleanRule(rule)
    return saveGroup(discountId, (group) => ({ ...group, ...cleaned }))
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export async function saveGroupSelection(discountId: string, selection: unknown): Promise<GroupSaveResult> {
  try {
    const cleaned = cleanSelection(selection)
    return saveGroup(discountId, (group) => ({ ...group, selection: cleaned }))
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}
