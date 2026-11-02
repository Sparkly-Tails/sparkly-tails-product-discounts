import Link from 'next/link'
import SortMenu from '@/home/components/SortMenu'
import StatusPill from '@/home/components/StatusPill'
import TablePagination from '@/home/components/TablePagination'
import TableToolbar from '@/home/components/TableToolbar'
import { ChevronRightIcon } from '@/home/components/icons'
import type { DiscountRow } from '@/home/discountRows'
import { MIN_ROWS_FOR_PAGINATION, type TableQuery, type TableView } from '@/home/tableQuery'

const HEAD_CELL = 'py-3 px-4 font-medium '

// The whole row opens the discount: the title is a link stretched over the row.
function TableRow({ row }: { row: DiscountRow }) {
  return (
    <tr data-testid="discount-row" className="relative hover:bg-home-surface-container-low/70 transition-colors cursor-pointer group">
      <td className="py-3.5 px-5">
        <Link
          href={row.href}
          className="block font-semibold text-sm text-home-on-surface group-hover:text-home-primary transition-colors after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-home-primary focus-visible:after:ring-inset"
        >
          {row.title}
        </Link>
        {row.subtitle ? (
          <div data-testid="row-subtitle" className="text-[11px] leading-4 text-home-on-surface-variant mt-0.5">{row.subtitle}</div>
        ) : null}
      </td>
      <td className="py-3.5 px-4">
        <StatusPill isActive={row.isActive} />
      </td>
      <td className="py-3.5 px-4 text-home-on-surface-variant hidden sm:table-cell">
        <span>{row.rules}</span>
      </td>
      <td className="py-3.5 px-5 text-right">
        <ChevronRightIcon className="text-home-outline-variant group-hover:text-home-on-surface group-hover:translate-x-0.5 transition-all text-base h-6" />
      </td>
    </tr>
  )
}

function RowsTable({ rows }: { rows: DiscountRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-home-outline-variant/40 bg-home-surface-container-low/50 text-home-on-surface-variant font-medium">
            <th className="py-3 px-5 font-medium" scope="col">Discount title</th>
            <th className={HEAD_CELL + 'w-28'} scope="col">Status</th>
            <th className={HEAD_CELL + 'hidden sm:table-cell'} scope="col">Schedule / Rules</th>
            <th className="py-3 px-5 text-right w-12" scope="col"></th>
          </tr>
        </thead>
        <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-home-outline-variant/30 text-home-on-surface">
          {rows.map((row) => (
            <TableRow key={row.key} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ hasDiscounts }: { hasDiscounts: boolean }) {
  return (
    <div className="px-5 py-10 text-center text-xs text-home-on-surface-variant">
      {hasDiscounts ? (
        <>
          <p>No discounts match your search.</p>
          <Link href="/" className="inline-block mt-2 font-medium text-home-primary hover:underline">Clear search</Link>
        </>
      ) : (
        <p>No discounts yet.</p>
      )}
    </div>
  )
}

// The "All discounts" card: title, Sort, tabs and search, the
// table, and the pagination line.
export default function DiscountsTable({ view, query }: { view: TableView; query: TableQuery }) {
  const hasMatches = view.matchCount > 0
  // A new key closes the Sort menu whenever the table settings change.
  const settings = JSON.stringify(query)
  return (
    <section className="bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl overflow-hidden flex flex-col">
      <div className="p-5 border-b border-home-outline-variant/40 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-home-on-surface tracking-tight">All discounts</h2>
            <p className="text-xs text-home-on-surface-variant">Manage your tier quantity breaks and flash sales.</p>
          </div>
          <div className="flex items-center gap-2">
            <SortMenu key={'sort-' + settings} query={query} />
          </div>
        </div>
        <TableToolbar query={query} counts={view.counts} />
      </div>
      {hasMatches ? <RowsTable rows={view.visibleRows} /> : <EmptyState hasDiscounts={view.counts.all > 0} />}
      {view.matchCount >= MIN_ROWS_FOR_PAGINATION ? <TablePagination view={view} query={query} /> : null}
    </section>
  )
}
