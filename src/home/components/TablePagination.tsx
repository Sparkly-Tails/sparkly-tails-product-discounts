import { ChevronLeftIcon, ChevronRightIcon } from '@/home/components/icons'
import { buildTableHref, type TableQuery, type TableView } from '@/home/tableQuery'

const BUTTON_BASE = 'px-3 py-1.5 rounded-lg border border-home-outline-variant/50 font-medium inline-flex items-center gap-1 '
const BUTTON_OFF = 'text-home-outline-variant cursor-not-allowed'
const BUTTON_ON = 'text-home-on-surface-variant hover:bg-home-surface-container transition-colors'

// "Showing 1–10 of 12 discounts" with Previous and Next; a button that has
// nowhere to go is switched off, as in the design.
export default function TablePagination({ view, query }: { view: TableView; query: TableQuery }) {
  const hasPrevious = view.page > 1
  const hasNext = view.page < view.pageCount
  return (
    <div className="px-5 py-3.5 border-t border-home-outline-variant/40 flex items-center justify-between text-xs text-home-on-surface-variant bg-home-surface-container-low/30">
      <div data-testid="showing">
        Showing <span className="font-medium text-home-on-surface">{view.firstNumber}–{view.lastNumber}</span> of{' '}
        <span className="font-medium text-home-on-surface">{view.matchCount}</span> discounts
      </div>
      <div className="flex items-center space-x-2">
        {hasPrevious ? (
          <a href={buildTableHref({ query, changes: { page: view.page - 1 } })} className={BUTTON_BASE + BUTTON_ON}>
            <ChevronLeftIcon className="text-[16px]" />
            Previous
          </a>
        ) : (
          <span aria-disabled="true" className={BUTTON_BASE + BUTTON_OFF}>
            <ChevronLeftIcon className="text-[16px]" />
            Previous
          </span>
        )}
        {hasNext ? (
          <a href={buildTableHref({ query, changes: { page: view.page + 1 } })} className={BUTTON_BASE + BUTTON_ON}>
            Next
            <ChevronRightIcon className="text-[16px]" />
          </a>
        ) : (
          <span aria-disabled="true" className={BUTTON_BASE + BUTTON_OFF}>
            Next
            <ChevronRightIcon className="text-[16px]" />
          </span>
        )}
      </div>
    </div>
  )
}
