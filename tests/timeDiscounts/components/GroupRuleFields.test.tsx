// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import GroupRuleFields from '@/timeDiscounts/components/GroupRuleFields'

afterEach(cleanup)

describe('GroupRuleFields', () => {
  it('shows the type and the amount, labelled for the type', () => {
    const { rerender } = render(<GroupRuleFields pricingMode="percent" amountText="20" problem={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Discount type')).toHaveValue('percent')
    expect(screen.getByLabelText('Percent off')).toHaveValue(20)
    rerender(<GroupRuleFields pricingMode="fixed" amountText="7.5" problem={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Fixed price')).toHaveValue(7.5)
  })

  it('reports a new type with the amount as it is, and a new amount with the type as it is', async () => {
    const onChange = vi.fn()
    render(<GroupRuleFields pricingMode="percent" amountText="20" problem={null} onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Discount type'), 'fixed')
    expect(onChange).toHaveBeenLastCalledWith('fixed', '20')
    fireEvent.change(screen.getByLabelText('Percent off'), { target: { value: '25' } })
    expect(onChange).toHaveBeenLastCalledWith('percent', '25')
  })

  it('shows the problem as an alert, and disables both inputs when disabled', () => {
    render(<GroupRuleFields pricingMode="percent" amountText="0" problem="Enter an amount greater than zero" onChange={() => {}} disabled />)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount greater than zero')
    expect(screen.getByLabelText('Discount type')).toBeDisabled()
    expect(screen.getByLabelText('Percent off')).toBeDisabled()
  })
})
