import { describe, it, expect } from 'vitest'
import { DEFAULT_WIDGET_STYLE } from '@/lib/widgetStyle'
import { THEME_COLORS, BACKGROUND_COLORS, isHexColor, formatHexColor } from '@/form/designOptions'

describe('the colour choices of the design', () => {
  it('offers the nine theme colours, Blue among them, in the design order', () => {
    expect(THEME_COLORS.map((color) => color.label)).toEqual(['Black', 'Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta'])
    expect(THEME_COLORS.find((color) => color.hex === DEFAULT_WIDGET_STYLE.themeColor)?.label).toBe('Blue')
  })

  it('offers the seven background colours, Warm Sand among them', () => {
    expect(BACKGROUND_COLORS.map((color) => color.label)).toEqual(['Off White', 'Soft Gray', 'Warm Sand', 'Light Beige', 'Muted Slate', 'White', 'Dark Graphite'])
    expect(BACKGROUND_COLORS.find((color) => color.hex === DEFAULT_WIDGET_STYLE.backgroundColor)?.label).toBe('Warm Sand')
  })

  it('writes every colour as seven characters in capitals', () => {
    for (const color of [...THEME_COLORS, ...BACKGROUND_COLORS]) expect(color.hex).toMatch(/^#[0-9A-F]{6}$/)
  })
})

describe('isHexColor', () => {
  it.each([
    ['#F5EFE1', true],
    ['#f5efe1', true],
    ['#F5EFE', false],
    ['F5EFE1', false],
    ['#GGGGGG', false],
    ['', false],
  ])('judges "%s" as %s', (text, expected) => {
    expect(isHexColor({ text })).toBe(expected)
  })
})

describe('formatHexColor', () => {
  it('puts a typed colour in capitals', () => {
    expect(formatHexColor({ text: '#f5efe1' })).toBe('#F5EFE1')
  })
})
