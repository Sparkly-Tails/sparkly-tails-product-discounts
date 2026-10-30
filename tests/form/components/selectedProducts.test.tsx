// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import SelectedProducts from '@/form/components/SelectedProducts'
import type { SelectedMember } from '@/form/memberSelection'

afterEach(cleanup)

const SALMON: SelectedMember = { productId: 'p1', productTitle: 'Wild Alaskan Salmon Oil for Dogs', variantId: 'v1', variantTitle: '16 fl oz', price: 28, imageUrl: 'https://cdn.example/salmon.png' }
const CHEWS_90: SelectedMember = { productId: 'p2', productTitle: 'Canine Vitality Joint Support Chews', variantId: 'v2', variantTitle: '90 Chews', price: 32, imageUrl: null }
const CHEWS_180: SelectedMember = { productId: 'p2', productTitle: 'Canine Vitality Joint Support Chews', variantId: 'v3', variantTitle: '180 Chews', price: 58, imageUrl: null }
const WHOLE: SelectedMember = { productId: 'p3', productTitle: 'Tuna Soup', price: 1.5, imageUrl: null }

describe('SelectedProducts', () => {
  it('shows one row per product with its image, its title and what is selected', () => {
    render(<SelectedProducts members={[SALMON, CHEWS_90, CHEWS_180]} currencyCode="USD" onRemoveProduct={() => {}} />)
    expect(screen.getByText('Wild Alaskan Salmon Oil for Dogs')).toBeInTheDocument()
    expect(screen.getByText('1 variant selected • 16 fl oz • $28.00 USD')).toBeInTheDocument()
    expect(screen.getByText('Canine Vitality Joint Support Chews')).toBeInTheDocument()
    expect(screen.getByText('2 variants selected • 90 Chews, 180 Chews • $32.00–$58.00 USD')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Wild Alaskan Salmon Oil for Dogs' })).toHaveAttribute('src', 'https://cdn.example/salmon.png')
  })

  it('shows no image box content when the product has no image', () => {
    render(<SelectedProducts members={[CHEWS_90]} currencyCode="USD" onRemoveProduct={() => {}} />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('removes a whole product, with all its variants, from its trash button', () => {
    const onRemoveProduct = vi.fn()
    render(<SelectedProducts members={[SALMON, CHEWS_90, CHEWS_180]} currencyCode="USD" onRemoveProduct={onRemoveProduct} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Canine Vitality Joint Support Chews' }))
    expect(onRemoveProduct).toHaveBeenCalledWith('p2')
  })

  it('submits every member, in order, with the field names the save action reads', () => {
    const { container } = render(<SelectedProducts members={[SALMON, CHEWS_180, WHOLE]} currencyCode="USD" onRemoveProduct={() => {}} />)
    const fields = Array.from(container.querySelectorAll('input[type="hidden"]')).map((input) => [input.getAttribute('name'), input.getAttribute('value')])
    expect(fields).toEqual([
      ['member-0-productId', 'p1'],
      ['member-0-variantId', 'v1'],
      ['member-1-productId', 'p2'],
      ['member-1-variantId', 'v3'],
      ['member-2-productId', 'p3'],
    ])
  })

  it('shows no stock badge', () => {
    render(<SelectedProducts members={[SALMON]} currencyCode="USD" onRemoveProduct={() => {}} />)
    expect(screen.queryByText(/in stock/i)).toBeNull()
  })

  it('shows nothing for no members', () => {
    const { container } = render(<SelectedProducts members={[]} currencyCode="USD" onRemoveProduct={() => {}} />)
    expect(container.querySelectorAll('input, button')).toHaveLength(0)
  })
})
