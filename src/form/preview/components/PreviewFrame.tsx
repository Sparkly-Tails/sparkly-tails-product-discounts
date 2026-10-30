import type { ReactNode } from 'react'
import { ArrowDropDownIcon, TouchAppIcon, VisibilityIcon } from '@/form/components/icons'

function ProductSelect({ labels, selectedIndex, onSelect }: { labels: string[]; selectedIndex: number; onSelect: (index: number) => void }) {
  return (
    <div>
      <label htmlFor="preview-product" className="text-form-label-sm text-form-on-surface-variant font-medium">Product previewing:</label>
      <div className="relative flex items-center mt-1.5">
        <select
          id="preview-product"
          value={selectedIndex}
          onChange={(event) => onSelect(Number(event.target.value))}
          className="w-full h-10 pl-3 pr-8 rounded-lg bg-form-surface-container-low border border-form-outline-variant/40 text-form-on-surface text-form-body-md appearance-none focus:outline-none focus:border-form-secondary cursor-pointer transition-colors"
        >
          {labels.map((label, index) => <option key={index} value={index}>{label}</option>)}
        </select>
        <ArrowDropDownIcon className="absolute right-2.5 text-[18px] text-form-on-surface-variant pointer-events-none" />
      </div>
    </div>
  )
}

// The card around the preview, as in the design: the heading with a "live" chip, the
// list of products to preview (when there are any), the widget, and a note.
export default function PreviewFrame({ labels, selectedIndex, onSelectProduct, children }: {
  labels: string[]
  selectedIndex: number
  onSelectProduct: (index: number) => void
  children: ReactNode
}) {
  return (
    <div className="bg-form-surface-container-lowest rounded-xl shadow-lg border border-form-outline-variant/30 p-form-lg space-y-form-md">
      <div className="flex items-center justify-between border-b border-form-outline-variant/20 pb-3">
        <div className="flex items-center gap-2">
          <VisibilityIcon className="text-[20px] text-form-on-surface-variant" />
          <h2 className="text-form-headline-sm text-form-on-surface">Preview</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-form-surface-container text-[11px] text-form-on-surface-variant font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-form-on-tertiary-container animate-pulse"></span>
          Live storefront view
        </span>
      </div>
      {labels.length > 0 ? <ProductSelect labels={labels} selectedIndex={selectedIndex} onSelect={onSelectProduct} /> : null}
      <div className="rounded-2xl bg-form-surface-container-lowest overflow-hidden">{children}</div>
      <div className="flex items-center gap-2 text-[12px] text-form-on-surface-variant pt-1">
        <TouchAppIcon className="text-[16px] text-form-outline" />
        <span>Tapping options changes preview state in real-time</span>
      </div>
    </div>
  )
}
