// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import GroupDiscountEditor from '@/timeDiscounts/components/GroupDiscountEditor'
import { SavedToastProvider } from '@/components/SavedToast'
import { RULE_SAVE_DELAY_MS } from '@/timeDiscounts/group'
import * as actions from '@/timeDiscounts/actions'
import * as groupActions from '@/timeDiscounts/groupActions'
import type { GroupSelection } from '@/timeDiscounts/config'

vi.mock('@/timeDiscounts/actions', () => ({
  saveTimeDiscountTitle: vi.fn(), saveTimeDiscountSchedule: vi.fn(), saveTimeDiscountItem: vi.fn(), removeTimeDiscountItem: vi.fn(),
}))
vi.mock('@/timeDiscounts/groupActions', () => ({ saveGroupRule: vi.fn(), saveGroupSelection: vi.fn() }))
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect }: { onSelect: (item: object) => void }) => (
    <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/2', title: 'Dog Bed', price: 40 })}>stub-add-bed</button>
  ),
}))
vi.mock('@/timeDiscounts/components/CollectionPicker', () => ({ default: () => <div data-testid="collection-picker" /> }))

const saveRule = vi.mocked(groupActions.saveGroupRule)
const saveSelection = vi.mocked(groupActions.saveGroupSelection)
const saveTitle = vi.mocked(actions.saveTimeDiscountTitle)

const toys: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
const row = (title: string, discounted: number) => ({ productId: 'gid://shopify/Product/1', title, adminUrl: 'https://shop/admin/products/1', regularPrice: 10, discountedPrice: discounted })

function setup(over: Partial<React.ComponentProps<typeof GroupDiscountEditor>> = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const deleteAction = vi.fn().mockResolvedValue(undefined)
  render(
    <SavedToastProvider>
      <GroupDiscountEditor
        discountId="time_disc_1" shopTimezone="Europe/London"
        initialTitle="Summer Sale" initialStartsAt="2026-07-01T12:00" initialEndsAt="2026-07-02T12:00"
        initialPricingMode="percent" initialAmount={20} initialSelection={toys} initialCovered={[row('Cat Toy', 8)]}
        deleteAction={deleteAction} {...over}
      />
    </SavedToastProvider>,
  )
  return { user, deleteAction }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  saveRule.mockResolvedValue({ ok: true, covered: [row('Cat Toy', 7)] })
  saveSelection.mockResolvedValue({ ok: true, covered: [row('Cat Toy', 8)] })
  saveTitle.mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('GroupDiscountEditor — layout', () => {
  it('shows the title, schedule, shared price, picks, covered products and the delete button', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer Sale')
    expect(screen.getByLabelText(/Starts/)).toHaveValue('2026-07-01T12:00')
    expect(screen.getByLabelText('Discount type')).toHaveValue('percent')
    expect(screen.getByLabelText('Percent off')).toHaveValue(20)
    expect(screen.getByRole('radio', { name: 'Products and variants' })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Cat Toy' })).toBeInTheDocument()
    expect(screen.getByText('£8.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument() // autosave: no Save button
  })
})

describe('GroupDiscountEditor — shared price', () => {
  it('saves a new amount after a pause, shows the new prices and the "Saved" pill', async () => {
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await user.type(amount, '30')
    expect(saveRule).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    await waitFor(() => expect(saveRule).toHaveBeenCalledWith('time_disc_1', { pricingMode: 'percent', amount: 30 }))
    expect(await screen.findByText('£7.00')).toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('saves at once when the type changes', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    await vi.advanceTimersByTimeAsync(10)
    await waitFor(() => expect(saveRule).toHaveBeenCalledWith('time_disc_1', { pricingMode: 'fixed', amount: 20 }))
  })

  it('does not save an amount that is empty or not valid, and says why when it is not valid', async () => {
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 2)
    await user.type(amount, '150')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 2)
    expect(saveRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A percentage discount cannot exceed 100%')
  })

  it('shows the server\'s reason inline and keeps what was typed, so it can be fixed', async () => {
    saveRule.mockResolvedValue({ ok: false, error: 'Cat Toy: The fixed price (£30.00) is not lower than the regular price (£10.00)' })
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    await user.clear(screen.getByLabelText('Fixed price'))
    await user.type(screen.getByLabelText('Fixed price'), '30')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cat Toy: The fixed price (£30.00)')
    expect(screen.getByLabelText('Fixed price')).toHaveValue(30)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows the reload message when the request itself is rejected', async () => {
    saveRule.mockRejectedValue(new Error('network'))
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    await vi.advanceTimersByTimeAsync(10)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server — reload the page and try again")
  })
})

describe('GroupDiscountEditor — shared price, refused and restored', () => {
  const REFUSED = 'Cat Toy: This price is not allowed'

  it('hides a refused rule\'s error once the saved value is typed back, without saving again', async () => {
    saveRule.mockResolvedValue({ ok: false, error: REFUSED })
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await user.type(amount, '30')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED)
    expect(saveRule).toHaveBeenCalledTimes(1)

    await user.clear(amount)
    await user.type(amount, '20')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 3)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saveRule).toHaveBeenCalledTimes(1)
  })

  it('does not save when nothing changed, however long it waits', async () => {
    setup()
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 5)
    expect(saveRule).not.toHaveBeenCalled()
  })

  it('does not save when the amount is changed and changed back before the pause ends', async () => {
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await user.type(amount, '30')
    await user.clear(amount)
    await user.type(amount, '20')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 3)
    expect(saveRule).not.toHaveBeenCalled()
  })

  it('lets a refused rule be retried with a different amount, which clears the error', async () => {
    saveRule.mockResolvedValueOnce({ ok: false, error: REFUSED })
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await user.type(amount, '30')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED)

    await user.clear(amount)
    await user.type(amount, '25')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    await waitFor(() => expect(saveRule).toHaveBeenLastCalledWith('time_disc_1', { pricingMode: 'percent', amount: 25 }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps showing the error while the refused rule itself is still typed', async () => {
    saveRule.mockResolvedValue({ ok: false, error: REFUSED })
    const { user } = setup()
    const amount = screen.getByLabelText('Percent off')
    await user.clear(amount)
    await user.type(amount, '30')
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS)
    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED)
    await vi.advanceTimersByTimeAsync(RULE_SAVE_DELAY_MS * 3)
    expect(screen.getByRole('alert')).toHaveTextContent(REFUSED)
  })
})

