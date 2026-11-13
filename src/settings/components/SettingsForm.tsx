'use client'

import { useActionState, useState } from 'react'
import FormShell from '@/form/components/FormShell'
import SaveBar from '@/form/components/SaveBar'
import AppearancePanel from '@/settings/components/AppearancePanel'
import FrequencyPanel from '@/settings/components/FrequencyPanel'
import PopupPlaceholderPreview from '@/settings/components/PopupPlaceholderPreview'
import SettingsWidgetPreview from '@/settings/components/SettingsWidgetPreview'
import StackingPanel from '@/settings/components/StackingPanel'
import ThemePanel from '@/settings/components/ThemePanel'
import { readAppBridgeBlocks } from '@/settings/readAppBridgeBlocks'
import type { SettingsSaveResult } from '@/settings/runSettingsSave'
import { isSettingsDirty, type SettingsFormValues } from '@/settings/settingsFormValues'

const MESSAGE_STYLES = {
  saved: { role: 'status', className: 'text-form-body-md text-form-on-surface-variant' },
  refused: { role: 'alert', className: 'text-form-body-md text-form-error' },
}

// What a save said: nothing before the first one; an error stays as an alert, a save that went through as a status.
function SettingsMessage({ result }: { result: SettingsSaveResult | null }) {
  if (!result) return null
  const style = result.ok ? MESSAGE_STYLES.saved : MESSAGE_STYLES.refused
  return <p role={style.role} className={style.className}>{result.message}</p>
}

// The Settings page: the panels in the left column, one Save bar for the whole page (as the discount form has).
// It keeps the values to know when something is unsaved, and takes everything back on Discard.
export default function SettingsForm({ initial, hasFlash, shop, clientId, currencyCode, initialNowSeconds, saveAction }: {
  initial: SettingsFormValues
  /** True when a flash sale exists: product-discount stacking is then locked on. */
  hasFlash: boolean
  /** The shop's myshopify.com domain and the app's client id, for the theme editor links. */
  shop: string
  clientId: string
  currencyCode: string
  /** The time the page was made, so the preview's first paint matches the server's. */
  initialNowSeconds: number
  saveAction: (state: SettingsSaveResult | null, formData: FormData) => Promise<SettingsSaveResult>
}) {
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [formRevision, setFormRevision] = useState(0)
  const [isFlashShown, setIsFlashShown] = useState(false)

  async function submit(state: SettingsSaveResult | null, formData: FormData) {
    const result = await saveAction(state, formData)
    if (result.ok) setSaved(values)
    return result
  }

  const [result, formAction, isSaving] = useActionState(submit, null)
  const isDirty = isSettingsDirty({ saved, current: values })

  function resetChanges() {
    setValues(saved)
    setFormRevision((revision) => revision + 1)
  }

  return (
    <>
      <SaveBar id="settings-save-bar" isVisible={isDirty} canSave={!isSaving} onSave={() => document.forms.namedItem('settings')?.requestSubmit()} onDiscard={resetChanges} />
      <form name="settings" action={formAction}>
        {Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={String(value)} />)}
        <FormShell breadcrumbLabel="Settings" heading="Settings" subtitle="Customize global storefront appearance, bundle trigger thresholds, and discount stacking logic." actions={null}
          notice={<SettingsMessage result={result} />}
          preview={
            <>
              <SettingsWidgetPreview
                accentColor={values.accentColor}
                backgroundColor={values.backgroundColor}
                cornerRadius={values.cornerRadius}
                flashTone={values.flashTone}
                isFlashShown={isFlashShown}
                onFlashShownChange={setIsFlashShown}
                currencyCode={currencyCode}
                initialNowSeconds={initialNowSeconds}
              />
              <PopupPlaceholderPreview accentColor={values.accentColor} backgroundColor={values.backgroundColor} cornerRadius={values.cornerRadius} flashTone={values.flashTone} />
            </>
          }
        >
          <AppearancePanel
            key={formRevision}
            accentColor={values.accentColor}
            backgroundColor={values.backgroundColor}
            cornerRadius={values.cornerRadius}
            flashTone={values.flashTone}
            onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
          />
          <FrequencyPanel frequency={values.frequency} onChange={(frequency) => setValues((current) => ({ ...current, frequency }))} />
          <StackingPanel
            key={`stacking-${formRevision}`}
            orderDiscounts={values.orderDiscounts}
            shippingDiscounts={values.shippingDiscounts}
            productDiscounts={values.productDiscounts}
            hasFlash={hasFlash}
            onChange={(field, checked) => setValues((current) => ({ ...current, [field]: checked }))}
          />
          <ThemePanel shop={shop} clientId={clientId} readBlocks={readAppBridgeBlocks} />
        </FormShell>
      </form>
    </>
  )
}
