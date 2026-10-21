// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

import VersionLabel from '@/components/VersionLabel'

afterEach(cleanup)

describe('VersionLabel', () => {
  it('shows the version on every page except the homepage', () => {
    navigation.pathname = '/discounts/new'
    render(<VersionLabel version="0.1.0" />)
    expect(screen.getByText('v0.1.0')).toBeInTheDocument()
  })

  it('shows nothing on the homepage, whose footer already has the version', () => {
    navigation.pathname = '/'
    const { container } = render(<VersionLabel version="0.1.0" />)
    expect(container).toBeEmptyDOMElement()
  })
})
