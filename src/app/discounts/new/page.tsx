'use client'

import { useState } from 'react'
import { createDiscount } from '@/actions/discountActions'
import { pricesUniform } from '@/lib/config'
import MemberPicker from '@/components/MemberPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function NewDiscountPage() {
  const [prices, setPrices] = useState<number[]>([])
  const allowPriceBasedModes = pricesUniform(prices)

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add discount</h1>

      <form action={createDiscount} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Internal name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Canagan Tuna Soup"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Only shown in this admin.</p>
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
            placeholder="e.g. Canagan Tuna Soup"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the storefront widget's promo text.</p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Products / variants</p>
          <MemberPicker onPricesChange={setPrices} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <PricingModeTierFields allowPriceBasedModes={allowPriceBasedModes} />
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
