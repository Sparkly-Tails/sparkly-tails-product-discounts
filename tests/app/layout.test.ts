import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as layout from '@/app/layout'
import { ensureFreshInstall } from '@/lib/freshInstall'
import VersionLabel from '@/components/VersionLabel'

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

  it('shows the version through the VersionLabel, which hides itself on the homepage', async () => {
    vi.mocked(ensureFreshInstall).mockResolvedValue('fresh')

    const page = await layout.default({ children: null })

    const found: unknown[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const element = node as { type?: unknown; props?: { children?: unknown } }
      if (element.type === VersionLabel) found.push(node)
      const children = element.props?.children
      for (const child of Array.isArray(children) ? children : [children]) walk(child)
    }
    walk(page)

    expect(found).toHaveLength(1)
  })

  // Loaded straight from Google (not through next/font/google, which Turbopack could not resolve on Vercel).
  it('loads the Inter typeface from Google Fonts with a plain stylesheet link and preconnects', async () => {
    vi.mocked(ensureFreshInstall).mockResolvedValue('fresh')

    const page = await layout.default({ children: null })

    const links: { rel?: string; href?: string; crossOrigin?: string }[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const element = node as { type?: unknown; props?: { children?: unknown; rel?: string; href?: string; crossOrigin?: string } }
      if (element.type === 'link' && element.props) links.push(element.props)
      const children = element.props?.children
      for (const child of Array.isArray(children) ? children : [children]) walk(child)
    }
    walk(page)

    expect(links).toContainEqual(expect.objectContaining({ rel: 'preconnect', href: 'https://fonts.googleapis.com' }))
    expect(links).toContainEqual(expect.objectContaining({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' }))
    expect(links).toContainEqual(expect.objectContaining({ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }))
  })
})
