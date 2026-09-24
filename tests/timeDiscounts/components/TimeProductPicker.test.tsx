// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import TimeProductPicker from '@/timeDiscounts/components/TimeProductPicker'
import * as pickerActions from '@/timeDiscounts/pickerActions'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TimeProductPicker', () => {
  it('renders with no members selected and no hidden inputs', () => {
    const { container } = render(<TimeProductPicker />)
    expect(screen.getByPlaceholderText('Search for a product to add…')).toBeInTheDocument()
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })

  it('searches after the debounce and adds a single-variant result, emitting a hidden productId input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([
      { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 },
    ])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/900', title: 'Default', price: 4.5 },
    ])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: true })
    const onMembersChange = vi.fn()

    const { container } = render(<TimeProductPicker onMembersChange={onMembersChange} />)
    await user.type(screen.getByPlaceholderText('Search for a product to add…'), 'tuna')
    await vi.advanceTimersByTimeAsync(300)

    const result = await screen.findByText('Tuna Soup')
    await user.pointer({ keys: '[MouseLeft]', target: result })

    expect(await screen.findByText(/Tuna Soup — £4.50/)).toBeInTheDocument()
    expect(container.querySelector('input[name="member-0-productId"]')).toHaveValue('gid://shopify/Product/1')
    expect(container.querySelector('input[name="member-0-variantId"]')).not.toBeInTheDocument()
    expect(onMembersChange).toHaveBeenLastCalledWith([
      { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', price: 4.5 },
    ])
  })

  it('expands a multi-variant result and adds the chosen variant, emitting both hidden inputs', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([
      { id: 'gid://shopify/Product/2', title: 'Salmon Bowl', variantCount: 2 },
    ])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/901', title: 'Small', price: 3.0 },
      { variantId: 'gid://shopify/ProductVariant/902', title: 'Large', price: 5.0 },
    ])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: true })

    const { container } = render(<TimeProductPicker />)
    await user.type(screen.getByPlaceholderText('Search for a product to add…'), 'salmon')
    await vi.advanceTimersByTimeAsync(300)

    const result = await screen.findByText(/Salmon Bowl/)
    await user.pointer({ keys: '[MouseLeft]', target: result })

    const largeOption = await screen.findByText(/Large — £5.00/)
    await user.click(largeOption)

    expect(container.querySelector('input[name="member-0-productId"]')).toHaveValue('gid://shopify/Product/2')
    expect(container.querySelector('input[name="member-0-variantId"]')).toHaveValue('gid://shopify/ProductVariant/902')
  })

  it('removes a selected member and its hidden inputs', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(
      <TimeProductPicker initialMembers={[{ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', price: 4.5 }]} />,
    )
    expect(container.querySelector('input[name="member-0-productId"]')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Tuna Soup' }))

    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })

  it('shows the server validation error and does not add the member when validation rejects it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([
      { id: 'gid://shopify/Product/3', title: 'Beef Stew', variantCount: 1 },
    ])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/903', title: 'Default', price: 6.0 },
    ])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({
      ok: false, error: 'This product already belongs to another discount',
    })

    const { container } = render(<TimeProductPicker />)
    await user.type(screen.getByPlaceholderText('Search for a product to add…'), 'beef')
    await vi.advanceTimersByTimeAsync(300)
    const result = await screen.findByText('Beef Stew')
    await user.pointer({ keys: '[MouseLeft]', target: result })

    expect(await screen.findByText('This product already belongs to another discount')).toBeInTheDocument()
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })
})
