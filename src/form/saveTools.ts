// The real steps of saving the tier discount form: the shop (config, Shopify, storefront) and the pure steps.
import {
  assertFlashWindow, assertPricingAllowed, createDiscountId, findDiscountOrThrow,
  needsRecordSync, readShopNow, syncRecordOf,
} from '@/actions/discountSteps'
import { SHOP_CLAIM_TOOLS } from '@/form/claimTools'
import { getConfig, saveConfig } from '@/lib/config'
import { clearDiscountMetafields, syncDiscountMetafields } from '@/lib/product-tiers'
import { ensureTierDiscount } from '@/lib/tierDiscount'
import {
  applySave, buildConfig, buildSavePlan, checkAvailability, checkLiveAvailability, checkLiveClaims, checkWindow, chooseDiscount, listPlanRemovals, syncStorefront, type SaveTools,
} from '@/form/saveFlow'
import {
  buildDiscountFields, buildNewDiscount, describeSaveError, isWindowChanged, isWindowCheckNeeded, keepRecordId, listRemovedProducts, mergeDiscount,
  pickStatus, readLiveMembers, readRecordId, replaceDiscount,
} from '@/form/saveSteps'

export const SAVE_TOOLS: SaveTools = {
  ...SHOP_CLAIM_TOOLS,
  loadConfig: getConfig,
  saveConfig,
  readShopNow,
  assertFlashWindow,
  assertPricingAllowed,
  ensureTierDiscount,
  needsRecordSync,
  syncRecordOf,
  syncDiscountMetafields,
  clearDiscountMetafields,
  findDiscountOrThrow,
  newDiscountId: createDiscountId,
  pickStatus,
  readLiveMembers,
  buildDiscountFields,
  readRecordId,
  keepRecordId,
  buildNewDiscount,
  mergeDiscount,
  replaceDiscount,
  listRemovedProducts,
  isWindowChanged,
  isWindowCheckNeeded,
  describeSaveError,
  checkWindow,
  checkLiveClaims,
  checkLiveAvailability,
  checkAvailability,
  chooseDiscount,
  buildSavePlan,
  buildConfig,
  listPlanRemovals,
  syncStorefront,
  applySave,
}
