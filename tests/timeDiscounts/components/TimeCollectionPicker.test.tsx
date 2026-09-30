// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import TimeCollectionPicker from '@/timeDiscounts/components/TimeCollectionPicker'
import * as pickerActions from '@/timeDiscounts/pickerActions'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TimeCollectionPicker', () => {
  it('renders with no collections selected and no hidden inputs', () => {
    const { container } = render(<TimeCollectionPicker />)
    expect(screen.getByPlaceholderText('Search for a collection to add…')).toBeInTheDocument()
    expect(container.querySelectorAll('input[name="collectionId"]')).toHaveLength(0)
  })

  it('searches after the debounce and adds a result, emitting a hidden collectionId input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountCollectionsAction').mockResolvedValue([
      { id: 'gid://shopify/Collection/1', title: 'Summer Sale' },
    ])
    const onCollectionsChange = vi.fn()

    const { container } = render(<TimeCollectionPicker onCollectionsChange={onCollectionsChange} />)
    await user.type(screen.getByPlaceholderText('Search for a collection to add…'), 'summer')
    await vi.advanceTimersByTimeAsync(300)

    const result = await screen.findByText('Summer Sale')
    await user.pointer({ keys: '[MouseLeft]', target: result })

    expect(container.querySelector('input[name="collectionId"]')).toHaveValue('gid://shopify/Collection/1')
    expect(onCollectionsChange).toHaveBeenLastCalledWith([{ id: 'gid://shopify/Collection/1', title: 'Summer Sale' }])
  })

  it('does not offer an already-selected collection again in search results', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(pickerActions, 'searchTimeDiscountCollectionsAction').mockResolvedValue([
      { id: 'gid://shopify/Collection/1', title: 'Summer Sale' },
    ])

    render(<TimeCollectionPicker initialCollections={[{ id: 'gid://shopify/Collection/1', title: 'Summer Sale' }]} />)
    await user.type(screen.getByPlaceholderText('Search for a collection to add…'), 'summer')
    await vi.advanceTimersByTimeAsync(300)

    expect(screen.queryAllByText('Summer Sale')).toHaveLength(1) // only the already-selected chip, not a second result row
  })

  it('removes a selected collection and its hidden input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(
      <TimeCollectionPicker initialCollections={[{ id: 'gid://shopify/Collection/1', title: 'Summer Sale' }]} />,
    )
    expect(container.querySelector('input[name="collectionId"]')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Summer Sale' }))

    expect(container.querySelectorAll('input[name="collectionId"]')).toHaveLength(0)
  })
})
