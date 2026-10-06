// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import TimeDiscountEditor, { SCHEDULE_SAVE_DELAY_MS } from '@/timeDiscounts/components/TimeDiscountEditor'
import { SavedToastProvider } from '@/components/SavedToast'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import * as actions from '@/timeDiscounts/actions'

vi.mock('@/timeDiscounts/actions', () => ({
  saveTimeDiscountTitle: vi.fn(),
  saveTimeDiscountSchedule: vi.fn(),
  saveTimeDiscountItem: vi.fn(),
  removeTimeDiscountItem: vi.fn(),
}))

// The search box has its own tests; here it is a button that picks a fixed product.
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect, existingKeys }: { onSelect: (item: object) => void; existingKeys: string[] }) => (
    <div data-testid="picker" data-existing={existingKeys.join(',')}>
      <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/3', title: 'New Bed', price: 30 })}>stub-add</button>
    </div>
  ),
}))

const BASE = 'https://shop.myshopify.com/admin/products/'
const rows: DisplayRow[] = [
  { productId: 'gid://shopify/Product/1', title: 'Scruffs Boucle Cat Bed', adminUrl: `${BASE}1`, regularPrice: 49.99, pricingMode: 'fixed', amount: 22 },
  { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Roll Up Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 22, pricingMode: 'percent', amount: 20 },
]

const ok = { ok: true as const }
const mocked = vi.mocked(actions)

