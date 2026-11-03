import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowBackIcon } from '@/form/components/icons'

// The page frame of the tier discount form (Create and Edit): a header that stays in view while the form scrolls
// (breadcrumb, then the heading with its status badge and, on the right, the actions when there are any), a notice
// under it, and the form column (58%) next to the preview column (42%, which stays in view below the header).
export default function FormShell({
  breadcrumbLabel,
  heading,
  badge,
  actions,
  notice,
  children,
  preview,
}: {
  breadcrumbLabel: string
  heading: string
  badge: string
  actions: ReactNode
  notice: ReactNode
  children: ReactNode
  preview: ReactNode
}) {
  return (
    <div className="w-full space-y-form-md font-form text-form-on-surface">
      <header data-testid="form-header" className="sticky top-0 z-10 bg-form-surface flex flex-col gap-form-xs py-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-form-xs">
          <Link className="inline-flex items-center gap-1 text-form-label-sm text-form-on-surface-variant hover:text-form-on-surface transition-colors" href="/">
            <ArrowBackIcon className="text-[16px]" />
            <span>Discounts</span>
          </Link>
          <span className="text-form-outline-variant text-base">/</span>
          <span className="text-form-label-sm text-form-on-surface-variant">{breadcrumbLabel}</span>
        </nav>
        <div data-testid="form-header-row" className="flex flex-wrap items-center justify-between gap-form-sm">
          <div className="flex items-center gap-form-sm">
            <h1 className="text-form-headline-lg text-form-on-surface tracking-tight">{heading}</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-form-surface-container text-form-on-surface-variant text-form-label-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-form-outline"></span>
              {badge}
            </span>
          </div>
          {actions ? <div data-testid="form-header-actions" className="flex items-center gap-form-sm">{actions}</div> : null}
        </div>
      </header>
      {notice}
      <div className="grid grid-cols-12 gap-form-lg items-start">
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-form-md">{children}</div>
        <div className="col-span-12 lg:col-span-5 sticky top-22 self-start flex flex-col gap-form-md">{preview}</div>
      </div>
    </div>
  )
}
