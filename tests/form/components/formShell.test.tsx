// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FormShell from '@/form/components/FormShell'

afterEach(cleanup)

function renderShell({ actions = <button type="button">Go live</button>, notice = null }: { actions?: React.ReactNode; notice?: React.ReactNode } = {}) {
  return render(
    <FormShell breadcrumbLabel="Edit Discount" heading="Snowboard Campaign" badge="Live" actions={actions} notice={notice} preview={<p>preview content</p>}>
      <p>form content</p>
    </FormShell>,
  )
}

const header = () => screen.getByTestId('form-header')
const isAfter = (first: HTMLElement, second: HTMLElement) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('FormShell', () => {
  it('shows the breadcrumb with a link back to the discounts', () => {
    renderShell()
    expect(screen.getByRole('link', { name: 'Discounts' })).toHaveAttribute('href', '/')
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Edit Discount')).toBeInTheDocument()
  })

  it('shows the heading and its status badge', () => {
    renderShell()
    expect(screen.getByRole('heading', { level: 1, name: 'Snowboard Campaign' })).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows a line of help under the heading only when one is given', () => {
    const { rerender } = render(<FormShell breadcrumbLabel="Settings" heading="Settings" subtitle="Global storefront settings" actions={null} notice={null} preview={null}><p>form</p></FormShell>)
    expect(within(header()).getByText('Global storefront settings')).toBeInTheDocument()
    rerender(<FormShell breadcrumbLabel="Settings" heading="Settings" actions={null} notice={null} preview={null}><p>form</p></FormShell>)
    expect(screen.queryByText('Global storefront settings')).toBeNull()
  })

  it('puts the actions in the header, on the right of the heading and its badge', () => {
    renderShell()
    const actions = within(header()).getByRole('button', { name: 'Go live' })
    expect(isAfter(screen.getByText('Live'), actions)).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).closest('[data-testid="form-header-row"]')).toContainElement(actions)
  })

  it('has no actions, and no empty space for them, when there are none', () => {
    renderShell({ actions: null })
    expect(within(header()).queryByRole('button')).toBeNull()
    expect(header().querySelector('[data-testid="form-header-actions"]')).toBeNull()
  })

  it('keeps the header in view while the form scrolls, on the page background (not a white band), out to the sides of the page', () => {
    renderShell()
    expect(header()).toHaveClass('sticky', 'top-0', 'bg-form-surface', '-mx-form-lg', 'px-form-lg', 'py-2')
    expect(header().className).not.toContain('bg-form-surface-container-lowest')
    expect(header().className).not.toMatch(/(^|\s)p[tb]-/)
  })

  it('has the homepage title (24px bold) and leaves 2rem above the header and 1.5rem between it and the cards, as the homepage does', () => {
    const { container } = renderShell()
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/text-2xl/)
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/font-bold/)
    expect(container.firstElementChild).toHaveClass('pt-8', 'gap-6')
    expect(screen.getByText('form content').parentElement).toHaveClass('gap-6')
  })

  it('shows a line of help under the heading only when one is given', () => {
    const { rerender } = render(<FormShell breadcrumbLabel="Settings" heading="Settings" subtitle="Global storefront settings" actions={null} notice={null} preview={null}><p>form</p></FormShell>)
    expect(within(header()).getByText('Global storefront settings')).toBeInTheDocument()
    rerender(<FormShell breadcrumbLabel="Settings" heading="Settings" actions={null} notice={null} preview={null}><p>form</p></FormShell>)
    expect(screen.queryByText('Global storefront settings')).toBeNull()
  })

  it('puts the form in the 7-column column and the preview in the 5-column column', () => {
    renderShell()
    expect(screen.getByText('form content').parentElement).toHaveClass('lg:col-span-7')
    expect(screen.getByText('preview content').parentElement).toHaveClass('lg:col-span-5')
  })

  // The header is about 68px (8 + 16 + 4 + 32 + 8) and a page with a line of help under its heading is 24px taller, so the preview sticks at 96px.
  it('keeps the preview column in view while the form scrolls, just below the header', () => {
    renderShell()
    const previewColumn = screen.getByText('preview content').parentElement as HTMLElement
    expect(previewColumn).toHaveClass('sticky', 'self-start', 'top-24')
  })

  it('shows a notice between the header and the columns, and has no footer bar', () => {
    renderShell({ notice: <p>could not save</p> })
    const columns = screen.getByText('form content').closest('.grid') as HTMLElement
    expect(isAfter(header(), screen.getByText('could not save'))).toBe(true)
    expect(isAfter(screen.getByText('could not save'), columns)).toBe(true)
    expect(columns.nextElementSibling).toBeNull()
  })
})
