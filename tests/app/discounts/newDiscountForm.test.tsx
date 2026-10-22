// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('@/actions/discountActions', () => ({ createDiscount: vi.fn() }))
vi.mock('@/components/MemberPicker', () => ({ default: () => <div>member picker</div> }))
vi.mock('@/components/PricingModeTierFields', () => ({ default: () => <div>tier fields</div> }))

import NewDiscountForm from '../../../src/app/discounts/new/NewDiscountForm'

afterEach(cleanup)

describe('NewDiscountForm', () => {
  it('has a Flash sale section with the switch off, and no time fields until it is turned on', () => {
    render(<NewDiscountForm shopTimezone="Europe/London" nowLocal="2026-11-01T10:00" />)
    expect(screen.getByText('Flash sale')).toBeInTheDocument()
    expect(screen.getByLabelText('Run as a flash sale')).not.toBeChecked()
    expect(screen.queryByLabelText(/Starts/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Run as a flash sale'))
    expect(screen.getByLabelText('Starts (Europe/London)')).toBeInTheDocument()
  })

  it('has an unchecked High Demand checkbox named for the form', () => {
    render(<NewDiscountForm shopTimezone="Europe/London" nowLocal="2026-11-01T10:00" />)
    const box = screen.getByLabelText('Show the High Demand tag')
    expect(box).toHaveAttribute('name', 'highDemand')
    expect(box).not.toBeChecked()
  })
})
