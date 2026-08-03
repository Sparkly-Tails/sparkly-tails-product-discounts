import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { getGroupProductInfo } from '@/lib/products'
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'
import { updateGroupProducts, updateGroupTiers, setGroupStatus, deleteGroup } from '@/actions/discountActions'
import GroupProductPicker from '@/components/GroupProductPicker'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId: encodedGroupId } = await params
  const groupId = decodeURIComponent(encodedGroupId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) notFound()

  const members = await getGroupProductInfo(group.productIds)
  const sharedPrice = members[0]?.basePrice ?? 0

  const updateProductsWithId = updateGroupProducts.bind(null, groupId)
  const updateTiersWithId = updateGroupTiers.bind(null, groupId)
  const goLive = setGroupStatus.bind(null, groupId, 'live')
  const goDraft = setGroupStatus.bind(null, groupId, 'draft')
  const remove = deleteGroup.bind(null, groupId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <h1 className="text-2xl font-semibold mb-2">{group.name}</h1>
      <p className="text-sm text-muted mb-6">
        {group.status} · {group.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'}
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Products</h2>
        <form action={updateProductsWithId} className="space-y-3">
          <GroupProductPicker
            initialProducts={members.map((m) => ({ id: m.productId, title: m.title, price: m.basePrice }))}
            excludeGroupId={groupId}
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save products
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          {group.pricingMode === 'fixed' ? (
            <FixedPriceTierFields
              initial={group.tiers.map((t) => ({ minQty: t.minQty, fixedPrice: t.fixedPrice ?? 0 }))}
            />
          ) : (
            <TierFields initial={group.tiers.map((t) => ({ minQty: t.minQty, percentOff: t.percentOff ?? 0, anchorPrice: t.anchorPrice }))} />
          )}
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {members.length > 0 && group.pricingMode === 'fixed' && (
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
              {group.tiers.map((tier) => (
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

      {members.length > 0 && group.pricingMode === 'percent' && (
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
              {group.tiers.map((tier) => (
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
        {group.status === 'draft' ? (
          <ConfirmForm
            action={goLive}
            confirmMessage={`Go live with this group discount? This creates a real, active discount for all its products immediately.`}
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
            confirmMessage={`Take this group discount offline? It stops applying immediately.`}
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
          confirmMessage={`Delete this group discount entirely? This cannot be undone.`}
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