function setup(props: Partial<React.ComponentProps<typeof TimeDiscountEditor>> = {}) {
  const deleteAction = vi.fn().mockResolvedValue(undefined)
  render(
    <SavedToastProvider>
      <TimeDiscountEditor
        discountId="time_disc_1" shopTimezone="Europe/London" adminProductBaseUrl={BASE}
        initialTitle="Summer Sale" initialStartsAt="2026-07-01T12:00" initialEndsAt="2026-07-02T12:00"
        initialRows={rows} deleteAction={deleteAction}
        {...props}
      />
    </SavedToastProvider>,
  )
  return { deleteAction }
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocked.saveTimeDiscountTitle.mockResolvedValue(ok)
  mocked.saveTimeDiscountSchedule.mockResolvedValue(ok)
  mocked.saveTimeDiscountItem.mockResolvedValue(ok)
  mocked.removeTimeDiscountItem.mockResolvedValue(ok)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const userNow = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('TimeDiscountEditor — layout', () => {
  it('shows title, schedule, then the products table, then Delete', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
    expect(screen.getByLabelText(/Starts/)).toHaveValue('2026-07-01T12:00')
    expect(screen.getByLabelText(/Ends/)).toHaveValue('2026-07-02T12:00')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Product', 'Discount type', 'Discounted price', 'Regular price', 'Edit', 'Delete'])
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toHaveAttribute('href', `${BASE}1`)
    expect(within(rowOf('Scruffs Boucle Cat Bed')).getByText('£22.00')).toBeInTheDocument()
    expect(within(rowOf('Roll Up Bed – Grey')).getByText('£17.60')).toBeInTheDocument()
    const order = ['Title', 'Schedule', 'Products'].map((name) => screen.getByText(name, { selector: 'label, h2' }))
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('has no page-wide Save button', () => {
    setup()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })

  it('invites you to add a product when there are no rows', () => {
    setup({ initialRows: [] })
    expect(screen.getByText('No products yet — add one below.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('tells the picker which rows already exist, so they are not offered again', () => {
    setup()
    expect(screen.getByTestId('picker').dataset.existing).toBe('gid://shopify/Product/1|,gid://shopify/Product/2|gid://shopify/ProductVariant/20')
  })
})

describe('TimeDiscountEditor — title', () => {
  it('saves when the field loses focus, then shows the Saved pill', async () => {
    const user = userNow()
    setup()
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), '  Winter Sale ')
    await user.tab()

    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledWith('time_disc_1', 'Winter Sale')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Winter Sale')
  })

  it('does not save an unchanged title', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByLabelText('Title'))
    await user.tab()
    expect(mocked.saveTimeDiscountTitle).not.toHaveBeenCalled()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('does not save an empty title and says one is required', async () => {
    const user = userNow()
    setup()
    await user.clear(screen.getByLabelText('Title'))
    await user.tab()
    expect(mocked.saveTimeDiscountTitle).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A title is required')
  })

  it('shows a server error inline and no Saved pill', async () => {
    const user = userNow()
    mocked.saveTimeDiscountTitle.mockResolvedValue({ ok: false, error: 'Shopify said no' })
    setup()
    await user.type(screen.getByLabelText('Title'), '!')
    await user.tab()
    expect(await screen.findByText('Shopify said no')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — schedule', () => {
  async function changeEnd(user: ReturnType<typeof userNow>, value: string) {
    const input = screen.getByLabelText(/Ends/)
    await user.clear(input)
    await user.type(input, value)
  }

  it('saves once after the dates settle, then shows the Saved pill', async () => {
    const user = userNow()
    setup()
    await changeEnd(user, '2026-07-03T12:00')
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })

    expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledTimes(1)
    expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledWith('time_disc_1', '2026-07-01T12:00', '2026-07-03T12:00')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('does not save an end that is not after the start, and says so', async () => {
    const user = userNow()
    setup()
    await changeEnd(user, '2026-06-30T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS * 2) })
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.')
  })

  it('does not save when the dates are unchanged', async () => {
    setup()
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS * 2) })
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()
  })

  it('shows a server error inline', async () => {
    const user = userNow()
    mocked.saveTimeDiscountSchedule.mockResolvedValue({ ok: false, error: 'Could not update' })
    setup()
    await changeEnd(user, '2026-07-03T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })
    expect(await screen.findByText('Could not update')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — editing a row', () => {
  it('turns the row into an inline form, saves the new rule, and shows the Saved pill', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '50')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', {
      productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'percent', amount: 50,
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const row = rowOf('Roll Up Bed – Grey')
    expect(within(row).getByText('50% off')).toBeInTheDocument()
    expect(within(row).getByText('£11.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('keeps the form open and shows the reason inline when the server refuses the save', async () => {
    const user = userNow()
    mocked.saveTimeDiscountItem.mockResolvedValue({ ok: false, error: 'This discount has too many products/variants' })
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('This discount has too many products/variants')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('cancel restores the saved rule without calling the server', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '99')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled()
    expect(within(rowOf('Roll Up Bed – Grey')).getByText('20% off')).toBeInTheDocument()
  })

  it('edits one row at a time', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.click(screen.getByRole('button', { name: 'Edit Scruffs Boucle Cat Bed' }))
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    expect(screen.getByLabelText('Fixed price for Scruffs Boucle Cat Bed')).toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — adding a row', () => {
  it('appends the product already in edit mode with an empty amount, and saves it from its own Save button', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))

    const row = rowOf('New Bed')
    expect(within(row).getByLabelText(/Percent off for New Bed/)).toHaveValue(null)
    expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled() // never saved until Save is pressed
    expect(screen.getByRole('link', { name: 'New Bed' })).toHaveAttribute('href', `${BASE}3`)

    await user.type(within(row).getByLabelText(/Percent off for New Bed/), '10')
    await user.click(within(row).getByRole('button', { name: 'Save' }))

    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', { productId: 'gid://shopify/Product/3', variantId: undefined, pricingMode: 'percent', amount: 10 })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(within(rowOf('New Bed')).getByText('£27.00')).toBeInTheDocument()
  })

  it('removes an added row again if it is cancelled before saving', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))
    await user.click(within(rowOf('New Bed')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('link', { name: 'New Bed' })).not.toBeInTheDocument()
    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled()
  })

  it('keeps an added row with its error when the server refuses it', async () => {
    const user = userNow()
    mocked.saveTimeDiscountItem.mockResolvedValue({ ok: false, error: 'This product already belongs to another discount' })
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))
    await user.type(within(rowOf('New Bed')).getByLabelText(/Percent off for New Bed/), '10')
    await user.click(within(rowOf('New Bed')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This product already belongs to another discount')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New Bed' })).toBeInTheDocument()
  })
})

