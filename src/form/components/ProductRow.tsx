import { DeleteIcon } from '@/form/components/icons'

// One chosen product: its image, its title, a line saying what is selected and a trash button.
export default function ProductRow({ title, imageUrl, summary, onRemove }: {
  title: string
  imageUrl: string | null
  summary: string
  onRemove: () => void
}) {
  return (
    <div className="group flex items-center justify-between p-3 rounded-lg bg-form-surface-container-low hover:bg-form-surface-container transition-colors border border-form-outline-variant/20">
      <div className="flex items-center gap-form-md min-w-0">
        <div className="w-12 h-12 rounded-lg bg-form-surface-container-lowest overflow-hidden flex-shrink-0 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element -- a Shopify CDN thumbnail of unknown size */}
          {imageUrl ? <img alt={title} className="w-full h-full object-cover" src={imageUrl} /> : null}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-form-label-md text-form-on-surface font-medium truncate">{title}</span>
          </div>
          <span className="text-form-body-sm text-form-on-surface-variant truncate">{summary}</span>
        </div>
      </div>
      <div className="flex items-center gap-form-xs pl-form-sm flex-shrink-0">
        <button
          type="button"
          aria-label={`Remove ${title}`}
          onClick={onRemove}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-form-on-surface-variant hover:text-form-error hover:bg-form-error-container transition-colors"
        >
          <DeleteIcon className="text-[18px]" />
        </button>
      </div>
    </div>
  )
}
