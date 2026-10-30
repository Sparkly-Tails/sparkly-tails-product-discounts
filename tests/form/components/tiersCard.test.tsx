// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import TiersCard from '@/form/components/TiersCard'

afterEach(cleanup)

const INITIAL = {
  mode: 'percent' as const,
  percentTiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 15 }],
  fixedTiers: [{ minQty: 2, fixedPrice: 21 }],
}

function renderCard(overrides: Partial<Parameters<typeof TiersCard>[0]> = {}) {
  const onTiersChange = vi.fn()
  const view = render(<TiersCard allowPriceBasedModes basePrice={28} currencyCode="USD" initial={INITIAL} onTiersChange={onTiersChange} {...overrides} />)
  return { onTiersChange, ...view }
}

describe('TiersCard', () => {
  it('shows the heading, what the tiers are for and the switch', () => {
    renderCard()
    expect(screen.getByRole('heading', { level: 2, name: 'Tiers' })).toBeInTheDocument()
    expect(screen.getByText('Set volume discounts based on the quantity of items purchased.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Percentage off' })).toBeChecked()
  })

  it('shows a row for each saved tier with its price each', () => {
    renderCard()
    expect(screen.getByLabelText('Tier 1 minimum quantity')).toHaveValue(3)
    expect(screen.getByLabelText('Tier 2 percent off')).toHaveValue(15)
    expect(screen.getByText('$25.20 ea')).toBeInTheDocument()
    expect(screen.getByText('$23.80 ea')).toBeInTheDocument()
  })

  it('starts with one empty row when nothing is saved', () => {
    renderCard({ initial: { mode: 'percent', percentTiers: [], fixedTiers: [] } })
    expect(screen.getAllByLabelText(/minimum quantity/)).toHaveLength(1)
    expect(screen.getByLabelText('Tier 1 minimum quantity')).toHaveValue(null)
  })

  it('adds a row from Add tier and removes a row, but never the last one', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add tier' }))
    expect(screen.getAllByLabelText(/minimum quantity/)).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 2' }))
    expect(screen.getAllByLabelText(/minimum quantity/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remove tier 1' })).toBeDisabled()
  })

  it('shows the fixed-price rows when Fixed price is chosen, and only those fields are in the form', () => {
    renderCard()
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed price' }))
    expect(screen.getByLabelText('Tier 1 price each')).toHaveValue(21)
    expect(document.querySelector('[name="tier-0-percentOff"]')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeChecked()
  })

  it('keeps what was typed in each mode when switching back and forth', () => {
    renderCard()
    fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed price' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Percentage off' }))
    expect(screen.getByLabelText('Tier 1 percent off')).toHaveValue(12)
  })

  it('opens in fixed mode for a saved fixed-price discount', () => {
    renderCard({ initial: { ...INITIAL, mode: 'fixed' } })
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeChecked()
    expect(screen.getByLabelText('Tier 1 price each')).toHaveValue(21)
  })
})

describe('TiersCard: what it reports', () => {
  it('reports the complete tiers and the mode when it first shows', () => {
    const { onTiersChange } = renderCard()
    expect(onTiersChange).toHaveBeenLastCalledWith({
      mode: 'percent',
      tiers: [{ minQty: 3, percentOff: 10, anchorPrice: undefined }, { minQty: 5, percentOff: 15, anchorPrice: undefined }],
    })
  })

  it('reports an edit, and leaves a row out until it is complete', () => {
    const { onTiersChange } = renderCard()
    fireEvent.change(screen.getByLabelText('Tier 2 percent off'), { target: { value: '' } })
    expect(onTiersChange).toHaveBeenLastCalledWith({ mode: 'percent', tiers: [{ minQty: 3, percentOff: 10, anchorPrice: undefined }] })
    fireEvent.change(screen.getByLabelText('Tier 1 anchor price (optional)'), { target: { value: '70' } })
    expect(onTiersChange).toHaveBeenLastCalledWith({ mode: 'percent', tiers: [{ minQty: 3, percentOff: 10, anchorPrice: 70 }] })
  })

  it('reports the fixed tiers when the mode is switched', () => {
    const { onTiersChange } = renderCard()
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed price' }))
    expect(onTiersChange).toHaveBeenLastCalledWith({ mode: 'fixed', tiers: [{ minQty: 2, fixedPrice: 21 }] })
  })

  it('does not report again when only the callback changes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<TiersCard allowPriceBasedModes basePrice={28} currencyCode="USD" initial={INITIAL} onTiersChange={first} />)
    rerender(<TiersCard allowPriceBasedModes basePrice={28} currencyCode="USD" initial={INITIAL} onTiersChange={second} />)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })
})

describe('TiersCard: products with different prices', () => {
  it('allows a percentage only: Fixed price is off, the reason is shown and there is no anchor price', () => {
    renderCard({ allowPriceBasedModes: false })
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeDisabled()
    expect(screen.getByText('These products/variants have different prices, so only a percentage discount is available.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tier 1 anchor price (optional)')).toBeNull()
  })

  it('never keeps a fixed-price mode that is no longer allowed', () => {
    const { onTiersChange } = renderCard({ allowPriceBasedModes: false, initial: { ...INITIAL, mode: 'fixed' } })
    expect(screen.getByRole('radio', { name: 'Percentage off' })).toBeChecked()
    expect(onTiersChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'percent' }))
  })

  it('falls back to a percentage when the products stop being the same price', () => {
    const onTiersChange = vi.fn()
    const { rerender } = render(<TiersCard allowPriceBasedModes basePrice={28} currencyCode="USD" initial={{ ...INITIAL, mode: 'fixed' }} onTiersChange={onTiersChange} />)
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeChecked()
    rerender(<TiersCard allowPriceBasedModes={false} basePrice={28} currencyCode="USD" initial={{ ...INITIAL, mode: 'fixed' }} onTiersChange={onTiersChange} />)
    expect(screen.getByRole('radio', { name: 'Percentage off' })).toBeChecked()
    expect(onTiersChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'percent' }))
  })
})
