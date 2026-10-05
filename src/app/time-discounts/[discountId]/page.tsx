import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getTimeDiscountsConfig, computeTimeDiscountStatusLabel, pricesUniform } from '@/timeDiscounts/config'
import {
  updateTimeDiscountSelection, updateTimeDiscountSchedule, updateTimeDiscountTitle, deleteTimeDiscount,
} from '@/timeDiscounts/actions'
import { getShopTimezone } from '@/lib/shop'
import { getMemberInfo } from '@/lib/products'
import TimeProductPicker from '@/timeDiscounts/components/TimeProductPicker'
import TimeCollectionPicker, { type SelectedCollection } from '@/timeDiscounts/components/TimeCollectionPicker'
import PricingAmountFields from '@/timeDiscounts/components/PricingAmountFields'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function TimeDiscountPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getTimeDiscountsConfig()
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) notFound()

  const memberInfo = await getMemberInfo(discount.resolvedMembers)
  const basePrice = memberInfo[0]?.price ?? 0
  const resultingPrice = discount.pricingMode === 'fixed'
    ? Math.min(discount.amount, basePrice)
    : Math.round(basePrice * (1 - discount.amount / 100) * 100) / 100

  const timezone = await getShopTimezone()
  const scheduleLabel = computeTimeDiscountStatusLabel(discount.startsAt, discount.endsAt, timezone)

  const updateSelectionWithId = updateTimeDiscountSelection.bind(null, discountId)
  const updateScheduleWithId = updateTimeDiscountSchedule.bind(null, discountId)
  const updateTitleWithId = updateTimeDiscountTitle.bind(null, discountId)
  const remove = deleteTimeDiscount.bind(null, discountId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <h1 className="text-2xl font-semibold mb-2">{discount.name}</h1>
      <p className="text-sm text-muted mb-6">
        {scheduleLabel} · {discount.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · time-based
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Title</h2>
        <form action={updateTitleWithId} className="space-y-2">
          <div className="flex gap-2">
            <label htmlFor="title" className="sr-only">Title</label>
            <input
              id="title" name="title" type="text" required defaultValue={discount.title}
              className="flex-1 border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
            <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Save title
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Applies to — {discount.selection.mode === 'products' ? 'specific products/variants' : 'collections'}</h2>
        <form action={updateSelectionWithId} className="space-y-3">
          <input type="hidden" name="selectionMode" value={discount.selection.mode} />
          {discount.selection.mode === 'products' ? (
            <TimeProductPicker
              initialMembers={memberInfo.map((m) => ({ productId: m.productId, variantId: m.variantId, title: m.title, price: m.price }))}
              excludeDiscountId={discountId}
            />
          ) : (
            <TimeCollectionPicker
              initialCollections={discount.selection.collectionIds.map((id): SelectedCollection => ({ id, title: id }))}
            />
          )}
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Save selection
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule &amp; discount</h2>
        <form action={updateScheduleWithId} className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts</label>
              <input
                id="startsAt" name="startsAt" type="datetime-local" required defaultValue={discount.startsAt}
                className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
              />
            </div>
            <div>
              <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends</label>
              <input
                id="endsAt" name="endsAt" type="datetime-local" required defaultValue={discount.endsAt}
                className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
              />
            </div>
          </div>
          <PricingAmountFields
            defaultPricingMode={discount.pricingMode} defaultAmount={discount.amount}
            regularPrice={pricesUniform(memberInfo.map((m) => m.price)) ? basePrice : null}
          />
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Save schedule &amp; discount
          </button>
        </form>
      </section>

      {memberInfo.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting price</h2>
          <p className="text-sm">
            £{basePrice.toFixed(2)} → £{resultingPrice.toFixed(2)}
            {discount.selection.mode === 'collections' && (
              <span className="text-muted text-xs"> (based on the first resolved member — see the design note on collections and shared pricing)</span>
            )}
          </p>
        </section>
      )}

      <section className="flex gap-3">
        <ConfirmForm action={remove} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </main>
  )
}
