'use client'

import { useState } from 'react'
import Card from '@/form/components/Card'

// The "Details" card: the discount's name, which only the merchant sees. (The
// design's customer-facing Title field is gone: a new discount's title is its name.)
export default function DetailsCard({ initialName, onNameChange }: { initialName: string; onNameChange?: (name: string) => void }) {
  // Held in state (not left to the browser) so a form that is sent and comes back with an error keeps what was typed.
  const [name, setName] = useState(initialName)
  return (
    <Card>
      <div className="pb-1">
        <h2 className="text-form-headline-sm text-form-on-surface">Details</h2>
      </div>
      <div className="space-y-form-md">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-form-label-md text-form-on-surface" htmlFor="internal-name">Internal name</label>
            <span className="text-form-body-sm text-form-on-surface-variant">Merchant admin only</span>
          </div>
          <input
            id="internal-name"
            name="name"
            type="text"
            required
            value={name}
            placeholder="BFCM_2026_TIER_PROMO"
            onChange={(event) => { setName(event.target.value); onNameChange?.(event.target.value) }}
            className="w-full h-10 px-3 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/60 text-form-on-surface text-form-body-md focus:outline-none focus:border-form-secondary transition-colors"
          />
          <p className="text-form-body-sm text-form-on-surface-variant">ID name of the discount, only visible in store admin</p>
        </div>
      </div>
    </Card>
  )
}
