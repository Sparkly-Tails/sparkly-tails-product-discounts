import { createGroup } from '@/actions/discountActions'
import GroupProductPicker from '@/components/GroupProductPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function NewGroupPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add group discount</h1>

      <form action={createGroup} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="e.g. Mix & Match Soups"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Canagan treat"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">
            Shown to customers in the storefront widget's promo text (e.g. "Mix &amp; match any {'{title}'}"). Distinct from the group name above, which is only ever shown in this admin.
          </p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Products</p>
          <GroupProductPicker />
          <p className="text-xs text-muted mt-2">All products in a group must share the same price.</p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <PricingModeTierFields />
          <p className="text-xs text-muted mt-2">
            Tiers apply to the combined quantity of every product in the group.
          </p>
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Create draft group
        </button>
      </form>
    </main>
  )
}
