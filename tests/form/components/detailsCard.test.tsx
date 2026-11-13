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

  it('has no pop-up frequency choice: how often the pop-up shows is a store-wide setting', () => {
    render(<DetailsCard initialName="" />)
    expect(screen.queryByLabelText('Show the pop-up')).toBeNull()
    expect(document.querySelector('[name="popupFrequency"]')).toBeNull()
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
