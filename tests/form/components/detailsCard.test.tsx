// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DetailsCard from '@/form/components/DetailsCard'

afterEach(cleanup)

describe('DetailsCard', () => {
  it('shows the Details heading and the Internal name field filled with the initial name', () => {
    render(<DetailsCard initialName="Salmon Oil Volume Discount" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeInTheDocument()
    const input = screen.getByLabelText('Internal name')
    expect(input).toHaveAttribute('name', 'name')
    expect(input).toHaveValue('Salmon Oil Volume Discount')
  })

  it('says who sees the name', () => {
    render(<DetailsCard initialName="" />)
    expect(screen.getByText('Merchant admin only')).toBeInTheDocument()
    expect(screen.getByText('ID name of the discount, only visible in store admin')).toBeInTheDocument()
  })

  it('shows a Title field named "title", filled with the title it is given, with what it is for', () => {
    render(<DetailsCard initialName="" title="Tins mix" />)
    const input = screen.getByLabelText('Title')
    expect(input).toHaveAttribute('name', 'title')
    expect(input).toHaveValue('Tins mix')
    expect(screen.getByText('Shown to customers as the heading of the checkout pop-up')).toBeInTheDocument()
  })

  it('reports the title as it is typed', () => {
    const onTitleChange = vi.fn()
    render(<DetailsCard initialName="" title="" onTitleChange={onTitleChange} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Tins mix' } })
    expect(onTitleChange).toHaveBeenCalledWith('Tins mix')
  })

  it('shows a "Show the pop-up" select named "popupFrequency" with its two choices, set from the initial value', () => {
    render(<DetailsCard initialName="" initialPopupFrequency="checkout" />)
    const select = screen.getByLabelText('Show the pop-up')
    expect(select).toHaveAttribute('name', 'popupFrequency')
    expect(select).toHaveValue('checkout')
    expect(Array.from((select as HTMLSelectElement).options).map((option) => [option.value, option.textContent])).toEqual([['session', 'Once per session'], ['checkout', 'At every checkout press']])
  })

  it('shows once per session when no frequency is given, and reports a new choice', () => {
    const onPopupFrequencyChange = vi.fn()
    render(<DetailsCard initialName="" onPopupFrequencyChange={onPopupFrequencyChange} />)
    expect(screen.getByLabelText('Show the pop-up')).toHaveValue('session')
    fireEvent.change(screen.getByLabelText('Show the pop-up'), { target: { value: 'checkout' } })
    expect(onPopupFrequencyChange).toHaveBeenCalledWith('checkout')
  })

  it('requires a name', () => {
    render(<DetailsCard initialName="" />)
    expect(screen.getByLabelText('Internal name')).toBeRequired()
  })

  it('reports the name as it is typed', () => {
    const onNameChange = vi.fn()
    render(<DetailsCard initialName="" onNameChange={onNameChange} />)
    fireEvent.change(screen.getByLabelText('Internal name'), { target: { value: 'Black Friday' } })
    expect(onNameChange).toHaveBeenCalledWith('Black Friday')
  })
})
