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

  it('has no Title field (the title is the internal name)', () => {
    render(<DetailsCard initialName="" />)
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(document.querySelector('[name="title"]')).toBeNull()
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
