import type { ReactNode } from 'react'

// The white rounded box every section of the form sits in.
export default function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-form-surface-container-lowest rounded-lg p-form-lg shadow-xs space-y-form-md border border-form-outline-variant/20">
      {children}
    </div>
  )
}
