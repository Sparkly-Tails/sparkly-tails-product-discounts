import { describe, it, expect } from 'vitest'
import { DEFAULT_DESIGN, FLASH_TONE_COLOURS, readDesign, buildDesignVars } from '@/settings/design'

describe('readDesign', () => {
  it('returns the defaults for nothing, an empty object or null', () => {
    expect(readDesign({ value: undefined })).toEqual(DEFAULT_DESIGN)
    expect(readDesign({ value: {} })).toEqual(DEFAULT_DESIGN)
    expect(readDesign({ value: null })).toEqual(DEFAULT_DESIGN)
  })

  it('has the owner defaults', () => {
    expect(DEFAULT_DESIGN).toEqual({ accentColor: '#434625', backgroundColor: '#F5EFE1', cornerRadius: 12, flashTone: 'olive-night' })
  })

  it('keeps valid values', () => {
    const design = { accentColor: '#112233', backgroundColor: '#11223380', cornerRadius: 0, flashTone: 'deep-pine' }
    expect(readDesign({ value: design })).toEqual({ ...design, backgroundColor: '#11223380' })
  })

  it('falls back per field for hostile or malformed values', () => {
    expect(readDesign({ value: { accentColor: 'red;}</style>' } }).accentColor).toBe(DEFAULT_DESIGN.accentColor)
    expect(readDesign({ value: { accentColor: '#1234' } }).accentColor).toBe(DEFAULT_DESIGN.accentColor)
    expect(readDesign({ value: { accentColor: '#11223380' } }).accentColor).toBe(DEFAULT_DESIGN.accentColor)
    expect(readDesign({ value: { backgroundColor: 'url(x)' } }).backgroundColor).toBe(DEFAULT_DESIGN.backgroundColor)
    expect(readDesign({ value: { flashTone: 'blue' } }).flashTone).toBe('olive-night')
  })

  it('moves the radius into 0 to 24 and falls back for text', () => {
    expect(readDesign({ value: { cornerRadius: 25 } }).cornerRadius).toBe(24)
    expect(readDesign({ value: { cornerRadius: -1 } }).cornerRadius).toBe(0)
    expect(readDesign({ value: { cornerRadius: 'abc' } }).cornerRadius).toBe(12)
    expect(readDesign({ value: { cornerRadius: NaN } }).cornerRadius).toBe(12)
  })
})

describe('buildDesignVars', () => {
  it('prints the four storefront variables in this exact format', () => {
    expect(buildDesignVars(DEFAULT_DESIGN)).toBe('--smooth-discounts-moss:#434625;--smooth-discounts-cream:#F5EFE1;--smooth-discounts-radius:12px;--smooth-discounts-flash-dark:#2B2D17')
  })

  it('uses the colour of the chosen flash tone', () => {
    expect(FLASH_TONE_COLOURS).toEqual({ 'olive-night': '#2B2D17', 'pure-onyx': '#111111', 'deep-pine': '#1B3A2D' })
    expect(buildDesignVars({ ...DEFAULT_DESIGN, flashTone: 'pure-onyx' })).toContain('--smooth-discounts-flash-dark:#111111')
  })
})
