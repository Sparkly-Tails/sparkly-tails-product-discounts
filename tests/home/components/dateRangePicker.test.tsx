// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DateRangePicker from '@/home/components/DateRangePicker'
import { listRangePresets } from '@/home/rangeDays'

afterEach(cleanup)

const TODAY = '2026-11-02'
const PRESETS = listRangePresets({ today: TODAY })

function show(keep = '', range = { fromDay: '2026-10-04', toDay: '2026-11-02' }) {
  return render(<DateRangePicker label="Last 30 days" today={TODAY} fromDay={range.fromDay} toDay={range.toDay} presets={PRESETS} keep={keep} />)
}
const open = () => fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }))
const day = (text: string) => document.querySelector(`[data-day="${text}"]`) as HTMLButtonElement
const position = (text: string) => day(text).getAttribute('data-range-position')
const SHORT_RANGE = { fromDay: '2026-10-30', toDay: '2026-11-02' }

describe('DateRangePicker', () => {
  it('shows the label on the button and nothing else until it is pressed', () => {
    show()
    expect(screen.getByRole('button', { name: /Last 30 days/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull()
  })

  it('opens a calendar of the month of today and the eight presets as links', () => {
    show()
    open()
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(day('2026-11-02')).toBeInTheDocument()
    const links = PRESETS.map((preset) => screen.getByRole('link', { name: preset.label }))
    expect(links.map((link) => link.getAttribute('href'))).toEqual(PRESETS.map((preset) => `/?range=${preset.key}`))
  })

  it('keeps the table settings in every link it makes', () => {
    show('tab=active')
    open()
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/?tab=active&range=today')
  })

  it('disables the days after today', () => {
    show()
    open()
    expect(day('2026-11-03')).toBeDisabled()
    expect(day('2026-11-02')).toBeEnabled()
  })

  it('moves between months, and does not go past the month of today', () => {
    show()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })

  it('makes the custom link from two chosen days, in either order, once Apply is there', () => {
    show()
    open()
    expect(screen.queryByRole('link', { name: 'Apply' })).toBeNull()
    fireEvent.click(day('2026-11-02'))
    fireEvent.click(day('2026-11-01'))
    expect(screen.getByRole('link', { name: 'Apply' })).toHaveAttribute('href', '/?from=2026-11-01&to=2026-11-02')
  })

  it('starts a new choice on a third click', () => {
    show()
    open()
    fireEvent.click(day('2026-11-01'))
    fireEvent.click(day('2026-11-02'))
    fireEvent.click(day('2026-11-01'))
    expect(screen.queryByRole('link', { name: 'Apply' })).toBeNull()
  })

  it('closes with Escape and with a click outside', () => {
    show()
    open()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull()
    open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull()
  })

  it('opens on the month of the last day of the range, with its first and last day marked and the days between shaded', () => {
    show('', SHORT_RANGE)
    open()
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(position('2026-11-02')).toBe('edge')
    expect(position('2026-11-01')).toBe('inside')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect([position('2026-10-29'), position('2026-10-30'), position('2026-10-31')]).toEqual(['outside', 'edge', 'inside'])
  })

  it('marks every day of the last 30 days, the first one an edge', () => {
    show()
    open()
    expect(position('2026-11-02')).toBe('edge')
    expect(position('2026-11-01')).toBe('inside')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect([position('2026-10-03'), position('2026-10-04'), position('2026-10-05')]).toEqual(['outside', 'edge', 'inside'])
  })

  it('marks a one-day range as one edge day', () => {
    show('', { fromDay: '2026-11-02', toDay: '2026-11-02' })
    open()
    expect([position('2026-11-01'), position('2026-11-02')]).toEqual(['outside', 'edge'])
  })

  it('shows the days being chosen instead of the range while a choice is on', () => {
    show('', SHORT_RANGE)
    open()
    fireEvent.click(day('2026-11-01'))
    expect([position('2026-11-01'), position('2026-11-02')]).toEqual(['edge', 'outside'])
    fireEvent.click(day('2026-11-02'))
    expect([position('2026-11-01'), position('2026-11-02')]).toEqual(['edge', 'edge'])
  })

  it('shows the range again, in its month, when it is opened again after a choice or a month change', () => {
    show('', SHORT_RANGE)
    open()
    fireEvent.click(day('2026-11-01'))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    open()
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect([position('2026-11-01'), position('2026-11-02')]).toEqual(['inside', 'edge'])
  })
})
