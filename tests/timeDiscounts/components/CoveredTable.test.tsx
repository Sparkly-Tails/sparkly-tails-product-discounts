// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import CoveredTable from '@/timeDiscounts/components/CoveredTable'

afterEach(cleanup)
const rows = [
  { productId: 'gid://shopify/Product/1', title: 'Cat Toy', adminUrl: 'https://shop/admin/products/1', regularPrice: 10, discountedPrice: 8 },
  { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Bed – Grey', adminUrl: 'https://shop/admin/products/2', regularPrice: 40, discountedPrice: 7.5 },
]

describe('CoveredTable', () => {
  it('lists each covered product with a link to its admin page and both prices', () => {
    render(<CoveredTable rows={rows} emptyMessage="Nothing yet" />)
    const link = screen.getByRole('link', { name: 'Cat Toy' })
    expect(link).toHaveAttribute('href', 'https://shop/admin/products/1')
    expect(link).toHaveAttribute('target', '_blank')
    const row = link.closest('tr')!
    expect(within(row).getByText('£8.00')).toBeInTheDocument()
    expect(within(row).getByText('£10.00')).toBeInTheDocument()
    expect(screen.getByText('£7.50')).toBeInTheDocument()
  })

  it('has no edit or delete buttons: rows follow the picks', () => {
    render(<CoveredTable rows={rows} emptyMessage="Nothing yet" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the empty message when nothing is covered', () => {
    render(<CoveredTable rows={[]} emptyMessage="Nothing yet" />)
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
