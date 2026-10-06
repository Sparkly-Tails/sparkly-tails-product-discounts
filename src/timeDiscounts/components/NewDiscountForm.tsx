'use client'

import { useState } from 'react'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'
import NewGroupForm from '@/timeDiscounts/components/NewGroupForm'

type Kind = 'perProduct' | 'group'

const KINDS: { kind: Kind; label: string; help: string }[] = [
  { kind: 'perProduct', label: 'Per product', help: 'Each product or variant has its own price or percentage.' },
  { kind: 'group', label: 'Group', help: 'One price or percentage for a set of products, variants or collections.' },
]

/** The new-discount page: choose the kind, then fill in that kind's form. Nothing is created until its Save. */
export default function NewDiscountForm({ shopTimezone, adminProductBaseUrl }: { shopTimezone: string; adminProductBaseUrl: string }) {
  const [kind, setKind] = useState<Kind>('perProduct')

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <fieldset className="mb-8">
        <legend className="font-medium mb-2">Kind</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((option) => (
            <label key={option.kind} className="flex items-start gap-3 border border-line rounded px-4 py-3 cursor-pointer has-[:checked]:border-accent">
              <input
                type="radio" name="discount-kind" className="mt-1"
                checked={kind === option.kind} onChange={() => setKind(option.kind)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted">{option.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'group'
        ? <NewGroupForm shopTimezone={shopTimezone} />
        : <NewTimeDiscountForm shopTimezone={shopTimezone} adminProductBaseUrl={adminProductBaseUrl} />}
    </main>
  )
}
