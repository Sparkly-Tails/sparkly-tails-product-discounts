'use client'

import { Fragment, useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DetailsCard from '@/form/components/DetailsCard'
import FlashCard from '@/form/components/FlashCard'
import FormActions from '@/form/components/FormActions'
import FormShell from '@/form/components/FormShell'
import SaveBar from '@/form/components/SaveBar'
import SaveMessage from '@/form/components/SaveMessage'
import ProductsCard from '@/form/components/ProductsCard'
import TiersCard, { type TiersInitial } from '@/form/components/TiersCard'
import WidgetPreview from '@/form/preview/components/WidgetPreview'
import { buildComparable, buildPreviewFlash, buildPreviewProducts, canSaveValues, isFormDirty, isTitleEdited, pickBasePrice, pickTitleAfterNameChange, type FormValues } from '@/form/formValues'
import { pricesUniform } from '@/lib/pricesUniform'
import { buildDesignPaint, type DesignSettings } from '@/settings/design'

/** What a save sends back when it did not go through; a save that did go through leaves the page. */
export type SaveState = { error: string } | null

// The whole tier discount form (Create and Edit): the cards in the left column,
// the live preview in the right one and the header with its buttons (only on a saved discount: a new one
// cannot be published or deleted yet). It keeps the values of every
// card to show the preview, to say when something is unsaved, to allow saving
// only with a product and a complete tier, and to take everything back on Discard.
export default function TierDiscountForm({
  breadcrumbLabel, heading, badge, mode, status, initial, initialTiers, currencyCode, shopTimezone, nowLocal, initialNowSeconds, design, excludeDiscountId, saveAction, deleteAction,
}: {
  breadcrumbLabel: string
  heading: string
  badge: string
  mode: 'create' | 'edit'
  /** Whether the discount is live (the header then offers Take offline instead of Go live). */
  status: 'draft' | 'live'
  initial: FormValues
  initialTiers: TiersInitial
  currencyCode: string
  shopTimezone: string
  /** The shop's current local time, for refusing a flash sale that has already ended. */
  nowLocal: string
  initialNowSeconds: number
  /** The store-wide design saved on the Settings page: the preview is painted with it. */
  design: DesignSettings
  excludeDiscountId?: string
  saveAction: (state: SaveState, formData: FormData) => Promise<SaveState>
  /** Deletes the discount (Edit only); without it the header has no Delete. */
  deleteAction?: () => Promise<void>
}) {
  const [values, setValues] = useState(initial)
  const [discardCount, setDiscardCount] = useState(0)
  // Until the title is written by hand it follows the name.
  const [hasEditedTitle, setHasEditedTitle] = useState(isTitleEdited({ name: initial.name, title: initial.title }))
  const [saveState, formAction, isSaving] = useActionState(saveAction, null)
  const isDirty = isFormDirty({ initial, current: values, tools: { buildComparable } })
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const canSave = canSaveValues({ values })

  function resetValues() {
    setValues(initial)
    setHasEditedTitle(isTitleEdited({ name: initial.name, title: initial.title }))
    setDiscardCount((count) => count + 1)
  }

  // Creating: nothing is saved yet, so Discard leaves for the discounts. Editing: Discard takes back what was changed.
  function cancelChanges() {
    if (mode === 'create') router.push('/')
    else resetValues()
  }

  return (
    <>
      <SaveBar id="discount-save-bar" isVisible={isDirty} canSave={canSave && !isSaving} onSave={() => formRef.current?.requestSubmit()} onDiscard={cancelChanges} />
      <form ref={formRef} action={formAction}>
        {excludeDiscountId ? <input type="hidden" name="discountId" value={excludeDiscountId} /> : null}
        <FormShell
          breadcrumbLabel={breadcrumbLabel}
          heading={heading}
          badge={badge}
          actions={<FormActions mode={mode} status={status} canSave={canSave} deleteAction={deleteAction} />}
          notice={<SaveMessage state={saveState} />}
          preview={
            <WidgetPreview
              products={buildPreviewProducts({ members: values.members })}
              tiers={values.tiers}
              flash={buildPreviewFlash({ flash: values.flash })}
              highDemand={values.flash.highDemand}
              style={buildDesignPaint(design)}
              timeZone={shopTimezone}
              currencyCode={currencyCode}
              initialNowSeconds={initialNowSeconds}
            />
          }
        >
          <Fragment key={discardCount}>
            <DetailsCard
              initialName={initial.name}
              onNameChange={(name) => setValues((current) => ({ ...current, name, title: pickTitleAfterNameChange({ name, title: current.title, isTitleEdited: hasEditedTitle }) }))}
              title={values.title}
              onTitleChange={(title) => { setHasEditedTitle(true); setValues((current) => ({ ...current, title })) }}
            />
            <ProductsCard initialMembers={initial.members} currencyCode={currencyCode} excludeDiscountId={excludeDiscountId} onMembersChange={(members) => setValues((current) => ({ ...current, members }))} />
            <TiersCard
              allowPriceBasedModes={pricesUniform(values.members.map((member) => member.price))}
              basePrice={pickBasePrice({ members: values.members })}
              currencyCode={currencyCode}
              initial={initialTiers}
              onTiersChange={({ mode: pricingMode, tiers }) => setValues((current) => ({ ...current, pricingMode, tiers }))}
            />
            <FlashCard shopTimezone={shopTimezone} nowLocal={nowLocal} initial={initial.flash} onChange={(flashValues) => setValues((current) => ({ ...current, flash: flashValues }))} />
          </Fragment>
        </FormShell>
      </form>
    </>
  )
}
