// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import PricingModeTierFields from '@/components/PricingModeTierFields'

afterEach(cleanup)

const FIXED_COPY = /Enter the exact price each customer pays/
const PERCENT_COPY = /Enter percent-off directly/

describe('PricingModeTierFields', () => {
  it('starts in the requested mode when price-based modes are allowed', () => {
    render(<PricingModeTierFields allowPriceBasedModes initial={{ startMode: 'fixed' }} />)
    expect(screen.getByLabelText('Fixed price')).toBeChecked()
    expect(screen.getByText(FIXED_COPY)).toBeInTheDocument()
  })

  it('shows percentage only, from the first render, when the members have different prices', () => {
    render(<PricingModeTierFields allowPriceBasedModes={false} initial={{ startMode: 'fixed' }} />)
    expect(screen.queryByLabelText('Fixed price')).toBeNull()
    expect(screen.getByLabelText('Percentage off')).toBeChecked()
    expect(screen.getByText(PERCENT_COPY)).toBeInTheDocument()
  })

  it('falls back to percent when fixed mode stops being valid, and stays there when it becomes valid again', () => {
    const { rerender } = render(<PricingModeTierFields allowPriceBasedModes initial={{ startMode: 'fixed' }} />)
    expect(screen.getByText(FIXED_COPY)).toBeInTheDocument()

    rerender(<PricingModeTierFields allowPriceBasedModes={false} initial={{ startMode: 'fixed' }} />)
    expect(screen.getByLabelText('Percentage off')).toBeChecked()
    expect(screen.getByText(PERCENT_COPY)).toBeInTheDocument()

    rerender(<PricingModeTierFields allowPriceBasedModes initial={{ startMode: 'fixed' }} />)
    expect(screen.getByLabelText('Percentage off')).toBeChecked()
    expect(screen.queryByText(FIXED_COPY)).toBeNull()
  })
})
