'use client'

import { useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'

const BUTTON_CLASS =
  'cursor-pointer text-xs font-medium text-home-on-surface-variant hover:text-home-on-surface px-2.5 py-1.5 rounded-lg border border-home-outline-variant/70 hover:bg-home-surface-container transition-colors inline-flex items-center gap-1'

// A toolbar button (the Filters and Sort buttons) that opens a panel under it.
// It closes with Escape, when focus leaves it, or when pressed again; the page
// closes it after a choice by giving it a new key (the table settings).
export default function ToolbarMenu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') setIsOpen(false)
  }

  return (
    <div className="relative" onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <button type="button" aria-expanded={isOpen} aria-haspopup="true" onClick={() => setIsOpen(!isOpen)} className={BUTTON_CLASS}>
        {icon}
        {label}
      </button>
      {isOpen ? <div className="absolute right-0 top-full mt-2 z-20">{children}</div> : null}
    </div>
  )
}
