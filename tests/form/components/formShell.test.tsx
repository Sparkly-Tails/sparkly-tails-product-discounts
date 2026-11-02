// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FormShell from '@/form/components/FormShell'
import FormFooter from '@/form/components/FormFooter'

afterEach(cleanup)

function renderShell() {
  return render(
    <FormShell
      breadcrumbLabel="Create tier discount"
      heading="Create tier discount"
      badge="Draft"
      preview={<p>preview content</p>}
      footer={<p>footer content</p>}
    >
      <p>form content</p>
    </FormShell>,
  )
}

describe('FormShell', () => {
  it('shows the breadcrumb with a link back to the discounts', () => {
    renderShell()
    expect(screen.getByRole('link', { name: 'Discounts' })).toHaveAttribute('href', '/')
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Create tier discount')).toBeInTheDocument()
  })

  it('shows the heading and its status badge', () => {
    renderShell()
    expect(screen.getByRole('heading', { level: 1, name: 'Create tier discount' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('puts the form in the 7-column column and the preview in the 5-column column', () => {
    renderShell()
    expect(screen.getByText('form content').parentElement).toHaveClass('lg:col-span-7')
    expect(screen.getByText('preview content').parentElement).toHaveClass('lg:col-span-5')
  })

  it('keeps the preview column in view while the form scrolls', () => {
    renderShell()
    const previewColumn = screen.getByText('preview content').parentElement as HTMLElement
    expect(previewColumn).toHaveClass('sticky')
    expect(previewColumn).toHaveClass('self-start')
  })

  it('shows the footer below both columns', () => {
    renderShell()
    const footer = screen.getByText('footer content')
    const columns = screen.getByText('form content').closest('.grid') as HTMLElement
    expect(columns.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('FormFooter', () => {
  it('shows its children on the right and the leading button on the left', () => {
    render(<FormFooter leading={<button type="button">Delete</button>}><button type="button">Go live</button></FormFooter>)
    const leading = screen.getByRole('button', { name: 'Delete' })
    const child = screen.getByRole('button', { name: 'Go live' })
    expect(leading.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no status line and no icon: Shopify\'s save bar says there are unsaved changes', () => {
    const { container } = render(<FormFooter><button type="button">Go live</button></FormFooter>)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toBe('Go live')
  })
})
