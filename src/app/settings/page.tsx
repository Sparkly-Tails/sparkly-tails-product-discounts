import { saveSettingsAction } from '@/actions/saveSettings'
import FormPage from '@/form/components/FormPage'
import SettingsForm from '@/settings/components/SettingsForm'
import { getShopCurrencyCode } from '@/lib/shop'
import { getStoreSettings } from '@/settings/settingsStore'
import { flattenSettings } from '@/settings/settingsFormValues'

export default async function SettingsPage() {
  const [settings, currencyCode] = await Promise.all([getStoreSettings(), getShopCurrencyCode()])
  const initialNowSeconds = Math.floor(new Date().getTime() / 1000)
  return (
    <FormPage>
      <SettingsForm initial={flattenSettings({ settings })} currencyCode={currencyCode} initialNowSeconds={initialNowSeconds} saveAction={saveSettingsAction} />
    </FormPage>
  )
}
