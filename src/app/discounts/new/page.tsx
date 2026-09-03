'use client'

import { useState } from 'react'
import { createDiscount } from '@/actions/discountActions'
import { pricesUniform } from '@/lib/config'
import MemberPicker, { type SelectedMember } from '@/components/MemberPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function NewDiscountPage() {
  const [prices, setPrices] = useState<number[]>([])
  const [members, setMembers] = useState<SelectedMember[]>([])
  const [tiersValid, setTiersValid] = useState(false)
  const allowPriceBasedModes = pricesUniform(prices)
  // The server (createDiscount) already rejects a submission with no
  // members or no complete tier — this mirrors that same rule client-side
  // so the merchant sees why the button is disabled instead of hitting a
  // thrown error after clicking it. Name/title are covered by the inputs'
  // own `required` attribute, so they don't need tracking here.
  const canSubmit = members.length > 0 && tiersValid

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
          <MemberPicker onPricesChange={setPrices} onMembersChange={setMembers} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <PricingModeTierFields allowPriceBasedModes={allowPriceBasedModes} onTiersValidChange={setTiersValid} />
        </div>

        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Create draft discount
          </button>
          {!canSubmit && (
            <p className="text-xs text-muted mt-2">Add at least one product/variant and one tier to continue.</p>
          )}
        </div>
      </form>
    </main>
  )
}
