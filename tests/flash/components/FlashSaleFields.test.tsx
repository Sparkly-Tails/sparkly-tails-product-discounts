// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FlashSaleFields from '@/flash/components/FlashSaleFields'

afterEach(cleanup)

const NOW = '2026-11-01T10:00'

function setup(over: Partial<React.ComponentProps<typeof FlashSaleFields>> = {}) {
  render(<FlashSaleFields shopTimezone="Europe/London" nowLocal={NOW} {...over} />)
}

describe('FlashSaleFields', () => {
  it('shows only the switch until it is turned on', () => {
    setup()
    expect(screen.getByLabelText('Run as a flash sale')).not.toBeChecked()
    expect(screen.queryByLabelText(/Starts/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Run as a flash sale'))
    expect(screen.getByLabelText('Starts (Europe/London)')).toHaveAttribute('name', 'flashStartsAt')
    expect(screen.getByLabelText('Ends (Europe/London)')).toHaveAttribute('name', 'flashEndsAt')
  })

  it('names the switch and the teaser box for the form, and checks the teaser box by default', () => {
    setup()
    expect(screen.getByLabelText('Run as a flash sale')).toHaveAttribute('name', 'flashEnabled')
    fireEvent.click(screen.getByLabelText('Run as a flash sale'))
    const teaser = screen.getByLabelText('Show a teaser before the sale starts')
    expect(teaser).toHaveAttribute('name', 'flashShowTeaser')
    expect(teaser).toBeChecked()
  })

  it('starts from the stored sale', () => {
    setup({ initial: { enabled: true, startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: false } })
    expect(screen.getByLabelText('Run as a flash sale')).toBeChecked()
    expect(screen.getByLabelText(/Starts/)).toHaveValue('2026-11-27T09:00')
    expect(screen.getByLabelText(/Ends/)).toHaveValue('2026-11-30T23:59')
    expect(screen.getByLabelText('Show a teaser before the sale starts')).not.toBeChecked()
  })

  it('asks for both times while the switch is on', () => {
    setup({ initial: { enabled: true, startsAt: '', endsAt: '', showTeaser: true } })
    expect(screen.getByLabelText(/Starts/)).toBeRequired()
    expect(screen.getByLabelText(/Ends/)).toBeRequired()
  })

  it('shows an alert and blocks the form when the end is not after the start', () => {
    setup({ initial: { enabled: true, startsAt: '2026-11-27T09:00', endsAt: '2026-11-27T09:00', showTeaser: true } })
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.')
    expect((screen.getByLabelText(/Ends/) as HTMLInputElement).validity.customError).toBe(true)
  })

  it('shows an alert when the end has already passed, and clears it when a later end is typed', () => {
    setup({ initial: { enabled: true, startsAt: '2026-10-01T09:00', endsAt: '2026-10-02T09:00', showTeaser: true } })
    expect(screen.getByRole('alert')).toHaveTextContent('The end time has already passed. Choose a later end time.')
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: '2026-12-02T09:00' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect((screen.getByLabelText(/Ends/) as HTMLInputElement).validity.customError).toBe(false)
  })

  it('shows no alert for a valid window', () => {
    setup({ initial: { enabled: true, startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
