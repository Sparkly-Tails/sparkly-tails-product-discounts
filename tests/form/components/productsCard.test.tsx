// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ProductsCard from '@/form/components/ProductsCard'
import type { SelectedMember } from '@/form/memberSelection'

vi.mock('@/actions/memberPickerActions', () => ({
  searchProductsAction: vi.fn(async () => [{ id: 'p3', title: 'Tuna Soup', variantCount: 1, imageUrl: null }]),
  listProductsAction: vi.fn(async () => []),
  getProductVariantsAction: vi.fn(async () => [{ variantId: 'v9', title: 'Default Title', price: 1.5 }]),
  validateMemberAction: vi.fn(async () => ({ ok: true })),
}))

const SALMON: SelectedMember = { productId: 'p1', variantId: 'v1', productTitle: 'Salmon Oil', variantTitle: '16 fl oz', price: 28, imageUrl: null }
const CHEWS: SelectedMember = { productId: 'p2', variantId: 'v2', productTitle: 'Joint Chews', variantTitle: '90 Chews', price: 32, imageUrl: null }

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('ProductsCard', () => {
  it('shows the heading, how many products are selected and that the discount applies automatically', () => {
    render(<ProductsCard initialMembers={[SALMON, CHEWS]} currencyCode="USD" onMembersChange={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Products & variants' })).toBeInTheDocument()
    expect(screen.getByText('2 products selected')).toBeInTheDocument()
    expect(screen.getByText('Applies automatically')).toBeInTheDocument()
  })

  it('shows a row for each initial product', () => {
    render(<ProductsCard initialMembers={[SALMON, CHEWS]} currencyCode="USD" onMembersChange={() => {}} />)
    expect(screen.getByText('Salmon Oil')).toBeInTheDocument()
    expect(screen.getByText('1 variant selected • 90 Chews • $32.00 USD')).toBeInTheDocument()
  })

  it('shows no rows and "0 products selected" when nothing is chosen', () => {
    render(<ProductsCard initialMembers={[]} currencyCode="USD" onMembersChange={() => {}} />)
    expect(screen.getByText('0 products selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
  })

  it('removes a product and reports the members that are left', () => {
    const onMembersChange = vi.fn()
    render(<ProductsCard initialMembers={[SALMON, CHEWS]} currencyCode="USD" onMembersChange={onMembersChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Salmon Oil' }))
    expect(screen.getByText('1 product selected')).toBeInTheDocument()
    expect(onMembersChange).toHaveBeenLastCalledWith([CHEWS])
  })

  it('adds a product found by the search, with the real lookups, and reports it', async () => {
    const onMembersChange = vi.fn()
    render(<ProductsCard initialMembers={[SALMON]} currencyCode="USD" excludeDiscountId="disc_1" onMembersChange={onMembersChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products or variants' }), { target: { value: 'tu' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Tuna Soup' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('2 products selected')).toBeInTheDocument()
    expect(onMembersChange).toHaveBeenLastCalledWith([SALMON, { productId: 'p3', productTitle: 'Tuna Soup', price: 1.5, imageUrl: null }])
  })

  it('reports again only when the members change, not when the parent passes a new callback', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<ProductsCard initialMembers={[SALMON]} currencyCode="USD" onMembersChange={first} />)
    rerender(<ProductsCard initialMembers={[SALMON]} currencyCode="USD" onMembersChange={second} />)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('submits the chosen members with the field names the save action reads', () => {
    const { container } = render(<ProductsCard initialMembers={[SALMON]} currencyCode="USD" onMembersChange={() => {}} />)
    expect(container.querySelector('input[name="member-0-productId"]')).toHaveValue('p1')
    expect(container.querySelector('input[name="member-0-variantId"]')).toHaveValue('v1')
  })
})
