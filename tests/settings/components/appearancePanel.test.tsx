// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import AppearancePanel from '@/settings/components/AppearancePanel'

afterEach(cleanup)

const VALUES = { accentColor: '#434625', backgroundColor: '#F5EFE1', cornerRadius: 12, flashTone: 'olive-night' as const }

describe('AppearancePanel', () => {
  it('shows its title and the four groups of controls', () => {
    render(<AppearancePanel {...VALUES} onChange={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Storefront Appearance & Theme' })).toBeInTheDocument()
    expect(screen.getByText('Accent colour')).toBeInTheDocument()
    expect(screen.getByText('Background colour')).toBeInTheDocument()
    expect(screen.getByText('Flash sale urgency bar tone')).toBeInTheDocument()
    expect(screen.getByText('Corner roundness')).toBeInTheDocument()
  })

  it('offers the three flash tones and reports the one chosen', () => {
    const onChange = vi.fn()
    render(<AppearancePanel {...VALUES} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Olive Night' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pure Onyx' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Deep Pine' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Pure Onyx' }))
    expect(onChange).toHaveBeenCalledWith('flashTone', 'pure-onyx')
  })

  it('names the three stops under the slider and shows the chosen radius', () => {
    render(<AppearancePanel {...VALUES} onChange={() => {}} />)
    expect(screen.getByText('0px (Sharp modern)')).toBeInTheDocument()
    expect(screen.getByText('12px (Smooth default)')).toBeInTheDocument()
    expect(screen.getByText('24px (Soft pill)')).toBeInTheDocument()
    expect(screen.getByText('12 px')).toBeInTheDocument()
  })

  it('reports the radius from a slider that goes from 0 to 24', () => {
    const onChange = vi.fn()
    render(<AppearancePanel {...VALUES} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Corner roundness' })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '24')
    fireEvent.change(slider, { target: { value: '8' } })
    expect(onChange).toHaveBeenCalledWith('cornerRadius', 8)
  })

  it('reports an accent swatch, and a typed code only once it is a whole solid colour', () => {
    const onChange = vi.fn()
    render(<AppearancePanel {...VALUES} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pine' }))
    expect(onChange).toHaveBeenCalledWith('accentColor', '#1B3A2D')
    onChange.mockClear()
    const box = screen.getByRole('textbox', { name: 'Accent colour code' })
    fireEvent.change(box, { target: { value: '#12' } })
    fireEvent.change(box, { target: { value: '#11223380' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: '#112233' } })
    expect(onChange).toHaveBeenCalledWith('accentColor', '#112233')
  })

  it('reports the background from its code box', () => {
    const onChange = vi.fn()
    render(<AppearancePanel {...VALUES} onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Background colour code' }), { target: { value: '#112233CC' } })
    expect(onChange).toHaveBeenCalledWith('backgroundColor', '#112233CC')
  })
})
