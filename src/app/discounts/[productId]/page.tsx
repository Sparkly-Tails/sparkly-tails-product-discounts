import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { getProductInfo } from '@/lib/products'
import { resultingPrice } from '@/lib/tier-math'
import { updateTiers, setStatus, deleteDiscount } from '@/actions/discountActions'
import TierFields from '@/components/TierFields'
import ConfirmForm from '@/components/ConfirmForm'

export default async function DiscountPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId: encodedProductId } = await params
  const productId = decodeURIComponent(encodedProductId)
  await headers()

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) notFound()

  const info = await getProductInfo(productId)

  const updateTiersWithId = updateTiers.bind(null, productId)
  const goLive = setStatus.bind(null, productId, 'live')
  const goDraft = setStatus.bind(null, productId, 'draft')
  const remove = deleteDiscount.bind(null, productId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        {info ? info.title : `${productId} — not found`}
      </h1>
      <p className="text-sm text-muted mb-6">{discount.status}</p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          <TierFields initial={discount.tiers} />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {info && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting prices</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-1">Min qty</th>
                <th className="py-1">% off</th>
                <th className="py-1">Price</th>
              </tr>
            </thead>
            <tbody>
              {discount.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">{tier.percentOff}%</td>
                  <td className="py-1">£{resultingPrice(info.basePrice, tier.percentOff).toFixed(2)}</td>
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
            confirmMessage={`Go live with this discount? This creates a real, active discount for this product immediately.`}
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
