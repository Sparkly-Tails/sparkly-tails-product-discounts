'use client'

import { useState } from 'react'
import Card from '@/form/components/Card'

const FIELD_CLASS = 'w-full h-10 px-3 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/60 text-form-on-surface text-form-body-md focus:outline-none focus:border-form-secondary transition-colors'

// The "Details" card: the discount's name (only the merchant sees it), the Title customers see as the heading of the
// checkout pop-up (blank: the storefront shows the name), and how often that pop-up shows the bundle.
// The title is held by the form (it follows the name until it is edited); the name and the frequency are held here.
export default function DetailsCard({ initialName, onNameChange, title = '', onTitleChange, initialPopupFrequency = 'session', onPopupFrequencyChange }: {
  initialName: string
  onNameChange?: (name: string) => void
  title?: string
  onTitleChange?: (title: string) => void
  initialPopupFrequency?: 'session' | 'checkout'
  onPopupFrequencyChange?: (popupFrequency: 'session' | 'checkout') => void
}) {
  // Held in state (not left to the browser) so a form that is sent and comes back with an error keeps what was typed.
  const [name, setName] = useState(initialName)
  const [popupFrequency, setPopupFrequency] = useState(initialPopupFrequency)
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
            className={FIELD_CLASS}
          />
          <p className="text-form-body-sm text-form-on-surface-variant">ID name of the discount, only visible in store admin</p>
        </div>
        <div className="space-y-1">
          <label className="text-form-label-md text-form-on-surface" htmlFor="customer-title">Title</label>
          <input
            id="customer-title"
            name="title"
            type="text"
            value={title}
            placeholder="Mix & match tins"
            onChange={(event) => onTitleChange?.(event.target.value)}
            className={FIELD_CLASS}
          />
          <p className="text-form-body-sm text-form-on-surface-variant">Shown to customers as the heading of the checkout pop-up</p>
        </div>
        <div className="space-y-1">
          <label className="text-form-label-md text-form-on-surface" htmlFor="popup-frequency">Show the pop-up</label>
          <select
            id="popup-frequency"
            name="popupFrequency"
            value={popupFrequency}
            onChange={(event) => {
              const next = event.target.value === 'checkout' ? 'checkout' : 'session'
              setPopupFrequency(next)
              onPopupFrequencyChange?.(next)
            }}
            className={FIELD_CLASS}
          >
            <option value="session">Once per session</option>
            <option value="checkout">At every checkout press</option>
          </select>
        </div>
      </div>
    </Card>
  )
}
