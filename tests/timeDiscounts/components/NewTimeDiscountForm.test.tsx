// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'
import * as actions from '@/timeDiscounts/actions'

vi.mock('@/timeDiscounts/actions', () => ({ createTimeDiscount: vi.fn() }))

// The search box has its own tests; here it is a button that picks fixed products.
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect, existingKeys }: { onSelect: (item: object) => void; existingKeys: string[] }) => (
    <div data-existing={existingKeys.join(',')}>
      <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/1', title: 'Cat Toy', price: 10 })}>stub-add-toy</button>
      <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Dog Bed – Grey', price: 40 })}>stub-add-bed</button>
    </div>
  ),
}))

const BASE = 'https://shop.myshopify.com/admin/products/'
const create = vi.mocked(actions.createTimeDiscount)

function setup() {
  return render(<NewTimeDiscountForm shopTimezone="Europe/London" adminProductBaseUrl={BASE} />)
}

const saveButton = () => screen.getByRole('button', { name: 'Save discount' })

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Summer Sale')
  await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
  await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
}

/** Adds the stub product and keeps it as a 20% row. */
async function addKeptRow(user: ReturnType<typeof userEvent.setup>, which: 'toy' | 'bed' = 'toy') {
  await user.click(screen.getByRole('button', { name: `stub-add-${which}` }))
  await user.type(screen.getByRole('spinbutton'), '20')
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

beforeEach(() => {
  create.mockReset()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(cleanup)

describe('NewTimeDiscountForm', () => {
  it('shows the title, the schedule and the products table, with the Save button last', () => {
    setup()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText(/Starts/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Ends/)).toBeInTheDocument()
    expect(screen.getByText('No products yet — add one below.')).toBeInTheDocument()
    expect(screen.queryByText(/next screen/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create discount' })).not.toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 1]).toBe(saveButton())
  })

  it('keeps Save disabled until there is a title, a schedule and at least one product, and says what is missing', async () => {
    const user = userEvent.setup()
    setup()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Add a title to save.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Set a start and an end time to save.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Add at least one product to save.')).toBeInTheDocument()

    await addKeptRow(user)
    expect(saveButton()).toBeEnabled()
    expect(screen.queryByText(/to save\.$/)).not.toBeInTheDocument()
  })

  it('keeps Save disabled while a row is still being edited', async () => {
    const user = userEvent.setup()
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(screen.getByRole('button', { name: 'stub-add-bed' })) // a second row opens in edit mode

    expect(saveButton()).toBeDisabled()
    expect(screen.getByText("Save or cancel the row you're editing.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(saveButton()).toBeEnabled()
  })

  it('does not call the server when a row is kept — only when Save is pressed', async () => {
    const user = userEvent.setup()
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText('Cat Toy')).toBeInTheDocument()
    expect(screen.getByText('20% off')).toBeInTheDocument()
  })

  it('sends the title, the schedule and every kept row in one request', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: true })
    setup()
    await fillBasics(user)
    await addKeptRow(user, 'toy')
    await addKeptRow(user, 'bed')
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const formData = create.mock.calls[0][1] as FormData
    expect(formData.get('title')).toBe('Summer Sale')
    expect(formData.get('startsAt')).toBe('2026-07-01T12:00')
    expect(formData.get('endsAt')).toBe('2026-07-02T12:00')
    expect(JSON.parse(String(formData.get('items')))).toEqual([
      { productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'percent', amount: 20 },
    ])
  })

  it('shows the server\'s reason next to Save and keeps everything that was entered', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Cat Toy: This product already belongs to another discount')
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
    expect(screen.getByText('Cat Toy')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled() // can be retried after fixing
  })

  it('shows a reload message when the request itself is rejected', async () => {
    const user = userEvent.setup()
    create.mockRejectedValue(new Error('network down'))
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server — reload the page and try again")
    expect(saveButton()).toBeEnabled()
  })

  it('disables Save and says "Saving…" while the request runs', async () => {
    const user = userEvent.setup()
    let finish: (value: { ok: true }) => void = () => {}
    create.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(saveButton())

    const busy = await screen.findByRole('button', { name: 'Saving…' })
    expect(busy).toBeDisabled()
    finish({ ok: true })
  })

  it('disables Save again when the only row is removed (after confirming)', async () => {
    const user = userEvent.setup()
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    expect(saveButton()).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Delete Cat Toy' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Cat Toy from this discount?')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Add at least one product to save.')).toBeInTheDocument()
  })

  it('keeps the row when the removal is not confirmed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(screen.getByRole('button', { name: 'Delete Cat Toy' }))
    expect(screen.getByText('Cat Toy')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('lets a kept row be edited again and sends the new rule', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: true })
    setup()
    await fillBasics(user)
    await addKeptRow(user)
    await user.click(screen.getByRole('button', { name: 'Edit Cat Toy' }))
    const amount = screen.getByRole('spinbutton')
    await user.clear(amount)
    await user.type(amount, '35')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(JSON.parse(String((create.mock.calls[0][1] as FormData).get('items')))).toEqual([
      { productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 35 },
    ])
  })

  it('rejects a fixed price that is not lower than the regular price inside the row, as the discount page does', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add-toy' }))
    await user.selectOptions(screen.getByRole('combobox'), 'fixed')
    await user.type(screen.getByRole('spinbutton'), '12')
    expect(screen.getByRole('alert')).toHaveTextContent('£10.00')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('says when the end is not after the start, and keeps Save disabled', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-02T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-01T12:00')
    await addKeptRow(user)
    expect(screen.getByText('End must be after start.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('does not accept a half-typed year', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    await user.type(screen.getByLabelText(/Starts/), '0202-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    await addKeptRow(user)
    expect(screen.getByText('Enter a year between 2000 and 2100.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('stays disabled for a blank title', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Title'), '   ')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    await addKeptRow(user)
    expect(saveButton()).toBeDisabled()
  })

  it('keeps products already added out of the picker', async () => {
    const user = userEvent.setup()
    const { container } = setup()
    await fillBasics(user)
    await addKeptRow(user)
    expect(container.querySelector('[data-existing]')).toHaveAttribute('data-existing', 'gid://shopify/Product/1|')
  })

  describe('leaving the page with work in it', () => {
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event
    }

    it('warns before the page is closed or reloaded once something has been entered', async () => {
      const user = userEvent.setup()
      setup()
      expect(unload().defaultPrevented).toBe(false) // nothing to lose yet

      await user.type(screen.getByLabelText('Title'), 'Summer')
      expect(unload().defaultPrevented).toBe(true)
    })

    it('does not warn while the discount is being saved', async () => {
      const user = userEvent.setup()
      create.mockReturnValue(new Promise(() => {}))
      setup()
      await fillBasics(user)
      await addKeptRow(user)
      await user.click(saveButton())
      await screen.findByRole('button', { name: 'Saving…' })
      expect(unload().defaultPrevented).toBe(false)
    })
  })
})
