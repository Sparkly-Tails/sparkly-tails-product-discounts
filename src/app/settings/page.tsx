import { saveSettingsAction } from '@/actions/saveSettings'
import FormPage from '@/form/components/FormPage'
import SettingsForm from '@/settings/components/SettingsForm'
import { getStoreSettings } from '@/settings/settingsStore'
import { flattenSettings } from '@/settings/settingsFormValues'

export default async function SettingsPage() {
  const settings = await getStoreSettings()
  return (
    <FormPage>
      <SettingsForm initial={flattenSettings({ settings })} saveAction={saveSettingsAction} />
    </FormPage>
  )
}
