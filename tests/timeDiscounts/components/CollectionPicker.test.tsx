// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import CollectionPicker from '@/timeDiscounts/components/CollectionPicker'
import * as pickerActions from '@/timeDiscounts/pickerActions'

const SUMMER = { id: 'gid://shopify/Collection/1', title: 'Summer' }
const WINTER = { id: 'gid://shopify/Collection/2', title: 'Winter' }
const SEARCH = 'Search for a collection to add…'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function search(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText(SEARCH), text)
  await vi.advanceTimersByTimeAsync(300)
}

describe('CollectionPicker', () => {
  it('shows each picked collection as a chip', () => {
    render(<CollectionPicker selected={[SUMMER]} onChange={() => {}} />)
    expect(screen.getByText('Summer')).toBeInTheDocument()
  })

  it('searches after a pause, hides collections already picked, and adds the chosen one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const searchAction = vi.spyOn(pickerActions, 'searchTimeDiscountCollectionsAction').mockResolvedValue([SUMMER, WINTER])
    const onChange = vi.fn()
    render(<CollectionPicker selected={[SUMMER]} onChange={onChange} />)

    await search(user, 'sea')
    expect(searchAction).toHaveBeenCalledWith('sea')
    const options = within(await screen.findByRole('list')).getAllByRole('button')
    expect(options.map((o) => o.textContent)).toEqual(['Winter']) // Summer is already a chip, not an option
    await user.pointer({ keys: '[MouseLeft]', target: options[0] })
    expect(onChange).toHaveBeenCalledWith([SUMMER, WINTER])
  })

  it('does not search for fewer than two characters', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const searchAction = vi.spyOn(pickerActions, 'searchTimeDiscountCollectionsAction').mockResolvedValue([])
    render(<CollectionPicker selected={[]} onChange={() => {}} />)
    await search(user, 's')
    expect(searchAction).not.toHaveBeenCalled()
  })

  it('removes a collection after confirming, and keeps it when declined', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onChange = vi.fn()
    render(<CollectionPicker selected={[SUMMER, WINTER]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove Summer' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Summer from this discount?')
    expect(onChange).toHaveBeenCalledWith([WINTER])

    onChange.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Remove Winter' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
