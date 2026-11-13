// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ThemePanel from '@/settings/components/ThemePanel'

afterEach(cleanup)

const PROPS = { shop: 'demo.myshopify.com', clientId: 'abc123' }

describe('ThemePanel', () => {
  it('shows the three blocks with Active or Not active and a link for each', async () => {
    const readBlocks = vi.fn(async () => [{ handle: 'tier-pricing', status: 'active' }, { handle: 'card-prices', status: 'available' }, { handle: 'bundle-popup', status: 'available' }])
    render(<ThemePanel {...PROPS} readBlocks={readBlocks} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Shopify Theme Integration' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Not active')).toHaveLength(2))
    expect(screen.getAllByText('Active')).toHaveLength(1)
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Product page widget/ })).toHaveAttribute('href', 'https://demo.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=abc123/tier-pricing&target=mainSection')
    expect(screen.getByRole('link', { name: /Pre-checkout pop-up/ })).toHaveAttribute('href', 'https://demo.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=abc123/bundle-popup')
  })

  it('says the status could not be read and still shows the three links when the read fails', async () => {
    render(<ThemePanel {...PROPS} readBlocks={async () => { throw new Error('no bridge') }} />)
    expect(await screen.findByText('Status could not be read')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('shows no theme name and no field to save', async () => {
    const { container } = render(<ThemePanel {...PROPS} readBlocks={async () => []} />)
    await waitFor(() => expect(screen.queryByText('Status could not be read')).toBeNull())
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0)
  })
})
