// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ProductSearch, { type ProductSearchTools } from '@/form/components/ProductSearch'
import { addMemberOnce, type SelectedMember } from '@/form/memberSelection'

const TUNA = { id: 'p1', title: 'Tuna Soup', variantCount: 1, imageUrl: 'https://cdn.example/tuna.png' }
const CHEWS = { id: 'p2', title: 'Joint Chews', variantCount: 2, imageUrl: null }
const CHEWS_OPTIONS = [
  { variantId: 'v1', title: '90 Chews', price: 32 },
  { variantId: 'v2', title: '180 Chews', price: 58 },
]

function buildTools(overrides: Partial<ProductSearchTools> = {}): ProductSearchTools {
  return {
    findProducts: vi.fn().mockResolvedValue([TUNA, CHEWS]),
    listProducts: vi.fn().mockResolvedValue([TUNA]),
    findVariants: vi.fn().mockImplementation(async ({ productId }: { productId: string }) => (productId === 'p2' ? CHEWS_OPTIONS : [{ variantId: 'v9', title: 'Default Title', price: 1.5 }])),
    checkMember: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

// Holds the chosen members the way the products card does.
function Harness({ tools, onAdd, initial = [] }: { tools: ProductSearchTools; onAdd: (member: SelectedMember) => void; initial?: SelectedMember[] }) {
  const [members, setMembers] = useState<SelectedMember[]>(initial)
  return (
    <ProductSearch
      members={members}
      currencyCode="USD"
      excludeDiscountId="disc_1"
      delayMs={300}
      tools={tools}
      onAddMember={(member) => { onAdd(member); setMembers((current) => addMemberOnce({ members: current, member })) }}
    />
  )
}

async function type(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search products or variants' }), { target: { value } })
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('ProductSearch: searching', () => {
  it('searches after a pause in typing and lists the results', async () => {
    const tools = buildTools()
    render(<Harness tools={tools} onAdd={() => {}} />)
    await type('tu')
    expect(tools.findProducts).toHaveBeenCalledWith({ query: 'tu' })
    expect(screen.getByRole('button', { name: 'Tuna Soup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Joint Chews (2 variants)' })).toBeInTheDocument()
  })

  it('does not search for fewer than 2 characters', async () => {
    const tools = buildTools()
    render(<Harness tools={tools} onAdd={() => {}} />)
    await type('t')
    expect(tools.findProducts).not.toHaveBeenCalled()
  })

  it('searches only for the last thing typed', async () => {
    const tools = buildTools()
    render(<Harness tools={tools} onAdd={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Search products or variants' })
    fireEvent.change(input, { target: { value: 'tu' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    fireEvent.change(input, { target: { value: 'tuna' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(tools.findProducts).toHaveBeenCalledTimes(1)
    expect(tools.findProducts).toHaveBeenCalledWith({ query: 'tuna' })
  })

  it('lists the shop products from Browse, and clears the field', async () => {
    const tools = buildTools()
    render(<Harness tools={tools} onAdd={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    await settle()
    expect(tools.listProducts).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Tuna Soup' })).toBeInTheDocument()
  })

  it('closes the list and empties the field from the clear button', async () => {
    render(<Harness tools={buildTools()} onAdd={() => {}} />)
    await type('tu')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.queryByRole('button', { name: 'Tuna Soup' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Search products or variants' })).toHaveValue('')
  })

  it('does not offer a product that is already chosen', async () => {
    const chosen: SelectedMember = { productId: 'p1', productTitle: 'Tuna Soup', price: 1.5, imageUrl: null }
    render(<Harness tools={buildTools()} onAdd={() => {}} initial={[chosen]} />)
    await type('tu')
    expect(screen.queryByRole('button', { name: 'Tuna Soup' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Joint Chews (2 variants)' })).toBeInTheDocument()
  })
})

describe('ProductSearch: adding a product', () => {
  it('adds a single-variant product with its price and image', async () => {
    const onAdd = vi.fn()
    const tools = buildTools()
    render(<Harness tools={tools} onAdd={onAdd} />)
    await type('tu')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Tuna Soup' }))
    await settle()
    expect(tools.checkMember).toHaveBeenCalledWith({ productId: 'p1', excludeDiscountId: 'disc_1' })
    expect(onAdd).toHaveBeenCalledWith({ productId: 'p1', productTitle: 'Tuna Soup', price: 1.5, imageUrl: 'https://cdn.example/tuna.png' })
    expect(screen.queryByRole('button', { name: 'Tuna Soup' })).toBeNull()
  })

  it('shows why a product cannot be added and adds nothing', async () => {
    const onAdd = vi.fn()
    const tools = buildTools({ checkMember: vi.fn().mockResolvedValue({ ok: false, error: 'This product already belongs to another discount' }) })
    render(<Harness tools={tools} onAdd={onAdd} />)
    await type('tu')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Tuna Soup' }))
    await settle()
    expect(screen.getByText('This product already belongs to another discount')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('ProductSearch: choosing variants', () => {
  async function openChews(onAdd = vi.fn(), tools = buildTools()) {
    render(<Harness tools={tools} onAdd={onAdd} />)
    await type('jo')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Joint Chews (2 variants)' }))
    await settle()
    return { onAdd, tools }
  }

  it('lists the variants of a multi-variant product', async () => {
    await openChews()
    expect(screen.getByText('Joint Chews: choose variants')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '90 Chews — $32.00' })).toBeInTheDocument()
  })

  it('adds a chosen variant with its titles and price, and keeps the rest to choose from', async () => {
    const { onAdd, tools } = await openChews()
    fireEvent.click(screen.getByRole('button', { name: '180 Chews — $58.00' }))
    await settle()
    expect(tools.checkMember).toHaveBeenCalledWith({ productId: 'p2', variantId: 'v2', excludeDiscountId: 'disc_1' })
    expect(onAdd).toHaveBeenCalledWith({ productId: 'p2', variantId: 'v2', productTitle: 'Joint Chews', variantTitle: '180 Chews', price: 58, imageUrl: null })
    expect(screen.queryByRole('button', { name: '180 Chews — $58.00' })).toBeNull()
    expect(screen.getByRole('button', { name: '90 Chews — $32.00' })).toBeInTheDocument()
  })

  it('closes the list once every variant is chosen', async () => {
    await openChews()
    fireEvent.click(screen.getByRole('button', { name: '90 Chews — $32.00' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '180 Chews — $58.00' }))
    await settle()
    expect(screen.queryByText('Joint Chews: choose variants')).toBeNull()
  })

  it('closes the list from Done', async () => {
    await openChews()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('Joint Chews: choose variants')).toBeNull()
  })

  it('shows why a variant cannot be added', async () => {
    const onAdd = vi.fn()
    const tools = buildTools({ checkMember: vi.fn().mockResolvedValue({ ok: false, error: 'This variant already belongs to another discount' }) })
    await openChews(onAdd, tools)
    fireEvent.click(screen.getByRole('button', { name: '90 Chews — $32.00' }))
    await settle()
    expect(screen.getByText('This variant already belongs to another discount')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
