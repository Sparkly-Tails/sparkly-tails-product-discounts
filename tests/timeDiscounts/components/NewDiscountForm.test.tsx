// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewDiscountForm from '@/timeDiscounts/components/NewDiscountForm'

vi.mock('@/timeDiscounts/components/NewTimeDiscountForm', () => ({ default: () => <div data-testid="per-product-form" /> }))
vi.mock('@/timeDiscounts/components/NewGroupForm', () => ({ default: () => <div data-testid="group-form" /> }))

afterEach(cleanup)
const BASE = 'https://shop.myshopify.com/admin/products/'

describe('NewDiscountForm', () => {
  it('offers the two kinds, with Per product chosen, and shows that kind\'s form', () => {
    render(<NewDiscountForm shopTimezone="Europe/London" adminProductBaseUrl={BASE} />)
    expect(screen.getByRole('heading', { name: 'Add time-based discount' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Per product/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Group/ })).not.toBeChecked()
    expect(screen.getByTestId('per-product-form')).toBeInTheDocument()
    expect(screen.queryByTestId('group-form')).not.toBeInTheDocument()
  })

  it('switches to the group form, and back', async () => {
    const user = userEvent.setup()
    render(<NewDiscountForm shopTimezone="Europe/London" adminProductBaseUrl={BASE} />)
    await user.click(screen.getByRole('radio', { name: /Group/ }))
    expect(screen.getByTestId('group-form')).toBeInTheDocument()
    expect(screen.queryByTestId('per-product-form')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Per product/ }))
    expect(screen.getByTestId('per-product-form')).toBeInTheDocument()
  })
})
