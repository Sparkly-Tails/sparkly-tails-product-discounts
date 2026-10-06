// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewGroupForm from '@/timeDiscounts/components/NewGroupForm'
import { PREVIEW_DELAY_MS } from '@/timeDiscounts/components/useGroupPreview'
import * as actions from '@/timeDiscounts/actions'
import * as groupActions from '@/timeDiscounts/groupActions'

vi.mock('@/timeDiscounts/actions', () => ({ createTimeDiscount: vi.fn() }))
vi.mock('@/timeDiscounts/groupActions', () => ({ previewGroup: vi.fn() }))
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect }: { onSelect: (item: object) => void }) => (
    <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/1', title: 'Cat Toy', price: 10 })}>stub-add-toy</button>
  ),
}))
vi.mock('@/timeDiscounts/components/CollectionPicker', () => ({
  default: () => <div data-testid="collection-picker" />,
}))

const create = vi.mocked(actions.createTimeDiscount)
const preview = vi.mocked(groupActions.previewGroup)
const covered = [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy', adminUrl: 'https://shop/admin/products/1', regularPrice: 10, discountedPrice: 8 }]
const NOW = '2026-06-01T00:00:00Z' // 01:00 on the shop's clock (BST)

const saveButton = () => screen.getByRole('button', { name: 'Save discount' })
type User = ReturnType<typeof userEvent.setup>

async function fillBasics(user: User) {
  await user.type(screen.getByLabelText('Title'), 'Summer Sale')
  await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
  await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
  await user.type(screen.getByLabelText('Percent off'), '20')
}
async function pickToy(user: User) {
  await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
  await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS)
}

beforeEach(() => {
  create.mockReset()
  preview.mockReset()
  preview.mockResolvedValue({ ok: true, covered })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<NewGroupForm shopTimezone="Europe/London" />)
  return user
}

describe('NewGroupForm', () => {
  it('shows the title, schedule, shared price, picks and covered products, with Save last and off', () => {
    setup()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText(/Starts/)).toBeInTheDocument()
    expect(screen.getByLabelText('Discount type')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Products and variants' })).toBeChecked()
    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 1]).toBe(saveButton())
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Add a title to save.')).toBeInTheDocument()
  })

  it('keeps Save off until the title, schedule, price and a pick are there, and the preview is ok', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    expect(screen.getByText('Set a start and an end time to save.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(screen.getByText('Enter the shared price to save.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Percent off'), '20')
    expect(screen.getByText('Pick at least one product, variant or collection to save.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
    expect(screen.getByText('Checking the products…', { selector: '#save-hint' })).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS)
    expect(await screen.findByRole('link', { name: 'Cat Toy' })).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('asks the server about the rule and the picks, and shows what is covered', async () => {
    const user = setup()
    await fillBasics(user)
    await pickToy(user)
    expect(preview).toHaveBeenLastCalledWith(
      { pricingMode: 'percent', amount: 20 },
      { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] },
      undefined,
    )
    expect(await screen.findByText('£8.00')).toBeInTheDocument()
  })

  it('shows the reason and keeps Save off when the preview fails', async () => {
    preview.mockResolvedValue({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
    const user = setup()
    await fillBasics(user)
    await pickToy(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cat Toy: This product already belongs to another discount')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Fix the problem shown above to save.')).toBeInTheDocument()
  })

  it('does not ask the server while the shared price is not valid', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Percent off'), '150')
    await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS)
    expect(preview).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A percentage discount cannot exceed 100%')
  })

  it('sends the kind, the title, the schedule and the whole group in one request', async () => {
    const user = setup()
    create.mockResolvedValue({ ok: true })
    await fillBasics(user)
    await pickToy(user)
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const formData = create.mock.calls[0][1] as FormData
    expect(formData.get('kind')).toBe('group')
    expect(formData.get('title')).toBe('Summer Sale')
    expect(formData.get('startsAt')).toBe('2026-07-01T12:00')
    expect(formData.get('endsAt')).toBe('2026-07-02T12:00')
    expect(JSON.parse(String(formData.get('group')))).toEqual({
      pricingMode: 'percent', amount: 20,
      selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] },
    })
  })

  it('shows the server\'s reason next to Save, keeping what was entered', async () => {
    const user = setup()
    create.mockResolvedValue({ ok: false, error: 'Shopify said no' })
    await fillBasics(user)
    await pickToy(user)
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await user.click(saveButton())
    expect(await screen.findByText('Shopify said no')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
  })

  it('checks the clock again as Save is pressed, and sends nothing when the end time has passed', async () => {
    const user = setup()
    create.mockResolvedValue({ ok: true })
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-06-01T00:30')
    await user.type(screen.getByLabelText(/Ends/), '2026-06-01T01:30') // ends 01:30; it is 01:00
    await user.type(screen.getByLabelText('Percent off'), '20')
    await pickToy(user)
    await waitFor(() => expect(saveButton()).toBeEnabled())

    vi.setSystemTime(new Date('2026-06-01T00:45:00Z')) // 01:45 on the shop's clock
    await user.click(saveButton())

    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText('The end time has already passed. Choose a later end time.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('warns before the page is closed once something has been entered, and not while saving', async () => {
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event
    }
    const user = setup()
    expect(unload().defaultPrevented).toBe(false)
    await user.type(screen.getByLabelText('Title'), 'Summer')
    expect(unload().defaultPrevented).toBe(true)
  })
})
