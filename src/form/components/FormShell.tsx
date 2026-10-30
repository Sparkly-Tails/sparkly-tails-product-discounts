import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowBackIcon } from '@/form/components/icons'

// The page frame of the tier discount form (Create and Edit): breadcrumb and
// heading with a status badge, the form column (58%) next to the preview
// column (42%, which stays in view while the form scrolls) and the footer bar.
export default function FormShell({
  breadcrumbLabel,
  heading,
  badge,
  children,
  preview,
  footer,
}: {
  breadcrumbLabel: string
  heading: string
  badge: string
  children: ReactNode
  preview: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="w-full space-y-form-md font-form text-form-on-surface">
      <div className="flex flex-col gap-form-xs pt-form-xs pb-form-xs">
        <nav aria-label="Breadcrumb" className="flex items-center gap-form-xs">
          <Link className="inline-flex items-center gap-1 text-form-label-sm text-form-on-surface-variant hover:text-form-on-surface transition-colors" href="/">
            <ArrowBackIcon className="text-[16px]" />
            <span>Discounts</span>
          </Link>
          <span className="text-form-outline-variant text-base">/</span>
          <span className="text-form-label-sm text-form-on-surface-variant">{breadcrumbLabel}</span>
        </nav>
        <div className="flex items-center gap-form-sm">
          <h1 className="text-form-headline-lg text-form-on-surface tracking-tight">{heading}</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-form-surface-container text-form-on-surface-variant text-form-label-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-form-outline"></span>
            {badge}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-form-lg items-start">
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-form-md">{children}</div>
        <div className="col-span-12 lg:col-span-5 sticky top-20 self-start flex flex-col gap-form-md">{preview}</div>
      </div>
      {footer}
    </div>
  )
}
