// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DesignCard from '@/form/components/DesignCard'
import { DEFAULT_WIDGET_STYLE, type WidgetStyle } from '@/lib/widgetStyle'

// The card is held by the form; this holds it for the tests and reports every change.
function Harness({ initial = DEFAULT_WIDGET_STYLE, onChange = () => {} }: { initial?: WidgetStyle; onChange?: (style: WidgetStyle) => void }) {
  const [style, setStyle] = useState(initial)
  return <DesignCard style={style} onChange={(next) => { setStyle(next); onChange(next) }} />
}

afterEach(cleanup)

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open colour picker' }))
  return screen.getByRole('dialog', { name: 'Colour picker' })
}

describe('DesignCard', () => {
  it('shows the heading, what it is for and the three groups of controls', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { level: 2, name: 'Design' })).toBeInTheDocument()
    expect(screen.getByText('Card styling and color palettes for the storefront widget')).toBeInTheDocument()
    expect(screen.getByText('Background colour')).toBeInTheDocument()
    expect(screen.getByText('Round corners')).toBeInTheDocument()
    expect(screen.getByText('Price size')).toBeInTheDocument()
  })

  it('has no colour theme section any more, and does not call the background "secondary"', () => {
    const { container } = render(<Harness />)
    expect(screen.queryByText('Color theme')).toBeNull()
    expect(screen.queryByText('Secondary background color')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Blue' })).toBeNull()
    expect(container.querySelector('[name="style-themeColor"]')).toBeNull()
  })

  it('starts with Warm Sand and 12 px chosen', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('12 px')).toBeInTheDocument()
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
  })

  it('chooses a background colour from its swatch and shows its code', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Soft Gray' }))
    expect(screen.getByRole('button', { name: 'Soft Gray' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Soft Gray' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('#F3F4F6')).toBeInTheDocument()
    expect(screen.getByLabelText('Background colour code')).toHaveValue('#F3F4F6')
  })

  it('takes a typed colour code: the label follows, and the swatch with that colour is chosen', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#ffffff' } })
    expect(screen.getByText('#FFFFFF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('takes a typed code with transparency, and chooses no swatch for it', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#ffffffcc' } })
    expect(screen.getByText('#FFFFFFCC')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([])
  })

  it('keeps the last whole colour while a code is half typed, and chooses no swatch for a colour that has none', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#12' } })
    expect(screen.getByLabelText('Background colour code')).toHaveValue('#12')
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#123456' } })
    expect(screen.getByText('#123456')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([])
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

  it('sends the three values with the form, as hidden fields that follow the choices', () => {
    const { container } = render(<Harness />)
    const read = () => Object.fromEntries([...container.querySelectorAll('input[type="hidden"]')].map((field) => [field.getAttribute('name'), (field as HTMLInputElement).value]))
    expect(read()).toEqual({ 'style-backgroundColor': '#F5EFE1', 'style-cornerRadius': '12', 'style-priceSize': '24' })
    fireEvent.click(screen.getByRole('button', { name: 'White' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Round corners' }), { target: { value: '4' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Price size' }), { target: { value: '30' } })
    expect(read()).toEqual({ 'style-backgroundColor': '#FFFFFF', 'style-cornerRadius': '4', 'style-priceSize': '30' })
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
    fireEvent.click(screen.getByRole('button', { name: 'White' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Price size' }), { target: { value: '30' } })
    expect(changes).toEqual([{ ...DEFAULT_WIDGET_STYLE, backgroundColor: '#FFFFFF' }, { ...DEFAULT_WIDGET_STYLE, backgroundColor: '#FFFFFF', priceSize: 30 }])
  })

  it('opens with the saved style chosen', () => {
    render(<Harness initial={{ backgroundColor: '#FFFFFF', cornerRadius: 0, priceSize: 40 }} />)
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('0 px')).toBeInTheDocument()
    expect(screen.getByText('40 px')).toBeInTheDocument()
  })

  it('has no submit buttons', () => {
    const { container } = render(<Harness />)
    openPicker()
    for (const button of container.querySelectorAll('button')) expect(button).toHaveAttribute('type', 'button')
  })

  it('collapses and opens from its header, keeping the choices', () => {
    render(<Harness />)
    const header = screen.getByRole('button', { name: /Design/ })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'White' }))
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Background colour')).not.toBeVisible()
    fireEvent.click(header)
    expect(screen.getByText('Background colour')).toBeVisible()
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('DesignCard: the colour in use', () => {
  it('is shown in the first circle, before the swatches', () => {
    render(<Harness />)
    const circle = screen.getByRole('img', { name: 'Current colour #F5EFE1' })
    const row = circle.parentElement as HTMLElement
    expect(row.firstElementChild).toBe(circle)
    expect(row.querySelectorAll('button').length).toBeGreaterThanOrEqual(7)
  })

  it('follows the colour chosen from a swatch, typed, or picked in the picker, solid or partly transparent', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Soft Gray' }))
    expect(screen.getByRole('img', { name: 'Current colour #F3F4F6' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#2a9d8f' } })
    expect(screen.getByRole('img', { name: 'Current colour #2A9D8F' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#ffffffcc' } })
    expect(screen.getByRole('img', { name: 'Current colour #FFFFFFCC' })).toBeInTheDocument()
    fireEvent.click(openPicker().querySelector('[aria-label="Transparency"]') as HTMLElement)
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('slider', { name: 'Transparency' }), { target: { value: '40' } })
    expect(screen.getByRole('img', { name: 'Current colour #FFFFFF66' })).toBeInTheDocument()
  })

  it('paints the colour itself, over a checkerboard so transparency can be seen', () => {
    render(<Harness initial={{ ...DEFAULT_WIDGET_STYLE, backgroundColor: '#2A9D8F' }} />)
    const circle = screen.getByRole('img', { name: 'Current colour #2A9D8F' })
    expect(circle.querySelector('[data-colour]')).toHaveStyle({ backgroundColor: 'rgb(42, 157, 143)' })
    expect(circle.style.backgroundImage).toContain('linear-gradient')
  })

  it('keeps the last whole colour while a code is half typed', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#12' } })
    expect(screen.getByRole('img', { name: 'Current colour #F5EFE1' })).toBeInTheDocument()
  })
})

describe('DesignCard: the layout', () => {
  it('puts Round corners and Price size in one row, a half of the width each', () => {
    render(<Harness />)
    const row = screen.getByRole('slider', { name: 'Round corners' }).closest('.grid') as HTMLElement
    expect(row).not.toBeNull()
    expect(row).toHaveClass('grid-cols-2')
    expect(row).toContainElement(screen.getByRole('slider', { name: 'Price size' }))
  })
})

describe('DesignCard: the colour picker', () => {
  it('is closed until the colour picker icon is pressed', () => {
    render(<Harness />)
    const icon = screen.getByRole('button', { name: 'Open colour picker' })
    expect(icon).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(icon)
    expect(icon).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Colour picker' })).toBeInTheDocument()
  })

  it('is 60% of the width of the Design card, not all of it', () => {
    render(<Harness />)
    const panel = openPicker()
    expect(panel).toHaveClass('w-3/5')
    expect(panel).not.toHaveClass('right-0')
  })

  it('shows the red, green, blue and transparency of the colour it opens with', () => {
    render(<Harness />)
    const picker = within(openPicker())
    expect(picker.getByRole('spinbutton', { name: 'Red value' })).toHaveValue(245)
    expect(picker.getByRole('spinbutton', { name: 'Green value' })).toHaveValue(239)
    expect(picker.getByRole('spinbutton', { name: 'Blue value' })).toHaveValue(225)
    expect(picker.getByRole('spinbutton', { name: 'Transparency value' })).toHaveValue(100)
    expect(picker.getByRole('slider', { name: 'Red' })).toHaveValue('245')
    expect(picker.getByRole('slider', { name: 'Transparency' })).toHaveValue('100')
  })

  it('offers a selection of colours to choose from, and a chosen one replaces the colour', () => {
    const changes: WidgetStyle[] = []
    render(<Harness onChange={(style) => changes.push(style)} />)
    const picker = within(openPicker())
    for (const label of ['Off White', 'Soft Gray', 'Warm Sand', 'Light Beige', 'Muted Slate', 'White', 'Dark Graphite', 'Black', 'Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta']) {
      expect(picker.getByRole('button', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(picker.getByRole('button', { name: 'Red' }))
    expect(changes.at(-1)?.backgroundColor).toBe('#E63946')
    expect(screen.getByText('#E63946')).toBeInTheDocument()
    expect(picker.getByRole('spinbutton', { name: 'Green value' })).toHaveValue(57)
  })

  it('keeps the transparency when a colour is chosen from the selection', () => {
    render(<Harness initial={{ ...DEFAULT_WIDGET_STYLE, backgroundColor: '#F5EFE180' }} />)
    const picker = within(openPicker())
    fireEvent.click(picker.getByRole('button', { name: 'Red' }))
    expect(screen.getByText('#E6394680')).toBeInTheDocument()
  })

  it('changes one channel at a time, from its number box or its slider', () => {
    render(<Harness />)
    const picker = within(openPicker())
    fireEvent.change(picker.getByRole('spinbutton', { name: 'Red value' }), { target: { value: '0' } })
    expect(screen.getByText('#00EFE1')).toBeInTheDocument()
    fireEvent.change(picker.getByRole('slider', { name: 'Blue' }), { target: { value: '255' } })
    expect(screen.getByText('#00EFFF')).toBeInTheDocument()
    expect(picker.getByRole('slider', { name: 'Blue' })).toHaveValue('255')
    expect(picker.getByRole('spinbutton', { name: 'Blue value' })).toHaveValue(255)
  })

  it('keeps a channel inside 0 to 255', () => {
    render(<Harness />)
    const picker = within(openPicker())
    fireEvent.change(picker.getByRole('spinbutton', { name: 'Green value' }), { target: { value: '999' } })
    expect(screen.getByText('#F5FFE1')).toBeInTheDocument()
    fireEvent.change(picker.getByRole('spinbutton', { name: 'Green value' }), { target: { value: '-20' } })
    expect(screen.getByText('#F500E1')).toBeInTheDocument()
  })

  it('changes the transparency, giving an eight-digit code, and back to six digits at 100', () => {
    const { container } = render(<Harness />)
    const picker = within(openPicker())
    fireEvent.change(picker.getByRole('slider', { name: 'Transparency' }), { target: { value: '50' } })
    expect(screen.getByText('#F5EFE180')).toBeInTheDocument()
    expect(screen.getByLabelText('Background colour code')).toHaveValue('#F5EFE180')
    expect((container.querySelector('[name="style-backgroundColor"]') as HTMLInputElement).value).toBe('#F5EFE180')
    fireEvent.change(picker.getByRole('spinbutton', { name: 'Transparency value' }), { target: { value: '100' } })
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
  })

  it('follows a code typed in the box while it is open', () => {
    render(<Harness />)
    const picker = within(openPicker())
    fireEvent.change(screen.getByLabelText('Background colour code'), { target: { value: '#0A141E40' } })
    expect(picker.getByRole('spinbutton', { name: 'Red value' })).toHaveValue(10)
    expect(picker.getByRole('spinbutton', { name: 'Transparency value' })).toHaveValue(25)
  })

  it('closes with Done, with Escape, and when something outside it is pressed, and keeps the colour', () => {
    render(<Harness />)
    openPicker()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('slider', { name: 'Transparency' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('slider', { name: 'Transparency' }), { target: { value: '60' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('#F5EFE199')).toBeInTheDocument()

    openPicker()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    openPicker()
    fireEvent.mouseDown(screen.getByText('Round corners'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('#F5EFE199')).toBeInTheDocument()
  })

  it('stays open while something inside it is pressed', () => {
    render(<Harness />)
    openPicker()
    fireEvent.mouseDown(within(screen.getByRole('dialog')).getByText('Transparency'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
