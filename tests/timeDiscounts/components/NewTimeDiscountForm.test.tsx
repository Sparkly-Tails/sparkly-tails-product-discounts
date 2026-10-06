// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'

afterEach(cleanup)

describe('NewTimeDiscountForm', () => {
  it('asks only for a title and a schedule — no products, collections or prices', () => {
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText(/Starts/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Ends/)).toBeInTheDocument()
    expect(screen.queryByText(/Collections/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()
    expect(screen.getByText(/add products on the next screen/)).toBeInTheDocument()
  })

  it('disables Create until there is a title and a valid schedule', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    const create = screen.getByRole('button', { name: 'Create discount' })
    expect(create).toBeDisabled()

    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    expect(create).toBeDisabled()

    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(create).toBeEnabled()
  })

  it('stays disabled and says why when the end is not after the start', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    await user.type(screen.getByLabelText('Title'), 'Summer Sale')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-02T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-01T12:00')

    expect(screen.getByText('End must be after start.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()
  })

  it('stays disabled for a blank title', async () => {
    const user = userEvent.setup()
    render(<NewTimeDiscountForm shopTimezone="Europe/London" />)
    await user.type(screen.getByLabelText('Title'), '   ')
    await user.type(screen.getByLabelText(/Starts/), '2026-07-01T12:00')
    await user.type(screen.getByLabelText(/Ends/), '2026-07-02T12:00')
    expect(screen.getByRole('button', { name: 'Create discount' })).toBeDisabled()
  })
})
