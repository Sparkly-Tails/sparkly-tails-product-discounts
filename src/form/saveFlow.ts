// Saving the tier discount form, in order. Everything that touches the shop
// (the config, Shopify, the clock, the storefront) and every step comes in
// through `tools`, so the order and the refusals can be tried with fakes.
//
// The order is the one of the old actions: every check first, then Shopify is
// changed (the flash sale's discount), then the config is saved, then the
// storefront is updated. A refusal anywhere before the config is saved leaves
// everything as it was.
import type { Config, Discount, FlashSale } from '@/lib/config'
import type { assertFlashWindow, assertPricingAllowed, findDiscountOrThrow, needsRecordSync, syncRecordOf } from '@/actions/discountSteps'
import type { ShopClaimTools } from '@/form/claimTools'
import type { ParsedDiscount } from '@/form/parseDiscountForm'
import type * as Steps from '@/form/saveSteps'

export type SaveResult = { ok: true; discountId: string } | { ok: false; error: string }

/** What a save has worked out before anything is changed. */
export interface SavePlan {
  config: Config
  /** The discount being edited; absent for a new one. */
  existing: Discount | undefined
  /** The discount as it will be saved. */
  next: Discount
}

export interface SaveTools extends ShopClaimTools {
  // the shop
  loadConfig: () => Promise<Config>
  saveConfig: (config: Config) => Promise<void>
  readShopNow: () => Promise<{ timeZone: string; nowLocal: string }>
  assertFlashWindow: typeof assertFlashWindow
  assertPricingAllowed: typeof assertPricingAllowed
  ensureTierDiscount: () => Promise<unknown>
  needsRecordSync: typeof needsRecordSync
  syncRecordOf: typeof syncRecordOf
  syncDiscountMetafields: (discount: Discount) => Promise<void>
  clearDiscountMetafields: (members: { productId: string }[]) => Promise<void>
  findDiscountOrThrow: typeof findDiscountOrThrow
  newDiscountId: () => string
  // the pure steps (saveSteps.ts)
  pickStatus: typeof Steps.pickStatus
  readLiveMembers: typeof Steps.readLiveMembers
  buildDiscountFields: typeof Steps.buildDiscountFields
  readRecordId: typeof Steps.readRecordId
  keepRecordId: typeof Steps.keepRecordId
  buildNewDiscount: typeof Steps.buildNewDiscount
  mergeDiscount: typeof Steps.mergeDiscount
  replaceDiscount: typeof Steps.replaceDiscount
  listRemovedProducts: typeof Steps.listRemovedProducts
  isWindowChanged: typeof Steps.isWindowChanged
  isWindowCheckNeeded: typeof Steps.isWindowCheckNeeded
  describeSaveError: typeof Steps.describeSaveError
  // the steps of this file
  checkWindow: typeof checkWindow
  checkLiveClaims: typeof checkLiveClaims
  checkLiveAvailability: typeof checkLiveAvailability
  checkAvailability: typeof checkAvailability
  chooseDiscount: typeof chooseDiscount
  buildSavePlan: typeof buildSavePlan
  buildConfig: typeof buildConfig
  listPlanRemovals: typeof listPlanRemovals
  syncStorefront: typeof syncStorefront
  applySave: typeof applySave
}

/** A flash window is checked when it is new, moved or going live (see isWindowCheckNeeded). */
export async function checkWindow({ existing, values, tools }: { existing: Discount | undefined; values: ParsedDiscount; tools: SaveTools }): Promise<void> {
  const previousFlash = existing ? existing.flash : undefined
  if (!tools.isWindowCheckNeeded({ previousFlash, values, tools })) return
  tools.assertFlashWindow(values.flash as FlashSale, (await tools.readShopNow()).nowLocal)
}

/** A discount that is live needs its products free of every other live tier discount; a draft is not asked. */
export async function checkLiveClaims({ next, tools }: { next: Discount; tools: SaveTools }): Promise<void> {
  if (next.status === 'live') await tools.assertFreeOfLiveDiscounts({ members: next.members, discountId: next.discountId, tools })
}

