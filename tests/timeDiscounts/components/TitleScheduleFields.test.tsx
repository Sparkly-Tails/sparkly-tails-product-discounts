// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import TitleScheduleFields from '@/timeDiscounts/components/TitleScheduleFields'

afterEach(cleanup)

function setup(over: Partial<React.ComponentProps<typeof TitleScheduleFields>> = {}) {
  const handlers = { onTitleChange: vi.fn(), onStartsAtChange: vi.fn(), onEndsAtChange: vi.fn() }
  render(<TitleScheduleFields title="Summer" startsAt="2026-07-01T12:00" endsAt="2026-07-02T12:00" problem={null} shopTimezone="Europe/London" {...handlers} {...over} />)
  return handlers
}

describe('TitleScheduleFields', () => {
  it('shows the values, named for the form, with the shop timezone in the labels', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Summer')
    expect(screen.getByLabelText('Title')).toHaveAttribute('name', 'title')
    expect(screen.getByLabelText('Starts (Europe/London)')).toHaveAttribute('name', 'startsAt')
    expect(screen.getByLabelText('Ends (Europe/London)')).toHaveValue('2026-07-02T12:00')
  })

  it('reports each change', () => {
    const { onTitleChange, onStartsAtChange, onEndsAtChange } = setup()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Winter' } })
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: '2026-08-01T00:00' } })
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: '2026-08-02T00:00' } })
    expect(onTitleChange).toHaveBeenCalledWith('Winter')
    expect(onStartsAtChange).toHaveBeenCalledWith('2026-08-01T00:00')
    expect(onEndsAtChange).toHaveBeenCalledWith('2026-08-02T00:00')
  })

  it('shows the schedule problem as an alert, and nothing otherwise', () => {
    setup({ problem: 'End must be after start.' })
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.')
    cleanup()
    setup()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
