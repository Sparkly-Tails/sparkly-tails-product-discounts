import { saveSettingsAction } from '@/actions/saveSettings'
import FormPage from '@/form/components/FormPage'
import SettingsForm from '@/settings/components/SettingsForm'
import { getConfig } from '@/lib/config'
import { getShopCurrencyCode } from '@/lib/shop'
import { shopifyQuery } from '@/lib/shopify-client'
import { getStoreSettings } from '@/settings/settingsStore'
import { flattenSettings } from '@/settings/settingsFormValues'
import { hasFlashSale, readSharedStacking } from '@/settings/stacking'

export default async function SettingsPage() {
  const [settings, currencyCode, stacking, config] = await Promise.all([getStoreSettings(), getShopCurrencyCode(), readSharedStacking({ query: shopifyQuery }), getConfig()])
  const initialNowSeconds = Math.floor(new Date().getTime() / 1000)
  return (
    <FormPage>
      <SettingsForm
        initial={flattenSettings({ settings, stacking })}
        hasFlash={hasFlashSale({ discounts: config.discounts })}
        currencyCode={currencyCode}
        initialNowSeconds={initialNowSeconds}
        saveAction={saveSettingsAction}
      />
    </FormPage>
  )
}