/** A live flash sale also needs its products free of the time-based discounts that are upcoming or running. */
export async function checkLiveAvailability({ next, tools }: { next: Discount; tools: SaveTools }): Promise<void> {
  if (next.status === 'live' && next.flash) await tools.assertFreeOfOpenTimeDiscounts({ members: next.members, discountId: next.discountId, tools })
}

export async function checkAvailability({ values, next, tools }: { values: ParsedDiscount; next: Discount; tools: SaveTools }): Promise<void> {
  await tools.checkLiveClaims({ next, tools })
  await tools.assertPricingAllowed(values.members, values.pricingMode, values.tiers)
  await tools.checkLiveAvailability({ next, tools })
}

export function chooseDiscount({ existing, values, tools }: { existing: Discount | undefined; values: ParsedDiscount; tools: SaveTools }): Discount {
  return existing
    ? tools.mergeDiscount({ existing, values, tools })
    : tools.buildNewDiscount({ values, discountId: tools.newDiscountId(), tools })
}

/** Everything that can be refused, in the order it is checked, and the discount as it will be saved. Changes nothing. */
export async function buildSavePlan({ discountId, values, tools }: { discountId: string | undefined; values: ParsedDiscount; tools: SaveTools }): Promise<SavePlan> {
  const config = await tools.loadConfig()
  const existing = discountId === undefined ? undefined : tools.findDiscountOrThrow(config, discountId)
  await tools.checkWindow({ existing, values, tools })
  const next = tools.chooseDiscount({ existing, values, tools })
  await tools.checkAvailability({ values, next, tools })
  return { config, existing, next }
}

export function buildConfig({ plan, tools }: { plan: SavePlan; tools: SaveTools }): Config {
  return plan.existing
    ? { discounts: tools.replaceDiscount({ discounts: plan.config.discounts, next: plan.next }) }
    : { discounts: [...plan.config.discounts, plan.next] }
}

/** The products that were on the storefront and no longer are: dropped from a live discount, or all of them when it is taken offline. */
export function listPlanRemovals({ plan, tools }: { plan: SavePlan; tools: SaveTools }): { productId: string }[] {
  return tools.listRemovedProducts({
    previousMembers: tools.readLiveMembers({ discount: plan.existing }),
    nextMembers: tools.readLiveMembers({ discount: plan.next }),
  })
}

/** The storefront follows the saved discount: what it no longer has is cleared, and a live one puts its prices on. */
export async function syncStorefront({ plan, tools }: { plan: SavePlan; tools: SaveTools }): Promise<void> {
  const removed = tools.listPlanRemovals({ plan, tools })
  if (removed.length > 0) await tools.clearDiscountMetafields(removed)
  if (plan.next.status === 'live') await tools.syncDiscountMetafields(plan.next)
}

/** Shopify first (so a refusal leaves nothing saved), then the config, then the storefront. */
export async function applySave({ plan, tools }: { plan: SavePlan; tools: SaveTools }): Promise<void> {
  const previousRecordId = tools.readRecordId({ discount: plan.existing })
  if (!plan.existing) await tools.ensureTierDiscount()
  if (tools.needsRecordSync(plan.next, previousRecordId)) await tools.syncRecordOf(plan.next, previousRecordId)
  await tools.saveConfig(tools.buildConfig({ plan, tools }))
  await tools.syncStorefront({ plan, tools })
}

/** Saves a new discount (no `discountId`) or an existing one; a refusal comes back as a message and nothing is saved. */
export async function saveDiscountFlow({ discountId, values, tools }: { discountId: string | undefined; values: ParsedDiscount; tools: SaveTools }): Promise<SaveResult> {
  try {
    const plan = await tools.buildSavePlan({ discountId, values, tools })
    await tools.applySave({ plan, tools })
    return { ok: true, discountId: plan.next.discountId }
  } catch (error) {
    return { ok: false, error: tools.describeSaveError({ error }) }
  }
}
