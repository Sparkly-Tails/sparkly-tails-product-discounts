import { shopifyQuery } from '@/lib/shopify-client'
import { getConfig } from '@/lib/config'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { clearDiscountMetafields, findExistingIds } from '@/lib/product-tiers'
import { clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'

/**
 * Written on the app installation, so Shopify removes it with the installation. A store whose installation
 * has no marker is a brand-new installation: the app has not run in it yet.
 */
const INSTALL_MARKER_KEY = 'install_marker'

interface UserError {
  message: string
}

const messages = (errors: UserError[]): string => errors.map((e) => e.message).join('; ')

/**
 * Shopify keeps an app's data for an unguaranteed time after an uninstall and re-attaches it on a reinstall,
 * and the app cannot delete it itself at uninstall (the token is already rejected in the uninstall webhook).
 * So the first time the app runs in a new installation it removes whatever was left behind: the per-product
 * data on the products the retained settings list (skipping deleted ones), then the shop settings, and only
 * then writes the marker. Any failure throws before the marker is written, so the next load repeats the
 * purge with the settings still in place; the caller must not render the app over leftovers.
 * 'fresh' = this installation was just cleaned; 'known' = nothing to do.
 */
export async function ensureFreshInstall(): Promise<'fresh' | 'known'> {
  const found = await shopifyQuery<{
    currentAppInstallation: { id: string; metafield: { value: string } | null }
    shop: { id: string }
  }>(
    `query installMarker($namespace: String!, $key: String!) {
      currentAppInstallation { id metafield(namespace: $namespace, key: $key) { value } }
      shop { id }
    }`,
    { namespace: METAFIELD_NAMESPACE, key: INSTALL_MARKER_KEY },
  )
  if (found.currentAppInstallation.metafield) return 'known'

  await purgeRetainedData(found.shop.id)

  const written = await shopifyQuery<{ metafieldsSet: { userErrors: UserError[] } }>(
    `mutation writeInstallMarker($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { message } }
    }`,
    {
      metafields: [
        { ownerId: found.currentAppInstallation.id, namespace: METAFIELD_NAMESPACE, key: INSTALL_MARKER_KEY, type: 'single_line_text_field', value: new Date().toISOString() },
      ],
    },
  )
  if (written.metafieldsSet.userErrors.length > 0) throw new Error(messages(written.metafieldsSet.userErrors))
  return 'fresh'
}

async function purgeRetainedData(shopId: string): Promise<void> {
  const [tier, time] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
  const listed = [
    ...tier.discounts.flatMap((discount) => discount.members.map((member) => member.productId)),
    ...time.discounts.flatMap((discount) => discount.items.map((item) => item.productId)),
  ]
  const existing = await findExistingIds([...new Set(listed)])
  const products = [...new Set(listed)].filter((id) => existing.has(id)).map((productId) => ({ productId }))

  await clearDiscountMetafields(products)
  await clearTimeDiscountMetafields(products)

  const deleted = await shopifyQuery<{ metafieldsDelete: { userErrors: UserError[] } }>(
    `mutation deleteRetainedSettings($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) { userErrors { message } }
    }`,
    {
      metafields: [METAFIELD_KEYS.tierConfig, METAFIELD_KEYS.timeConfig].map((key) => ({ ownerId: shopId, namespace: METAFIELD_NAMESPACE, key })),
    },
  )
  if (deleted.metafieldsDelete.userErrors.length > 0) throw new Error(messages(deleted.metafieldsDelete.userErrors))
}
