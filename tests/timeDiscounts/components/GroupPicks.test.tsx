// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import GroupPicks from '@/timeDiscounts/components/GroupPicks'
import type { GroupSelection } from '@/timeDiscounts/config'

// The search boxes have their own tests; here they are buttons that pick fixed things.
vi.mock('@/timeDiscounts/components/AddItemPicker', () => ({
  default: ({ onSelect, existingKeys }: { onSelect: (item: object) => void; existingKeys: string[] }) => (
    <div data-testid="item-picker" data-existing={existingKeys.join(',')}>
      <button type="button" onClick={() => onSelect({ productId: 'gid://shopify/Product/2', title: 'Dog Bed', price: 40 })}>stub-add-bed</button>
    </div>
  ),
}))
vi.mock('@/timeDiscounts/components/CollectionPicker', () => ({
  default: ({ selected, onChange }: { selected: { id: string; title: string }[]; onChange: (next: object[]) => void }) => (
    <div data-testid="collection-picker">
      <span>{selected.length} collections</span>
      <button type="button" onClick={() => onChange([...selected, { id: 'gid://shopify/Collection/1', title: 'Summer' }])}>stub-add-collection</button>
    </div>
  ),
}))

const toys: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
const summer: GroupSelection = { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] }

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(cleanup)

describe('GroupPicks', () => {
  it('in products mode shows chips and the product search, with picked products kept out of it', () => {
    render(<GroupPicks selection={toys} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Products and variants' })).toBeChecked()
    expect(screen.getByText('Cat Toy')).toBeInTheDocument()
    expect(screen.getByTestId('item-picker')).toHaveAttribute('data-existing', 'gid://shopify/Product/1|')
    expect(screen.queryByTestId('collection-picker')).not.toBeInTheDocument()
  })

  it('adds a picked product with its title', async () => {
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'stub-add-bed' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'products', members: [...toys.members, { productId: 'gid://shopify/Product/2', title: 'Dog Bed' }] })
  })

  it('removes a product after confirming, and keeps it when declined', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove Cat Toy from this discount?')
    expect(onChange).toHaveBeenCalledWith({ mode: 'products', members: [] })

    onChange.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Remove Cat Toy' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('in collections mode shows the collection picker and turns its changes into a selection', async () => {
    const onChange = vi.fn()
    render(<GroupPicks selection={summer} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Collections' })).toBeChecked()
    expect(screen.queryByTestId('item-picker')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'stub-add-collection' }))
    expect(onChange).toHaveBeenCalledWith({
      mode: 'collections',
      collections: [summer.collections[0], { id: 'gid://shopify/Collection/1', title: 'Summer' }],
    })
  })

  it('switching mode with picks asks first, and starts an empty selection of the other mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Collections' }))
    expect(window.confirm).toHaveBeenCalledWith('Switching replaces your current picks. Continue?')
    expect(onChange).toHaveBeenCalledWith({ mode: 'collections', collections: [] })
  })

  it('does not switch when the question is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onChange = vi.fn()
    render(<GroupPicks selection={toys} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Collections' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches without asking when nothing is picked yet', async () => {
    const onChange = vi.fn()
    render(<GroupPicks selection={{ mode: 'products', members: [] }} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Collections' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith({ mode: 'collections', collections: [] })
  })
})
