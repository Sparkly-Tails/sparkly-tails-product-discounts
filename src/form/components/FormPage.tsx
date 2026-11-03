import type { ReactNode } from 'react'

// The frame of the tier discount form pages: the design's light palette and typeface, and the 1400px column
// the design uses, with no padding above it (the form's header is the top of the page). (Shopify shows the app's name at the top of the admin, so the page has no header of its own.)
export default function FormPage({ children }: { children: ReactNode }) {
  return (
    <div className="font-form bg-form-surface text-form-on-surface min-h-screen antialiased">
      <main className="w-full max-w-[1400px] mx-auto px-form-lg pb-form-lg">{children}</main>
    </div>
  )
}
