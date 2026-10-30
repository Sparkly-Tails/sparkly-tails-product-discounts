// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ModeToggle from '@/form/components/ModeToggle'
import TierTableHeader from '@/form/components/TierTableHeader'
import PercentTierRow from '@/form/components/PercentTierRow'
import AddTierButton from '@/form/components/AddTierButton'

afterEach(cleanup)

describe('ModeToggle', () => {
  it('offers Percentage off and Fixed price as radio buttons named pricingMode, with the current one checked', () => {
    render(<ModeToggle mode="percent" isFixedAllowed onChange={() => {}} />)
    const percent = screen.getByRole('radio', { name: 'Percentage off' })
    const fixed = screen.getByRole('radio', { name: 'Fixed price' })
    expect(percent).toHaveAttribute('name', 'pricingMode')
    expect(percent).toHaveAttribute('value', 'percent')
    expect(percent).toBeChecked()
    expect(fixed).toHaveAttribute('value', 'fixed')
    expect(fixed).not.toBeChecked()
  })

  it('reports the mode chosen', () => {
    const onChange = vi.fn()
    render(<ModeToggle mode="percent" isFixedAllowed onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed price' }))
    expect(onChange).toHaveBeenCalledWith('fixed')
  })

  it('cannot choose Fixed price when the products have different prices', () => {
    render(<ModeToggle mode="percent" isFixedAllowed={false} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Percentage off' })).toBeEnabled()
  })
})

describe('TierTableHeader', () => {
  it('names the columns', () => {
    render(<TierTableHeader discountLabel="Discount rate" anchorLabel="Anchor price" />)
    for (const name of ['Minimum quantity', 'Discount rate', 'Anchor price', 'Action']) expect(screen.getByText(name)).toBeInTheDocument()
  })

  it('leaves the third column empty when there is no label for it', () => {
    render(<TierTableHeader discountLabel="Price each" anchorLabel="" />)
    expect(screen.queryByText('Anchor price')).toBeNull()
  })
})

describe('PercentTierRow', () => {
  const row = { key: 'k1', minQty: '3', percentOff: '10', anchorPrice: '' }
  const labels = { eachLabel: '$25.20 ea', offLabel: '10% off' }
  const base = { index: 0, row, labels, currencySymbol: '$', isAnchorAllowed: true, isRemovable: true, onChange: () => {}, onRemove: () => {} }

  it('shows the three values with the names the save action reads', () => {
    render(<PercentTierRow {...base} />)
    const minQty = screen.getByLabelText('Tier 1 minimum quantity')
    const percentOff = screen.getByLabelText('Tier 1 percent off')
    const anchorPrice = screen.getByLabelText('Tier 1 anchor price (optional)')
    expect(minQty).toHaveAttribute('name', 'tier-0-minQty')
    expect(minQty).toHaveValue(3)
    expect(percentOff).toHaveAttribute('name', 'tier-0-percentOff')
    expect(percentOff).toHaveValue(10)
    expect(anchorPrice).toHaveAttribute('name', 'tier-0-anchorPrice')
    expect(screen.getByText('units')).toBeInTheDocument()
    expect(screen.getByText('%')).toBeInTheDocument()
  })

  it('shows the price each and the percentage under the rate', () => {
    render(<PercentTierRow {...base} />)
    expect(screen.getByText('$25.20 ea')).toBeInTheDocument()
    expect(screen.getByText('10% off')).toBeInTheDocument()
  })

  it('reports an edit with the field and the new text', () => {
    const onChange = vi.fn()
    render(<PercentTierRow {...base} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith('percentOff', '12')
    fireEvent.change(screen.getByLabelText('Tier 1 anchor price (optional)'), { target: { value: '600' } })
    expect(onChange).toHaveBeenCalledWith('anchorPrice', '600')
  })

  it('has no anchor price field when anchor prices are not allowed', () => {
    render(<PercentTierRow {...base} isAnchorAllowed={false} />)
    expect(screen.queryByLabelText('Tier 1 anchor price (optional)')).toBeNull()
  })

  it('removes the row, unless it is the last one', () => {
    const onRemove = vi.fn()
    const { rerender } = render(<PercentTierRow {...base} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 1' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    rerender(<PercentTierRow {...base} isRemovable={false} onRemove={onRemove} />)
    expect(screen.getByRole('button', { name: 'Remove tier 1' })).toBeDisabled()
  })

  it('numbers the field names by position', () => {
    render(<PercentTierRow {...base} index={2} />)
    expect(screen.getByLabelText('Tier 3 minimum quantity')).toHaveAttribute('name', 'tier-2-minQty')
  })
})

describe('AddTierButton', () => {
  it('adds a tier without submitting the form', () => {
    const onAdd = vi.fn()
    render(<AddTierButton onAdd={onAdd} />)
    const button = screen.getByRole('button', { name: 'Add tier' })
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
