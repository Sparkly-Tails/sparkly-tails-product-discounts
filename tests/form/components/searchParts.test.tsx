// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import SearchBox from '@/form/components/SearchBox'
import ResultsList from '@/form/components/ResultsList'
import VariantList from '@/form/components/VariantList'

afterEach(cleanup)

describe('SearchBox', () => {
  it('shows the typed text and reports typing', () => {
    const onChange = vi.fn()
    render(<SearchBox value="Sal" onChange={onChange} onClear={() => {}} onBrowse={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Search products or variants' })
    expect(input).toHaveValue('Sal')
    expect(input).toHaveAttribute('placeholder', 'Search products or variants...')
    fireEvent.change(input, { target: { value: 'Salmon' } })
    expect(onChange).toHaveBeenCalledWith('Salmon')
  })

  it('shows a clear button only while there is text, and reports it', () => {
    const onClear = vi.fn()
    const { rerender } = render(<SearchBox value="" onChange={() => {}} onClear={onClear} onBrowse={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    rerender(<SearchBox value="Sal" onChange={() => {}} onClear={onClear} onBrowse={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('has a Browse button that is not a submit button', () => {
    const onBrowse = vi.fn()
    render(<SearchBox value="" onChange={() => {}} onClear={() => {}} onBrowse={onBrowse} />)
    const button = screen.getByRole('button', { name: 'Browse' })
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })

  it('reports when the field gets and loses focus', () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(<SearchBox value="" onChange={() => {}} onClear={() => {}} onBrowse={() => {}} onFocus={onFocus} onBlur={onBlur} />)
    const input = screen.getByRole('textbox', { name: 'Search products or variants' })
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('shows what it is given under the box, such as the results', () => {
    render(<SearchBox value="" onChange={() => {}} onClear={() => {}} onBrowse={() => {}}><p>below</p></SearchBox>)
    expect(screen.getByText('below')).toBeInTheDocument()
  })
})

describe('ResultsList', () => {
  const results = [
    { id: 'p1', title: 'Tuna Soup', variantCount: 1, imageUrl: null },
    { id: 'p2', title: 'Wet Cat Food', variantCount: 3, imageUrl: null },
  ]

  it('lists each product, noting how many variants a multi-variant product has', () => {
    render(<ResultsList results={results} onPick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Tuna Soup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wet Cat Food (3 variants)' })).toBeInTheDocument()
  })

  it('reports the product picked (on press, so a blur cannot close the list first)', () => {
    const onPick = vi.fn()
    render(<ResultsList results={results} onPick={onPick} />)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Tuna Soup' }))
    expect(onPick).toHaveBeenCalledWith(results[0])
  })

  it('says when nothing was found', () => {
    render(<ResultsList results={[]} onPick={() => {}} />)
    expect(screen.getByText('No products found')).toBeInTheDocument()
  })
})

describe('VariantList', () => {
  const options = [
    { variantId: 'v1', title: '90 Chews', price: 32 },
    { variantId: 'v2', title: '180 Chews', price: 58 },
  ]

  it('names the product and offers each variant with its price', () => {
    render(<VariantList productTitle="Joint Chews" options={options} currencyCode="USD" onPick={() => {}} onDone={() => {}} />)
    expect(screen.getByText('Joint Chews: choose variants')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '90 Chews — $32.00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '180 Chews — $58.00' })).toBeInTheDocument()
  })

  it('reports the variant picked and when the person is done', () => {
    const onPick = vi.fn()
    const onDone = vi.fn()
    render(<VariantList productTitle="Joint Chews" options={options} currencyCode="USD" onPick={onPick} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: '180 Chews — $58.00' }))
    expect(onPick).toHaveBeenCalledWith(options[1])
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('has no submit buttons, so choosing never submits the form', () => {
    const { container } = render(<VariantList productTitle="Joint Chews" options={options} currencyCode="USD" onPick={() => {}} onDone={() => {}} />)
    for (const button of container.querySelectorAll('button')) expect(button).toHaveAttribute('type', 'button')
  })
})
