// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import AddItemPicker from '@/timeDiscounts/components/AddItemPicker'
import * as pickerActions from '@/timeDiscounts/pickerActions'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const SEARCH = 'Search for a product to add…'

async function search(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText(SEARCH), text)
  await vi.advanceTimersByTimeAsync(300)
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.pointer({ keys: '[MouseLeft]', target: await screen.findByText(name) })
}

describe('AddItemPicker', () => {
  it('hands a single-variant product to onSelect with its price, and keeps no list of its own', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([{ variantId: 'gid://shopify/ProductVariant/900', title: 'Default', price: 4.5 }])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: true })
    const onSelect = vi.fn()

    const { container } = render(<AddItemPicker existingKeys={[]} onSelect={onSelect} />)
    await search(user, 'tuna')
    await pick(user, 'Tuna Soup')

    expect(onSelect).toHaveBeenCalledWith({ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', price: 4.5 })
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
    expect(screen.getByPlaceholderText(SEARCH)).toHaveValue('')
  })

  it('expands a multi-variant product and hands the chosen variant to onSelect', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([{ id: 'gid://shopify/Product/2', title: 'Salmon Bowl', variantCount: 2 }])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/901', title: 'Small', price: 3 },
      { variantId: 'gid://shopify/ProductVariant/902', title: 'Large', price: 5 },
    ])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: true })
    const onSelect = vi.fn()

    render(<AddItemPicker existingKeys={[]} onSelect={onSelect} />)
    await search(user, 'salmon')
    await pick(user, 'Salmon Bowl')
    await user.click(await screen.findByRole('button', { name: /Large — £5.00/ }))

    expect(onSelect).toHaveBeenCalledWith({
      productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/902', title: 'Salmon Bowl – Large', price: 5,
    })
  })

  it('leaves products already in the discount out of the results, and variants already added out of the variant list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([
      { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 },
      { id: 'gid://shopify/Product/2', title: 'Salmon Bowl', variantCount: 2 },
    ])
    vi.spyOn(pickerActions, 'getTimeDiscountProductVariantsAction').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/901', title: 'Small', price: 3 },
      { variantId: 'gid://shopify/ProductVariant/902', title: 'Large', price: 5 },
    ])

    render(
      <AddItemPicker
        existingKeys={['gid://shopify/Product/1|', 'gid://shopify/Product/2|gid://shopify/ProductVariant/901']}
        onSelect={vi.fn()}
      />,
    )
    await search(user, 'a food')

    expect(screen.queryByText('Tuna Soup')).not.toBeInTheDocument()
    await pick(user, 'Salmon Bowl')
    expect(screen.queryByRole('button', { name: /Small/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Large/ })).toBeInTheDocument()
  })

  it('shows the server\'s reason inline and does not select when the product belongs to another discount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountProductsAction').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(pickerActions, 'validateTimeDiscountMemberAction').mockResolvedValue({ ok: false, error: 'This product already belongs to another discount' })
    const onSelect = vi.fn()

    render(<AddItemPicker existingKeys={[]} onSelect={onSelect} />)
    await search(user, 'tuna')
    await pick(user, 'Tuna Soup')

    expect(await screen.findByRole('alert')).toHaveTextContent('This product already belongs to another discount')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
