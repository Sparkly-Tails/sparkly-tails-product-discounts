'use server'

import { adminProductBaseUrl, errorMessage } from '@/timeDiscounts/shopifyRecord'
import { resolveGroup } from '@/timeDiscounts/groupServer'
import { cleanRule, cleanSelection, type PreviewResult } from '@/timeDiscounts/group'

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
