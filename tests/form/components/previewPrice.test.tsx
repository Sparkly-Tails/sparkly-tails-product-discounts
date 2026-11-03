// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import PreviewPrice from '@/form/preview/components/PreviewPrice'

afterEach(cleanup)

const box = () => screen.getByTestId('preview-price')

describe('PreviewPrice', () => {
  it('shows one price, as the theme does for a product with no offer', () => {
    render(<PreviewPrice plainPrice="$28.00" discountedPrice={null} isPlaceholder={false} />)
    expect(box()).toHaveTextContent('$28.00')
    expect(box().querySelector('s')).toBeNull()
  })

  it('shows the regular price struck through, then the discounted price, when a tier applies', () => {
    render(<PreviewPrice plainPrice="$28.00" discountedPrice="$25.20" isPlaceholder={false} />)
    expect(box().querySelector('s')).toHaveTextContent('$28.00')
    expect(box().textContent).toBe('Regular price$28.00Sale price$25.20')
  })

  it('says to a screen reader which price is the regular one and which the sale one', () => {
    render(<PreviewPrice plainPrice="$28.00" discountedPrice="$25.20" isPlaceholder={false} />)
    expect(screen.getByText('Regular price')).toHaveClass('sr-only')
    expect(screen.getByText('Sale price')).toHaveClass('sr-only')
  })

  it('shows a placeholder in a quieter colour, the same size as a real price', () => {
    render(<PreviewPrice plainPrice="$0.00" discountedPrice={null} isPlaceholder />)
    expect(box()).toHaveAttribute('data-placeholder', 'true')
    expect(box().className).toContain('h-9')
    expect(screen.getByText('$0.00').className).toContain('text-form-outline')
  })
})
