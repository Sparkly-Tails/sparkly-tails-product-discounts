// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'

afterEach(() => {
  cleanup()
})

vi.mock('@/timeDiscounts/components/TimeProductPicker', () => ({
  default: ({ onMembersChange }: { onMembersChange?: (m: { productId: string; title: string; price: number }[]) => void }) => (
    <div data-testid="stub-product-picker">
      <button type="button" onClick={() => onMembersChange?.([{ productId: 'gid://shopify/Product/1', title: 'A', price: 10 }])}>
        stub-select-uniform
      </button>
      <button
        type="button"
        onClick={() => onMembersChange?.([
          { productId: 'gid://shopify/Product/1', title: 'A', price: 10 },
          { productId: 'gid://shopify/Product/2', title: 'B', price: 20 },
        ])}
      >
        stub-select-mixed
      </button>
    </div>
  ),
}))

vi.mock('@/timeDiscounts/components/TimeCollectionPicker', () => ({
  default: () => <div data-testid="stub-collection-picker" />,
}))

describe('NewTimeDiscountForm', () => {
  it('disables submit until name, title, schedule, amount, and a selection are all present', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)

    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()

    await user.type(screen.getByLabelText('Internal name'), 'Flash')
    await user.type(screen.getByLabelText('Title'), 'Flash Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    await user.type(screen.getByLabelText('Amount'), '20')
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled() // no selection yet

    await user.click(screen.getByText('stub-select-uniform'))
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeEnabled()
  })

  it('keeps submit disabled when the end time is not after the start time', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)

    await user.type(screen.getByLabelText('Internal name'), 'Flash')
    await user.type(screen.getByLabelText('Title'), 'Flash Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-02T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText('Amount'), '20')
    await user.click(screen.getByText('stub-select-uniform'))

    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()
    expect(screen.getByText('End must be after start.')).toBeInTheDocument()
  })

  it('shows only the picker for the selected mode, never both at once', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)

    expect(screen.getByTestId('stub-product-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-collection-picker')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Collections'))

    expect(screen.queryByTestId('stub-product-picker')).not.toBeInTheDocument()
    expect(screen.getByTestId('stub-collection-picker')).toBeInTheDocument()
  })

  it('automatically falls back to percent when a fixed selection becomes non-uniform', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)

    await user.click(screen.getByRole('radio', { name: 'Fixed price' }))
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeChecked()

    await user.click(screen.getByText('stub-select-mixed')) // £10 and £20 — no longer uniform

    expect(screen.queryByRole('radio', { name: 'Fixed price' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Percentage off' })).toBeChecked()
    expect(screen.getByText('These products/variants have different prices, so only a percentage discount is available.')).toBeInTheDocument()
  })

  it('clears selection when toggling between modes, disabling submit until a new selection is made', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)

    // Fill in all required fields
    await user.type(screen.getByLabelText('Internal name'), 'Flash')
    await user.type(screen.getByLabelText('Title'), 'Flash Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    await user.type(screen.getByLabelText('Amount'), '20')

    // Select a product to enable submit
    await user.click(screen.getByText('stub-select-uniform'))
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeEnabled()

    // Toggle to Collections mode
    await user.click(screen.getByLabelText('Collections'))
    expect(screen.queryByTestId('stub-product-picker')).not.toBeInTheDocument()
    expect(screen.getByTestId('stub-collection-picker')).toBeInTheDocument()

    // Toggle back to Products mode
    await user.click(screen.getByLabelText('Specific products / variants'))
    expect(screen.getByTestId('stub-product-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-collection-picker')).not.toBeInTheDocument()

    // Submit button should be disabled because the selection was cleared
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()
  })
})
