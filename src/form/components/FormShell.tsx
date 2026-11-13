import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowBackIcon } from '@/form/components/icons'

// The heading with its status pill (when the page has a status) and, under it, a line of help (when it has one).
function FormHeading({ heading, badge, subtitle }: { heading: string; badge?: string; subtitle?: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-form-sm">
        <h1 className="text-2xl font-bold tracking-tight text-form-on-surface">{heading}</h1>
        {badge ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-form-surface-container text-form-on-surface-variant text-form-label-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-form-outline"></span>
            {badge}
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="text-sm text-form-on-surface-variant">{subtitle}</p> : null}
    </div>
  )
}

// The page frame of Create, Edit and Settings, laid out like the homepage (the same page background, a 24px bold title, 2rem
// above the header, 1.5rem between blocks; the page's own 1.5rem padding below makes up the homepage's 2rem): a header that stays in view while the page scrolls
// (breadcrumb, then the heading with its status badge and, on the right, the actions when there are any), a notice
// under it, and the form column (58%) next to the preview column (42%, which stays in view below the header).
export default function FormShell({
  breadcrumbLabel,
  heading,
  badge,
  subtitle,
  actions,
  notice,
  children,
  preview,
}: {
  breadcrumbLabel: string
  heading: string
  /** The status pill next to the heading; a page without a status leaves it out. */
  badge?: string
  /** A line of help under the heading; a page without one leaves it out. */
  subtitle?: string
  actions: ReactNode
  notice: ReactNode
  children: ReactNode
  preview: ReactNode
}) {
  return (
    <div className="w-full flex flex-col gap-6 pt-8 pb-form-sm font-form text-form-on-surface">
      <header data-testid="form-header" className="sticky top-0 z-10 -mx-form-lg px-form-lg bg-form-surface flex flex-col gap-form-xs py-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-form-xs">
          <Link className="inline-flex items-center gap-1 text-form-label-sm text-form-on-surface-variant hover:text-form-on-surface transition-colors" href="/">
            <ArrowBackIcon className="text-[16px]" />
            <span>Discounts</span>
          </Link>
          <span className="text-form-outline-variant text-base">/</span>
          <span className="text-form-label-sm text-form-on-surface-variant">{breadcrumbLabel}</span>
        </nav>
        <div data-testid="form-header-row" className="flex flex-wrap items-center justify-between gap-form-sm">
          <FormHeading heading={heading} badge={badge} subtitle={subtitle} />
          {actions ? <div data-testid="form-header-actions" className="flex items-center gap-form-sm">{actions}</div> : null}
        </div>
      </header>
      {notice}
      <div className="grid grid-cols-12 gap-form-lg items-start">
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">{children}</div>
        <div className="col-span-12 lg:col-span-5 sticky top-24 self-start flex flex-col gap-6">{preview}</div>
      </div>
    </div>
  )
}
