import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as layout from '@/app/layout'
import { ensureFreshInstall } from '@/lib/freshInstall'

vi.mock('@/lib/freshInstall', () => ({ ensureFreshInstall: vi.fn() }))

describe('root layout', () => {
  beforeEach(() => {
    vi.mocked(ensureFreshInstall).mockReset()
  })

  // Without it Next prerenders the pages at build time, where there is no shop and no ID token.
  it('renders every page per request', () => {
    expect(layout.dynamic).toBe('force-dynamic')
  })

  it('makes sure a fresh installation is clean before it renders anything', async () => {
    vi.mocked(ensureFreshInstall).mockResolvedValue('fresh')

    const page = await layout.default({ children: null })

    expect(ensureFreshInstall).toHaveBeenCalledTimes(1)
    expect(page).toBeTruthy()
  })

  it('does not render the page when the installation could not be made clean (nothing may be saved over leftovers)', async () => {
    vi.mocked(ensureFreshInstall).mockRejectedValue(new Error('Shopify is down'))

    await expect(layout.default({ children: null })).rejects.toThrow('Shopify is down')
  })
})
