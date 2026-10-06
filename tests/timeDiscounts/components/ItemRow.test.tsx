// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import ItemRow, { type DisplayRow } from '@/timeDiscounts/components/ItemRow'

afterEach(cleanup)

const row: DisplayRow = {
  productId: 'gid://shopify/Product/1',
  title: 'Water Resistant Roll Up Travel Pet Bed',
  adminUrl: 'https://shop.myshopify.com/admin/products/1',
  regularPrice: 22,
  pricingMode: 'percent',
  amount: 20,
}

function renderRow(overrides: Partial<React.ComponentProps<typeof ItemRow>> = {}) {
  const props = {
    row, editing: false, busy: false, error: null,
    onEdit: vi.fn(), onCancel: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  }
  render(<table><tbody><ItemRow {...props} /></tbody></table>)
  return props
}

describe('ItemRow — display', () => {
  it('shows name (linked to the admin product page), type, discounted price and regular price', () => {
    renderRow()
    const link = screen.getByRole('link', { name: 'Water Resistant Roll Up Travel Pet Bed' })
    expect(link).toHaveAttribute('href', 'https://shop.myshopify.com/admin/products/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText('20% off')).toBeInTheDocument()
    expect(screen.getByText('£17.60')).toBeInTheDocument()
    expect(screen.getByText('£22.00')).toBeInTheDocument()
  })

  it('shows a fixed price row as "Fixed price" with the fixed amount as the discounted price', () => {
    renderRow({ row: { ...row, pricingMode: 'fixed', amount: 15.5 } })
    expect(screen.getByText('Fixed price')).toBeInTheDocument()
    expect(screen.getByText('£15.50')).toBeInTheDocument()
  })

  it('shows dashes when the product could not be looked up', () => {
    renderRow({ row: { ...row, regularPrice: null } })
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('has labelled edit and delete icon buttons that call back', async () => {
    const user = userEvent.setup()
    const props = renderRow()
    await user.click(screen.getByRole('button', { name: 'Edit Water Resistant Roll Up Travel Pet Bed' }))
    await user.click(screen.getByRole('button', { name: 'Delete Water Resistant Roll Up Travel Pet Bed' }))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('disables both icon buttons while busy', () => {
    renderRow({ busy: true })
    expect(screen.getByRole('button', { name: /^Edit / })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Delete / })).toBeDisabled()
  })

  it('shows a save/delete error under the row', () => {
    renderRow({ error: 'This product already belongs to another discount' })
    expect(screen.getByRole('alert')).toHaveTextContent('This product already belongs to another discount')
  })
})

describe('ItemRow — editing', () => {
  it('replaces the type and price cells with inputs, starting from the saved rule', () => {
    renderRow({ editing: true })
    expect(screen.getByLabelText(/Discount type for/)).toHaveValue('percent')
    expect(screen.getByLabelText(/Percent off for/)).toHaveValue(20)
    expect(screen.queryByText('20% off')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('previews the discounted price as you type', async () => {
    const user = userEvent.setup()
    renderRow({ editing: true })
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '50')
    expect(screen.getByText('→ £11.00')).toBeInTheDocument()
  })

  it('saves the chosen type and a pence-rounded amount', async () => {
    const user = userEvent.setup()
    const props = renderRow({ editing: true })
    await user.selectOptions(screen.getByLabelText(/Discount type for/), 'fixed')
    await user.clear(screen.getByLabelText(/Fixed price for/))
    await user.type(screen.getByLabelText(/Fixed price for/), '17.567')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledWith({ pricingMode: 'fixed', amount: 17.57 })
  })

  it('blocks saving a fixed price that is not lower than the regular price, and says why', async () => {
    const user = userEvent.setup()
    const props = renderRow({ editing: true })
    await user.selectOptions(screen.getByLabelText(/Discount type for/), 'fixed')
    await user.clear(screen.getByLabelText(/Fixed price for/))
    await user.type(screen.getByLabelText(/Fixed price for/), '25')
    expect(screen.getByRole('alert')).toHaveTextContent('The fixed price (£25.00) is not lower than the regular price (£22.00)')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('blocks a percentage over 100', async () => {
    const user = userEvent.setup()
    renderRow({ editing: true })
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '120')
    expect(screen.getByRole('alert')).toHaveTextContent('A percentage discount cannot exceed 100%')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('starts a new row empty, with Save disabled and no error until something is typed', () => {
    renderRow({ editing: true, row: { ...row, isNew: true, amount: 0 } })
    expect(screen.getByLabelText(/Percent off for/)).toHaveValue(null)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cancels', async () => {
    const user = userEvent.setup()
    const props = renderRow({ editing: true })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables Save and Cancel while a save is in flight', () => {
    renderRow({ editing: true, busy: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
