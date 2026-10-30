// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DesignCard from '@/form/components/DesignCard'

afterEach(cleanup)

describe('DesignCard', () => {
  it('shows the heading, what it is for and the three groups of controls', () => {
    render(<DesignCard />)
    expect(screen.getByRole('heading', { level: 2, name: 'Design' })).toBeInTheDocument()
    expect(screen.getByText('Card styling and color palettes for the storefront widget')).toBeInTheDocument()
    expect(screen.getByText('Color theme')).toBeInTheDocument()
    expect(screen.getByText('Secondary background color')).toBeInTheDocument()
    expect(screen.getByText('Round corners')).toBeInTheDocument()
  })

  it('starts with Blue, Warm Sand and 12 px chosen', () => {
    render(<DesignCard />)
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('12 px')).toBeInTheDocument()
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
  })

  it('moves the choice, with its check mark, to the colour clicked', () => {
    render(<DesignCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Red' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Blue' }).querySelector('svg')).toBeNull()
  })

  it('chooses a background colour from its swatch and shows its code', () => {
    render(<DesignCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Soft Gray' }))
    expect(screen.getByRole('button', { name: 'Soft Gray' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('#F3F4F6')).toBeInTheDocument()
    expect(screen.getByLabelText('Background color code')).toHaveValue('#F3F4F6')
  })

  it('takes a typed colour code: the label follows, and the swatch with that colour is chosen', () => {
    render(<DesignCard />)
    fireEvent.change(screen.getByLabelText('Background color code'), { target: { value: '#ffffff' } })
    expect(screen.getByText('#FFFFFF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Warm Sand' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the last whole colour while a code is half typed, and chooses no swatch for a colour that has none', () => {
    render(<DesignCard />)
    fireEvent.change(screen.getByLabelText('Background color code'), { target: { value: '#12' } })
    expect(screen.getByLabelText('Background color code')).toHaveValue('#12')
    expect(screen.getByText('#F5EFE1')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Background color code'), { target: { value: '#123456' } })
    expect(screen.getByText('#123456')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { pressed: true })) expect(button).not.toHaveAccessibleName('Warm Sand')
  })

  it('shows the corner size as it is moved', () => {
    render(<DesignCard />)
    const slider = screen.getByRole('slider', { name: 'Round corners' })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '24')
    expect(slider).toHaveAttribute('step', '2')
    fireEvent.change(slider, { target: { value: '20' } })
    expect(screen.getByText('20 px')).toBeInTheDocument()
  })

  it('sends nothing with the form: no field has a name', () => {
    const { container } = render(<DesignCard />)
    expect(container.querySelectorAll('[name]')).toHaveLength(0)
  })

  it('has no submit buttons', () => {
    const { container } = render(<DesignCard />)
    for (const button of container.querySelectorAll('button')) expect(button).toHaveAttribute('type', 'button')
  })

  it('collapses and opens from its header, keeping the choices', () => {
    render(<DesignCard />)
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
