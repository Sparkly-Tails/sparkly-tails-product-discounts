import { describe, it, expect } from 'vitest'
import * as layout from '@/app/layout'

describe('root layout', () => {
  // Without it Next prerenders the pages at build time, where there is no shop and no ID token.
  it('renders every page per request', () => {
    expect(layout.dynamic).toBe('force-dynamic')
  })
})