describe('GroupDiscountEditor — picks', () => {
  it('saves a newly picked product at once and shows what it now covers', async () => {
    const { user } = setup()
    saveSelection.mockResolvedValue({ ok: true, covered: [row('Cat Toy', 8), { ...row('Dog Bed', 32), productId: 'gid://shopify/Product/2' }] })
    await user.click(screen.getByRole('button', { name: 'stub-add-bed' }))

    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith('time_disc_1', {
      mode: 'products', members: [...toys.members, { productId: 'gid://shopify/Product/2', title: 'Dog Bed' }],
    }))
    expect(await screen.findByRole('link', { name: 'Dog Bed' })).toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('removes a pick after confirming, and does nothing when declined', async () => {
    const { user } = setup()
    saveSelection.mockResolvedValue({ ok: true, covered: [] })
    await user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Cat Toy from this discount?')
    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith('time_disc_1', { mode: 'products', members: [] }))

    saveSelection.mockClear()
    cleanup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const second = setup()
    await second.user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(saveSelection).not.toHaveBeenCalled()
  })

  it('puts the picks back and shows the reason when the server refuses a change', async () => {
    saveSelection.mockResolvedValue({ ok: false, error: 'Dog Bed: This product already belongs to another discount' })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'stub-add-bed' }))

    expect(await screen.findByText('Dog Bed: This product already belongs to another discount')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Dog Bed' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Cat Toy' })).toBeInTheDocument()
  })

  it('switching to collections replaces the picks (after confirming) and saves the empty selection', async () => {
    const { user } = setup()
    saveSelection.mockResolvedValue({ ok: true, covered: [] })
    await user.click(screen.getByRole('radio', { name: 'Collections' }))
    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith('time_disc_1', { mode: 'collections', collections: [] }))
    expect(screen.getByTestId('collection-picker')).toBeInTheDocument()
  })
})

describe('GroupDiscountEditor — title and delete', () => {
  it('saves the title when its box loses focus', async () => {
    const { user } = setup()
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Winter Sale')
    await user.tab()
    await waitFor(() => expect(saveTitle).toHaveBeenCalledWith('time_disc_1', 'Winter Sale'))
  })

  it('asks before deleting the whole discount, then runs the delete action', async () => {
    const { user, deleteAction } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith('Delete this discount entirely? This cannot be undone.')
    await waitFor(() => expect(deleteAction).toHaveBeenCalled())
  })
})
