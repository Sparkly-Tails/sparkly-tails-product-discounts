'use client'

import { Fragment, useActionState, useState } from 'react'
import DetailsCard from '@/form/components/DetailsCard'
import DesignCard from '@/form/components/DesignCard'
import FlashCard from '@/form/components/FlashCard'
import FormActions from '@/form/components/FormActions'
import FormShell from '@/form/components/FormShell'
import ProductsCard from '@/form/components/ProductsCard'
import TiersCard, { type TiersInitial } from '@/form/components/TiersCard'
import WidgetPreview from '@/form/preview/components/WidgetPreview'
import { buildComparable, buildPreviewFlash, buildPreviewProducts, canSaveValues, isFormDirty, pickBasePrice, type FormValues } from '@/form/formValues'
import { pricesUniform } from '@/lib/pricesUniform'

/** What a save sends back when it did not go through; a save that did go through leaves the page. */
export type SaveState = { error: string } | null

// The whole tier discount form (Create and Edit): the cards in the left column,
// the live preview in the right one and one footer. It keeps the values of every
// card to show the preview, to say when something is unsaved, to allow saving
// only with a product and a complete tier, and to take everything back on Discard.
export default function TierDiscountForm({
  breadcrumbLabel, heading, badge, mode, status, initial, initialTiers, currencyCode, shopTimezone, nowLocal, initialNowSeconds, excludeDiscountId, saveAction, deleteAction,
}: {
  breadcrumbLabel: string
  heading: string
  badge: string
  mode: 'create' | 'edit'
  /** Whether the discount is live (the footer then offers Take offline instead of Go live). */
  status: 'draft' | 'live'
  initial: FormValues
  initialTiers: TiersInitial
  currencyCode: string
  shopTimezone: string
  /** The shop's current local time, for refusing a flash sale that has already ended. */
  nowLocal: string
  initialNowSeconds: number
  excludeDiscountId?: string
  saveAction: (state: SaveState, formData: FormData) => Promise<SaveState>
  /** Deletes the discount (Edit only); without it the footer has no Delete. */
  deleteAction?: () => Promise<void>
}) {
  const [values, setValues] = useState(initial)
  const [discardCount, setDiscardCount] = useState(0)
  const [saveState, formAction] = useActionState(saveAction, null)
  const isDirty = isFormDirty({ initial, current: values, tools: { buildComparable } })

  function resetValues() {
    setValues(initial)
    setDiscardCount((count) => count + 1)
  }

  return (
    <form action={formAction}>
      {excludeDiscountId ? <input type="hidden" name="discountId" value={excludeDiscountId} /> : null}
      <FormShell
        breadcrumbLabel={breadcrumbLabel}
        heading={heading}
        badge={badge}
        preview={
          <WidgetPreview
            products={buildPreviewProducts({ members: values.members })}
            tiers={values.tiers}
            flash={buildPreviewFlash({ flash: values.flash })}
            highDemand={values.flash.highDemand}
            timeZone={shopTimezone}
            currencyCode={currencyCode}
            initialNowSeconds={initialNowSeconds}
          />
        }
        footer={<FormActions mode={mode} status={status} isDirty={isDirty} canSave={canSaveValues({ values })} saveState={saveState} deleteAction={deleteAction} onDiscard={resetValues} />}
      >
        <Fragment key={discardCount}>
          <DetailsCard initialName={initial.name} onNameChange={(name) => setValues((current) => ({ ...current, name }))} />
          <FlashCard shopTimezone={shopTimezone} nowLocal={nowLocal} initial={initial.flash} onChange={(flashValues) => setValues((current) => ({ ...current, flash: flashValues }))} />
          <ProductsCard initialMembers={initial.members} currencyCode={currencyCode} excludeDiscountId={excludeDiscountId} onMembersChange={(members) => setValues((current) => ({ ...current, members }))} />
          <TiersCard
            allowPriceBasedModes={pricesUniform(values.members.map((member) => member.price))}
            basePrice={pickBasePrice({ members: values.members })}
            currencyCode={currencyCode}
            initial={initialTiers}
            onTiersChange={({ mode: pricingMode, tiers }) => setValues((current) => ({ ...current, pricingMode, tiers }))}
          />
          <DesignCard />
        </Fragment>
      </FormShell>
    </form>
  )
}
