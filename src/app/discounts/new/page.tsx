import { createDiscount } from '@/actions/discountActions'
import ProductPicker from '@/components/ProductPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function NewDiscountPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add discount</h1>

      <form action={createDiscount} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Canagan Tuna Soup"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the storefront widget's promo text.</p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Product</p>
          <ProductPicker initialProduct={null} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <PricingModeTierFields />
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
