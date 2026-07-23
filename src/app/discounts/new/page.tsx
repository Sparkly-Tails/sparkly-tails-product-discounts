import { createDiscount } from '@/actions/discountActions'
import ProductPicker from '@/components/ProductPicker'
import TierFields from '@/components/TierFields'

export default function NewDiscountPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add discount</h1>

      <form action={createDiscount} className="space-y-6">
        <div>
          <p className="block text-sm font-medium mb-2">Product</p>
          <ProductPicker initialProduct={null} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <TierFields />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price before you go live.
          </p>
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Create draft discount
        </button>
      </form>
    </main>
  )
}
