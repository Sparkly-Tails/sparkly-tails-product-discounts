'use server'

import { getConfig, saveConfig } from '@/lib/config'
import { redirect } from 'next/navigation'
import { clearDiscountMetafields } from '@/lib/product-tiers'
import { findDiscountOrThrow, syncRecordOf } from '@/actions/discountSteps'

export async function deleteDiscount(discountId: string): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const previousRecordId = discount.flash?.shopifyDiscountId
  if (previousRecordId) await syncRecordOf({ ...discount, status: 'draft', flash: undefined }, previousRecordId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveConfig({ discounts: remaining })

  await clearDiscountMetafields(discount.members)

  redirect('/')
}
