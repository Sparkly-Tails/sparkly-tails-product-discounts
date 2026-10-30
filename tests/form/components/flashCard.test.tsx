// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FlashCard, { type FlashValues } from '@/form/components/FlashCard'
import { FLASH_END_PASSED_MESSAGE } from '@/flash/schedule'

afterEach(cleanup)

const OFF: FlashValues = { enabled: false, startsAt: '', endsAt: '', showTeaser: true, highDemand: false }
const ON: FlashValues = { enabled: true, startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true, highDemand: false }
const NOW = '2026-10-30T12:00'

function renderCard(initial: FlashValues, onChange?: (values: FlashValues) => void) {
  return render(<FlashCard shopTimezone="America/New_York" nowLocal={NOW} initial={initial} onChange={onChange} />)
}

describe('FlashCard', () => {
  it('shows the heading with the Time-sensitive chip', () => {
    renderCard(OFF)
    expect(screen.getByRole('heading', { level: 2, name: 'Flash sale' })).toBeInTheDocument()
    expect(screen.getByText('Time-sensitive')).toBeInTheDocument()
  })

  it('hides the dates and the teaser until the switch is on', () => {
    renderCard(OFF)
    const toggle = screen.getByRole('checkbox', { name: 'Run as a flash sale' })
    expect(toggle).toHaveAttribute('name', 'flashEnabled')
    expect(toggle).not.toBeChecked()
    expect(document.querySelector('[name="flashStartsAt"]')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Show a teaser before the sale starts' })).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Starts (America/New_York)')).toBeInTheDocument()
    expect(screen.getByLabelText('Ends (America/New_York)')).toBeInTheDocument()
  })

  it('fills the window and the teaser from the initial values, with the names the actions read', () => {
    renderCard(ON)
    const starts = screen.getByLabelText('Starts (America/New_York)')
    const ends = screen.getByLabelText('Ends (America/New_York)')
    expect(starts).toHaveAttribute('name', 'flashStartsAt')
    expect(starts).toHaveAttribute('type', 'datetime-local')
    expect(starts).toHaveValue('2026-11-27T09:00')
    expect(starts).toBeRequired()
    expect(ends).toHaveAttribute('name', 'flashEndsAt')
    expect(ends).toHaveValue('2026-11-30T23:59')
    expect(ends).toBeRequired()
    const teaser = screen.getByRole('checkbox', { name: 'Show a teaser before the sale starts' })
    expect(teaser).toHaveAttribute('name', 'flashShowTeaser')
    expect(teaser).toBeChecked()
  })

  it('shows a problem with the window and blocks the end field', () => {
    renderCard({ ...ON, startsAt: '2026-12-01T10:00', endsAt: '2026-11-30T10:00' })
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.')
    expect((screen.getByLabelText('Ends (America/New_York)') as HTMLInputElement).validity.customError).toBe(true)
  })

  it('refuses an end time that has already passed', () => {
    renderCard({ ...ON, startsAt: '2026-10-01T10:00', endsAt: '2026-10-02T10:00' })
    expect(screen.getByRole('alert')).toHaveTextContent(FLASH_END_PASSED_MESSAGE)
  })

  it('clears the problem when the window is fixed', () => {
    renderCard({ ...ON, startsAt: '2026-12-01T10:00', endsAt: '2026-11-30T10:00' })
    fireEvent.change(screen.getByLabelText('Ends (America/New_York)'), { target: { value: '2026-12-05T10:00' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByLabelText('Ends (America/New_York)') as HTMLInputElement).validity.customError).toBe(false)
  })

  it('shows the High Demand checkbox in both states of the switch', () => {
    const { unmount } = renderCard(OFF)
    expect(screen.getByRole('checkbox', { name: 'Show the High Demand tag' })).toHaveAttribute('name', 'highDemand')
    unmount()
    renderCard(ON)
    expect(screen.getByRole('checkbox', { name: 'Show the High Demand tag' })).toBeInTheDocument()
  })

  it('puts High Demand directly below the teaser checkbox', () => {
    renderCard(ON)
    const teaser = screen.getByRole('checkbox', { name: 'Show a teaser before the sale starts' })
    const highDemand = screen.getByRole('checkbox', { name: 'Show the High Demand tag' })
    expect(teaser.compareDocumentPosition(highDemand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('checks High Demand from the initial values', () => {
    renderCard({ ...OFF, highDemand: true })
    expect(screen.getByRole('checkbox', { name: 'Show the High Demand tag' })).toBeChecked()
  })

  it('reports every change with all the values', () => {
    const onChange = vi.fn()
    renderCard(OFF, onChange)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show the High Demand tag' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...OFF, highDemand: true })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Run as a flash sale' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...OFF, highDemand: true, enabled: true })
    fireEvent.change(screen.getByLabelText('Starts (America/New_York)'), { target: { value: '2026-11-27T09:00' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...OFF, highDemand: true, enabled: true, startsAt: '2026-11-27T09:00' })
  })
})