describe('TimeDiscountEditor — deleting', () => {
  it('asks for confirmation, and does nothing when declined', async () => {
    const user = userNow()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Scruffs Boucle Cat Bed' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Scruffs Boucle Cat Bed from this discount?')
    expect(mocked.removeTimeDiscountItem).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toBeInTheDocument()
  })

  it('removes the row, tells the server, and shows the Saved pill when confirmed', async () => {
    const user = userNow()
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Roll Up Bed – Grey' }))
    expect(mocked.removeTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Roll Up Bed – Grey' })).not.toBeInTheDocument()
  })

  it('keeps the row and shows the reason when the server refuses', async () => {
    const user = userNow()
    mocked.removeTimeDiscountItem.mockResolvedValue({ ok: false, error: 'Shopify said no' })
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Scruffs Boucle Cat Bed' }))
    expect(await screen.findByText('Shopify said no')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toBeInTheDocument()
  })

  it('deleting the whole discount asks for confirmation first', async () => {
    const user = userNow()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { deleteAction } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith('Delete this discount entirely? This cannot be undone.')
    expect(deleteAction).not.toHaveBeenCalled()
  })

  it('deletes the whole discount once confirmed', async () => {
    const user = userNow()
    const { deleteAction } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteAction).toHaveBeenCalledTimes(1)
  })
})

