'use client'

import { useState } from 'react'
import { createTimeDiscount } from '@/timeDiscounts/actions'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/** Title and schedule only — the discount is created empty and opens on its own page, where products are added. */
export default function NewTimeDiscountForm({ shopTimezone }: { shopTimezone: string }) {
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const hasValidSchedule = startsAt !== '' && endsAt !== '' && endsAt > startsAt
  const canSubmit = title.trim() !== '' && hasValidSchedule

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <form action={createTimeDiscount} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
          <input
            id="title" name="title" type="text" required placeholder="e.g. Spring Flash Sale"
            value={title} onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" name="endsAt" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {startsAt !== '' && endsAt !== '' && endsAt <= startsAt && (
          <p className="text-xs text-danger -mt-4">End must be after start.</p>
        )}

        <div>
          <button
            type="submit" disabled={!canSubmit}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Create discount
          </button>
          <p className="text-xs text-muted mt-2">You&apos;ll add products on the next screen.</p>
        </div>
      </form>
    </main>
  )
}
