// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FixedTierRow from '@/form/components/FixedTierRow'
import PercentTierList from '@/form/components/PercentTierList'
import FixedTierList from '@/form/components/FixedTierList'

afterEach(cleanup)

describe('FixedTierRow', () => {
  const row = { key: 'k1', minQty: '3', fixedPrice: '21' }
  const base = { index: 1, row, labels: { eachLabel: '$21.00 ea', offLabel: '25% off' }, currencySymbol: '$', isRemovable: true, onChange: () => {}, onRemove: () => {} }

  it('shows the quantity and the price each with the names the save action reads', () => {
    render(<FixedTierRow {...base} />)
    const minQty = screen.getByLabelText('Tier 2 minimum quantity')
    const fixedPrice = screen.getByLabelText('Tier 2 price each')
    expect(minQty).toHaveAttribute('name', 'tier-1-minQty')
    expect(minQty).toHaveValue(3)
    expect(fixedPrice).toHaveAttribute('name', 'tier-1-fixedPrice')
    expect(fixedPrice).toHaveValue(21)
    expect(screen.getByText('$21.00 ea')).toBeInTheDocument()
    expect(screen.getByText('25% off')).toBeInTheDocument()
  })

  it('reports an edit and a removal, and cannot remove the last row', () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    const { rerender } = render(<FixedTierRow {...base} onChange={onChange} onRemove={onRemove} />)
    fireEvent.change(screen.getByLabelText('Tier 2 price each'), { target: { value: '19.5' } })
    expect(onChange).toHaveBeenCalledWith('fixedPrice', '19.5')
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 2' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    rerender(<FixedTierRow {...base} isRemovable={false} />)
    expect(screen.getByRole('button', { name: 'Remove tier 2' })).toBeDisabled()
  })
})

describe('PercentTierList', () => {
  const rows = [
    { key: 'a', minQty: '3', percentOff: '10', anchorPrice: '' },
    { key: 'b', minQty: '', percentOff: '', anchorPrice: '' },
  ]
  const base = { rows, basePrice: 28, currencyCode: 'USD', isAnchorAllowed: true, onChange: () => {}, onRemove: () => {} }

  it('shows a row per tier with the price each worked out for a complete one only', () => {
    render(<PercentTierList {...base} />)
    expect(screen.getAllByLabelText(/minimum quantity/)).toHaveLength(2)
    expect(screen.getByText('$25.20 ea')).toBeInTheDocument()
    expect(screen.getAllByText(/ ea$/)).toHaveLength(1)
  })

  it('names the columns of a percentage discount', () => {
    render(<PercentTierList {...base} />)
    expect(screen.getByText('Discount rate')).toBeInTheDocument()
    expect(screen.getByText('Anchor price')).toBeInTheDocument()
  })

  it('shows no price each while the products have no price yet', () => {
    render(<PercentTierList {...base} basePrice={null} />)
    expect(screen.queryByText(/ ea$/)).toBeNull()
  })

  it('reports an edit and a removal with the row key', () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    render(<PercentTierList {...base} onChange={onChange} onRemove={onRemove} />)
    fireEvent.change(screen.getByLabelText('Tier 2 percent off'), { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith({ key: 'b', field: 'percentOff', value: '5' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 1' }))
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('cannot remove the only row', () => {
    render(<PercentTierList {...base} rows={[rows[0]]} />)
    expect(screen.getByRole('button', { name: 'Remove tier 1' })).toBeDisabled()
  })
})

describe('FixedTierList', () => {
  const rows = [{ key: 'a', minQty: '3', fixedPrice: '21' }, { key: 'b', minQty: '5', fixedPrice: '' }]
  const base = { rows, basePrice: 28, currencyCode: 'USD', onChange: () => {}, onRemove: () => {} }

  it('names the columns and works out the price each for a complete row only', () => {
    render(<FixedTierList {...base} />)
    expect(screen.getByText('Price each')).toBeInTheDocument()
    expect(screen.queryByText('Anchor price')).toBeNull()
    expect(screen.getByText('$21.00 ea')).toBeInTheDocument()
    expect(screen.getAllByText(/ ea$/)).toHaveLength(1)
  })

  it('reports an edit and a removal with the row key', () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    render(<FixedTierList {...base} onChange={onChange} onRemove={onRemove} />)
    fireEvent.change(screen.getByLabelText('Tier 2 price each'), { target: { value: '19' } })
    expect(onChange).toHaveBeenCalledWith({ key: 'b', field: 'fixedPrice', value: '19' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 2' }))
    expect(onRemove).toHaveBeenCalledWith('b')
  })
})
