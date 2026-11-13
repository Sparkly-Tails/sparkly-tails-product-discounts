// Removes what the store-wide Settings replaced: each discount's own look and pop-up frequency. It runs after a Settings
// save, and again on every later save: running it twice changes nothing, so a run that stopped halfway is finished by
// saving again.
import type { Config, Discount } from '@/lib/config'

export interface CleanTools {
  /** The config as the store holds it, without the retired fields (see getConfig). */
  readConfig: () => Promise<Config>
  /** Writes the config, and with it the card index the product cards and the pop-up read. */
  writeConfig: (config: Config) => Promise<void>
  /** Rewrites the metafields of one discount's products. */
  syncProducts: (discount: Discount) => Promise<void>
}

/**
 * Only live discounts have product metafields and a place in the card index.
 * Writes the config back without the old fields, then re-syncs the products of every live discount so their metafields
 * lose them too. Returns how many live discounts it re-synced. The config goes first: if a sync fails, the config
 * is already clean and the next run only has the products left.
 */
export async function cleanOldValues({ tools }: { tools: CleanTools }): Promise<number> {
  const config = await tools.readConfig()
  await tools.writeConfig(config)
  const live = config.discounts.filter((discount) => discount.status === 'live')
  for (const discount of live) await tools.syncProducts(discount)
  return live.length
}
