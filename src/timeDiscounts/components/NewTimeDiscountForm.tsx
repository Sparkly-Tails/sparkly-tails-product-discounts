'use client'

import { useState } from 'react'
import { createTimeDiscount } from '@/timeDiscounts/actions'
import { pricesUniform, fixedPriceNotLowerError } from '@/timeDiscounts/config'
import TimeProductPicker, { type SelectedMember } from '@/timeDiscounts/components/TimeProductPicker'
import TimeCollectionPicker, { type SelectedCollection } from '@/timeDiscounts/components/TimeCollectionPicker'
import PricingAmountFields from '@/timeDiscounts/components/PricingAmountFields'

export default function NewTimeDiscountForm({ shopTimezone }: { shopTimezone: string }) {
  const [selectionMode, setSelectionMode] = useState<'products' | 'collections'>('products')
  const [members, setMembers] = useState<SelectedMember[]>([])
  const [collections, setCollections] = useState<SelectedCollection[]>([])
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [amount, setAmount] = useState('')
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>('percent')

  const allowFixed = selectionMode === 'products' ? pricesUniform(members.map((m) => m.price)) : true
  const hasSelection = selectionMode === 'products' ? members.length > 0 : collections.length > 0
  const hasValidSchedule = startsAt !== '' && endsAt !== '' && endsAt > startsAt
  const hasValidAmount = Number(amount) > 0
  // Only known up front for a product/variant selection (collection members are priced server-side).
  const regularPrice = selectionMode === 'products' && allowFixed && members.length > 0 ? members[0].price : null
  const priceError = fixedPriceNotLowerError(pricingMode, Number(amount), regularPrice)
  const canSubmit = hasSelection && hasValidSchedule && hasValidAmount && !priceError

  function handleSelectionModeChange(mode: 'products' | 'collections') {
    setSelectionMode(mode)
    setMembers([])
    setCollections([])
  }

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <form action={createTimeDiscount} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Internal name</label>
          <input
            id="name" name="name" type="text" required placeholder="e.g. Spring Flash Sale"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Only shown in this admin.</p>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
          <input
            id="title" name="title" type="text" required placeholder="e.g. Spring Flash Sale"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input
              id="startsAt" name="startsAt" type="datetime-local" required value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input
              id="endsAt" name="endsAt" type="datetime-local" required value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>
        </div>
        {startsAt !== '' && endsAt !== '' && endsAt <= startsAt && (
          <p className="text-xs text-danger -mt-4">End must be after start.</p>
        )}

        <div>
          <p className="block text-sm font-medium mb-2">Applies to</p>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={selectionMode === 'products'} onChange={() => handleSelectionModeChange('products')} />
              Specific products / variants
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={selectionMode === 'collections'} onChange={() => handleSelectionModeChange('collections')} />
              Collections
            </label>
          </div>
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === 'products' ? (
            <TimeProductPicker onMembersChange={setMembers} />
          ) : (
            <TimeCollectionPicker onCollectionsChange={setCollections} />
          )}
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Discount</p>
          <PricingAmountFields
            defaultPricingMode="percent" allowFixed={allowFixed} onAmountChange={setAmount}
            regularPrice={regularPrice} onPricingModeChange={setPricingMode}
          />
        </div>

        <div>
          <button
            type="submit" disabled={!canSubmit}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Create discount
          </button>
          {!canSubmit && (
            <p className="text-xs text-muted mt-2">Add a name/title, a valid start and end time, at least one product/variant or collection, and a discount amount to continue.</p>
          )}
        </div>
      </form>
    </main>
  )
}
