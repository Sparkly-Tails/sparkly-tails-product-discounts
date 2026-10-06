'use client'

import type { CoveredRow } from '@/timeDiscounts/group'

const money = (value: number) => `£${value.toFixed(2)}`

/** What a group covers, read-only: rows follow the picks, so none of them is edited or deleted here. */
export default function CoveredTable({ rows, emptyMessage }: { rows: CoveredRow[]; emptyMessage: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted mb-3">{emptyMessage}</p>

  return (
    <table className="w-full mb-3 text-left">
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th scope="col" className="py-2 pr-3 font-medium">Product</th>
          <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">Discounted price</th>
          <th scope="col" className="py-2 font-medium whitespace-nowrap">Regular price</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.productId}|${row.variantId ?? ''}`} className="border-b border-line align-middle">
            <td className="py-3 pr-3">
              <a href={row.adminUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
                {row.title}
              </a>
            </td>
            <td className="py-3 pr-3 text-sm font-medium whitespace-nowrap">{money(row.discountedPrice)}</td>
            <td className="py-3 text-sm text-muted whitespace-nowrap">{money(row.regularPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
