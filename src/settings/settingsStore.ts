// Reads and writes the `tier_settings` shop metafield, as `getConfig` / `saveConfig` do for `tier_config`.
import { shopifyQuery } from '@/lib/shopify-client'
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from '@/lib/metafieldNames'
import { buildSettingsValue, readStoreSettings, type StoreSettings } from '@/settings/storeSettings'

const READ_QUERY = `query getSettings($namespace: String!, $key: String!) {
  shop { metafield(namespace: $namespace, key: $key) { value } }
}`

const SHOP_ID_QUERY = `query { shop { id } }`

const WRITE_MUTATION = `mutation setSettings($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message } }
}`

interface ReadAnswer {
  shop: { metafield: { value: string } | null }
}

interface WriteAnswer {
  metafieldsSet: { userErrors: { message: string }[] }
}

/** The stored text of the metafield; nothing when the store never saved settings. */
export function readStoredText({ answer }: { answer: ReadAnswer }): string | undefined {
  return answer.shop.metafield?.value
}

/** Shopify's refusal messages from a write, as one line (empty when it was accepted). */
export function joinErrorMessages({ answer }: { answer: WriteAnswer }): string {
  return answer.metafieldsSet.userErrors.map((error) => error.message).join('; ')
}

export interface SettingsStoreTools {
  queryShop: (query: string, variables: Record<string, unknown>) => Promise<unknown>
  readStoredText: typeof readStoredText
  joinErrorMessages: typeof joinErrorMessages
  readStoreSettings: typeof readStoreSettings
  buildSettingsValue: typeof buildSettingsValue
}

export const SETTINGS_STORE_TOOLS: SettingsStoreTools = { queryShop: shopifyQuery, readStoredText, joinErrorMessages, readStoreSettings, buildSettingsValue }

/** The store's settings; a store that never saved any gets the defaults. */
export async function getStoreSettings({ tools = SETTINGS_STORE_TOOLS }: { tools?: SettingsStoreTools } = {}): Promise<StoreSettings> {
  const answer = (await tools.queryShop(READ_QUERY, { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.tierSettings })) as ReadAnswer
  return tools.readStoreSettings({ text: tools.readStoredText({ answer }) })
}

/** Writes the settings to the shop metafield; Shopify's refusal is thrown with its message. */
export async function saveStoreSettings({ settings, tools = SETTINGS_STORE_TOOLS }: { settings: StoreSettings; tools?: SettingsStoreTools }): Promise<void> {
  const shop = (await tools.queryShop(SHOP_ID_QUERY, {})) as { shop: { id: string } }
  const metafield = { ownerId: shop.shop.id, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.tierSettings, type: 'json', value: tools.buildSettingsValue({ settings }) }
  const answer = (await tools.queryShop(WRITE_MUTATION, { metafields: [metafield] })) as WriteAnswer
  const message = tools.joinErrorMessages({ answer })
  if (message) throw new Error(message)
}