describe('TimeDiscountEditor — saving one request at a time', () => {
  it('does not start a row save until the title save has finished', async () => {
    const user = userNow()
    let finishTitle!: (value: { ok: true }) => void
    mocked.saveTimeDiscountTitle.mockReturnValue(new Promise((resolve) => { finishTitle = resolve }))
    setup()

    await user.type(screen.getByLabelText('Title'), '!')
    await user.tab() // title save starts and stays in flight
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledTimes(1)
    expect(mocked.saveTimeDiscountItem).not.toHaveBeenCalled()

    await act(async () => { finishTitle({ ok: true }) })
    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledTimes(1)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('TimeDiscountEditor — races while a save is in flight', () => {
  it('keeps a new row whose save is in flight, locks the other rows, and does not close a different edit', async () => {
    const user = userNow()
    const pending = deferred<{ ok: true }>()
    mocked.saveTimeDiscountItem.mockReturnValue(pending.promise)
    setup()
    await user.click(screen.getByRole('button', { name: 'stub-add' }))
    await user.type(within(rowOf('New Bed')).getByLabelText(/Percent off for New Bed/), '20')
    await user.click(within(rowOf('New Bed')).getByRole('button', { name: 'Save' }))
    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: 'Edit Scruffs Boucle Cat Bed' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Roll Up Bed – Grey' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'stub-add' })) // picking again must not discard the in-flight row
    expect(screen.getAllByRole('link', { name: 'New Bed' })).toHaveLength(1)

    await act(async () => { pending.resolve({ ok: true }) })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const row = rowOf('New Bed')
    expect(within(row).getByText('20% off')).toBeInTheDocument()
    expect(within(row).getByText('£24.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Scruffs Boucle Cat Bed' })).toBeEnabled()
  })

  it('saves the schedule again when it is changed back while the earlier change is still being saved', async () => {
    const user = userNow()
    const pending = deferred<{ ok: true }>()
    mocked.saveTimeDiscountSchedule.mockReturnValueOnce(pending.promise)
    setup()
    const end = screen.getByLabelText(/Ends/)

    await user.clear(end)
    await user.type(end, '2026-07-03T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })
    expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledTimes(1) // save B, still pending

    await user.clear(end)
    await user.type(end, '2026-07-02T12:00') // back to the schedule that was first loaded
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })
    await act(async () => { pending.resolve({ ok: true }) })

    await waitFor(() => expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledTimes(2))
    expect(mocked.saveTimeDiscountSchedule).toHaveBeenLastCalledWith('time_disc_1', '2026-07-01T12:00', '2026-07-02T12:00')
  })

  it('saves the title again when it is restored while the earlier change is still being saved', async () => {
    const user = userNow()
    const pending = deferred<{ ok: true }>()
    mocked.saveTimeDiscountTitle.mockReturnValueOnce(pending.promise)
    setup()
    const title = screen.getByLabelText('Title')

    await user.clear(title)
    await user.type(title, 'Winter Sale')
    await user.tab()
    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledTimes(1) // pending

    await user.clear(title)
    await user.type(title, 'Summer Sale')
    await user.tab()
    await act(async () => { pending.resolve({ ok: true }) })

    await waitFor(() => expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledTimes(2))
    expect(mocked.saveTimeDiscountTitle).toHaveBeenLastCalledWith('time_disc_1', 'Summer Sale')
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
  })

  it('does not run Delete until the saves ahead of it have finished', async () => {
    const user = userNow()
    const pending = deferred<{ ok: true }>()
    mocked.saveTimeDiscountTitle.mockReturnValue(pending.promise)
    const { deleteAction } = setup()

    await user.type(screen.getByLabelText('Title'), '!')
    await user.tab() // title save in flight
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteAction).not.toHaveBeenCalled()

    await act(async () => { pending.resolve({ ok: true }) })
    await waitFor(() => expect(deleteAction).toHaveBeenCalledTimes(1))
  })
})

const UNREACHABLE = "Couldn't reach the server — reload the page and try again"

describe('TimeDiscountEditor — a rejected server call', () => {
  it('title: shows the error and lets the same value be retried', async () => {
    const user = userNow()
    mocked.saveTimeDiscountTitle.mockRejectedValueOnce(new Error('network'))
    setup()
    await user.type(screen.getByLabelText('Title'), '!')
    await user.tab()
    expect(await screen.findByText(UNREACHABLE)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Title'))
    await user.tab() // same value again
    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument() // a stale error does not sit beside a live title
  })

  it('schedule: shows the error and does not claim it is saved', async () => {
    const user = userNow()
    mocked.saveTimeDiscountSchedule.mockRejectedValueOnce(new Error('network'))
    setup()
    const end = screen.getByLabelText(/Ends/)
    await user.clear(end)
    await user.type(end, '2026-07-03T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS) })
    expect(await screen.findByText(UNREACHABLE)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('row save: shows the error, keeps the form open and unlocks the table', async () => {
    const user = userNow()
    mocked.saveTimeDiscountItem.mockRejectedValueOnce(new Error('network'))
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit Roll Up Bed – Grey' }))
    await user.clear(screen.getByLabelText(/Percent off for/))
    await user.type(screen.getByLabelText(/Percent off for/), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(UNREACHABLE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Scruffs Boucle Cat Bed' })).toBeEnabled()
  })

  it('row delete: shows the error, keeps the row and unlocks the table', async () => {
    const user = userNow()
    mocked.removeTimeDiscountItem.mockRejectedValueOnce(new Error('network'))
    setup()
    await user.click(screen.getByRole('button', { name: 'Delete Scruffs Boucle Cat Bed' }))

    expect(await screen.findByText(UNREACHABLE)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scruffs Boucle Cat Bed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Roll Up Bed – Grey' })).toBeEnabled()
  })
})

describe('TimeDiscountEditor — implausible years', () => {
  it('does not save a half-typed year and says why', async () => {
    const user = userNow()
    setup()
    const start = screen.getByLabelText(/Starts/)
    await user.clear(start)
    await user.type(start, '0202-07-01T12:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(SCHEDULE_SAVE_DELAY_MS * 2) })
    expect(mocked.saveTimeDiscountSchedule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a year between 2000 and 2100.')
  })
})
