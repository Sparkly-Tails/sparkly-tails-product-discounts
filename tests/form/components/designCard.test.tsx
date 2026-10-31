// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DesignCard from '@/form/components/DesignCard'
import { DEFAULT_WIDGET_STYLE, type WidgetStyle } from '@/lib/widgetStyle'

// The card is held by the form; this holds it for the tests and reports every change.
function Harness({ initial = DEFAULT_WIDGET_STYLE, onChange = () => {} }: { initial?: WidgetStyle; onChange?: (style: WidgetStyle) => void }) {
  const [style, setStyle] = useState(initial)
  return <DesignCard style={style} onChange={(next) => { setStyle(next); onChange(next) }} />
}

afterEach(cleanup)

describe('DesignCard', () => {
  it('shows the heading, what it is for and the four groups of controls', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { level: 2, name: 'Design' })).toBeInTheDocument()
    expect(screen.getByText('Card styling and color palettes for the storefront widget')).toBeInTheDocument()
    expect(screen.getByText('Color theme')).toBeInTheDocument()
    expect(screen.getByText('Secondary background color')).toBeInTheDocument()
    expect(screen.getByText('Round corners')).toBeInTheDocument()
    expect(screen.getByText('Price size')).toBeInTheDocument()
  })

  it('starts with Blue, Warm Sand and 12 px chosen', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('12 px')).toBeInTheDocument()
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
  })

  it('moves the choice, with its check mark, to the colour clicked', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Red' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Blue' }).querySelector('svg')).toBeNull()
  })

  it('chooses a background colour from its swatch and shows its code', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Soft Gray' }))
    expect(screen.getByRole('button', { name: 'Soft Gray' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('#F3F4F6')).toBeInTheDocument()
    expect(screen.getByLabelText('Background color code')).toHaveValue('#F3F4F6')
  })

  it('takes a typed colour code: the label follows, and the swatch with that colour is chosen', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Background color code'), { target: { value: '#ffffff' } })
    expect(screen.getByText('#FFFFFF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the last whole colour while a code is half typed, and chooses no swatch for a colour that has none', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Background color code'), { target: { value: '#12' } })
    expect(screen.getByLabelText('Background color code')).toHaveValue('#12')
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Background color code'), { target: { value: '#123456' } })
    expect(screen.getByText('#123456')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { pressed: true })) expect(button).not.toHaveAccessibleName('Warm Sand')
  })

  it('shows the corner size as it is moved', () => {
    render(<Harness />)
    const slider = screen.getByRole('slider', { name: 'Round corners' })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '24')
    expect(slider).toHaveAttribute('step', '2')
    fireEvent.change(slider, { target: { value: '20' } })
    expect(screen.getByText('20 px')).toBeInTheDocument()
  })

  it('sends the four values with the form, as hidden fields that follow the choices', () => {
    const { container } = render(<Harness />)
    const read = () => Object.fromEntries([...container.querySelectorAll('input[type="hidden"]')].map((field) => [field.getAttribute('name'), (field as HTMLInputElement).value]))
    expect(read()).toEqual({ 'style-themeColor': '#0055C7', 'style-backgroundColor': '#F5EFE1', 'style-cornerRadius': '12', 'style-priceSize': '24' })
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.click(screen.getByRole('button', { name: 'White' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Round corners' }), { target: { value: '4' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Price size' }), { target: { value: '30' } })
    expect(read()).toEqual({ 'style-themeColor': '#E63946', 'style-backgroundColor': '#FFFFFF', 'style-cornerRadius': '4', 'style-priceSize': '30' })
  })

  it('has a price size slider from 12 to 48 px that shows its value', () => {
    render(<Harness />)
    const slider = screen.getByRole('slider', { name: 'Price size' })
    expect(slider).toHaveAttribute('min', '12')
    expect(slider).toHaveAttribute('max', '48')
    expect(slider).toHaveAttribute('step', '1')
    expect(slider).toHaveValue('24')
    expect(screen.getByText('24 px')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '36' } })
    expect(screen.getByText('36 px')).toBeInTheDocument()
  })

  it('reports the whole style on every change', () => {
    const changes: WidgetStyle[] = []
    render(<Harness onChange={(style) => changes.push(style)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Price size' }), { target: { value: '30' } })
    expect(changes).toEqual([{ ...DEFAULT_WIDGET_STYLE, themeColor: '#E63946' }, { ...DEFAULT_WIDGET_STYLE, themeColor: '#E63946', priceSize: 30 }])
  })

  it('opens with the saved style chosen', () => {
    render(<Harness initial={{ themeColor: '#7209B7', backgroundColor: '#FFFFFF', cornerRadius: 0, priceSize: 40 }} />)
    expect(screen.getByRole('button', { name: 'Purple' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('0 px')).toBeInTheDocument()
    expect(screen.getByText('40 px')).toBeInTheDocument()
  })

  it('has no submit buttons', () => {
    const { container } = render(<Harness />)
    for (const button of container.querySelectorAll('button')) expect(button).toHaveAttribute('type', 'button')
  })

  it('collapses and opens from its header, keeping the choices', () => {
    render(<Harness />)
    const header = screen.getByRole('button', { name: /Design/ })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Color theme')).not.toBeVisible()
    fireEvent.click(header)
    expect(screen.getByText('Color theme')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
  })
})
