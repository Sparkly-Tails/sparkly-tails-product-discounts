import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig, pricesUniform } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'
import { updateDiscountMembers, updateDiscountTiers, updateDiscountTitle, setDiscountStatus, deleteDiscount } from '@/actions/discountActions'
import MemberPicker from '@/components/MemberPicker'
import PricingModeTierFieldsClient from './PricingModeTierFieldsClient'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function DiscountPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getConfig()
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) notFound()

  const memberInfo = await getMemberInfo(discount.members)
  const sharedPrice = memberInfo[0]?.price ?? 0

  const updateMembersWithId = updateDiscountMembers.bind(null, discountId)
  const updateTiersWithId = updateDiscountTiers.bind(null, discountId)
  const updateTitleWithId = updateDiscountTitle.bind(null, discountId)
  const goLive = setDiscountStatus.bind(null, discountId, 'live')
  const goDraft = setDiscountStatus.bind(null, discountId, 'draft')
  const remove = deleteDiscount.bind(null, discountId)

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
        {discount.status} · {discount.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'}
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Title</h2>
        <form action={updateTitleWithId} className="space-y-2">
          <div className="flex gap-2">
            <label htmlFor="title" className="sr-only">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={discount.title}
              className="flex-1 border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
            <button
              type="submit"
              className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Save title
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Shown to customers in the storefront widget's promo text.</p>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Products / variants</h2>
        <form action={updateMembersWithId} className="space-y-3">
          <MemberPicker
            initialMembers={memberInfo.map((m) => ({ productId: m.productId, variantId: m.variantId, title: m.title, price: m.price }))}
            excludeDiscountId={discountId}
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save products / variants
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          <PricingModeTierFieldsClient
            currentPricingMode={discount.pricingMode}
            allowPriceBasedModes={pricesUniform(memberInfo.map((m) => m.price))}
            percentTiers={discount.tiers.map((t) => ({ minQty: t.minQty, percentOff: t.percentOff ?? 0, anchorPrice: t.anchorPrice }))}
            fixedTiers={discount.tiers.map((t) => ({ minQty: t.minQty, fixedPrice: t.fixedPrice ?? 0 }))}
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {memberInfo.length > 0 && discount.pricingMode === 'fixed' && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting prices</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-1">Min qty</th>
                <th className="py-1">Price each</th>
                <th className="py-1">Total at min qty</th>
              </tr>
            </thead>
            <tbody>
              {discount.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">£{clampedFixedPrice(sharedPrice, tier.fixedPrice ?? 0).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThresholdFixed(sharedPrice, { minQty: tier.minQty, fixedPrice: tier.fixedPrice ?? 0 }).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {memberInfo.length > 0 && discount.pricingMode === 'percent' && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting prices</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-1">Min qty</th>
                <th className="py-1">% off</th>
                <th className="py-1">Per-unit price</th>
                <th className="py-1">Total at min qty</th>
              </tr>
            </thead>
            <tbody>
              {discount.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">{tier.percentOff}%</td>
                  <td className="py-1">£{resultingPrice(sharedPrice, tier.percentOff ?? 0).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThreshold(sharedPrice, { minQty: tier.minQty, percentOff: tier.percentOff ?? 0, anchorPrice: tier.anchorPrice }).toFixed(2)}
                    {tier.anchorPrice != null && <span className="text-muted text-xs"> (anchored)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex gap-3">
        {discount.status === 'draft' ? (
          <ConfirmForm
            action={goLive}
            confirmMessage={`Go live with this discount? This creates a real, active discount immediately.`}
          >
            <button
              type="submit"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Go live
            </button>
          </ConfirmForm>
        ) : (
          <ConfirmForm
            action={goDraft}
            confirmMessage={`Take this discount offline? It stops applying immediately.`}
          >
            <button
              type="submit"
              className="bg-danger hover:bg-danger-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              Take offline
            </button>
          </ConfirmForm>
        )}
        <ConfirmForm
          action={remove}
          confirmMessage={`Delete this discount entirely? This cannot be undone.`}
        >
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Delete
          </button>
        </ConfirmForm>
      </section>
    </main>
  )
}
