import { describe, it, expect } from 'vitest'
import { DEFAULT_WIDGET_STYLE, WIDGET_STYLE_TOOLS, readHexColor, readWholeNumber, readWidgetStyle } from '@/lib/widgetStyle'

describe('DEFAULT_WIDGET_STYLE', () => {
  it('is what the Design card starts with', () => {
    expect(DEFAULT_WIDGET_STYLE).toEqual({ themeColor: '#0055C7', backgroundColor: '#F5EFE1', cornerRadius: 12, priceSize: 24 })
  })
})

describe('readHexColor', () => {
  it('keeps a whole colour code, in capitals', () => {
    expect(readHexColor({ text: '#0055c7', fallback: '#000000' })).toBe('#0055C7')
  })

  it('falls back for anything that is not exactly #RRGGBB, so no CSS can get through', () => {
    for (const text of ['', 'red', '#fff', '#12345', '#1234567', '#12345G', 'null', '#0055C7;}', 'url(x)']) {
      expect(readHexColor({ text, fallback: '#ABCDEF' })).toBe('#ABCDEF')
    }
  })
})

describe('readWholeNumber', () => {
  it('reads a number inside the range, rounded to a whole number', () => {
    expect(readWholeNumber({ text: '18', min: 12, max: 48, fallback: 24 })).toBe(18)
    expect(readWholeNumber({ text: '18.6', min: 12, max: 48, fallback: 24 })).toBe(19)
  })

  it('keeps a number inside the range by moving it to the nearest end', () => {
    expect(readWholeNumber({ text: '5', min: 12, max: 48, fallback: 24 })).toBe(12)
    expect(readWholeNumber({ text: '500', min: 12, max: 48, fallback: 24 })).toBe(48)
  })

  it('falls back for an empty or non-numeric value', () => {
    for (const text of ['', '  ', 'abc', 'null', 'NaN']) expect(readWholeNumber({ text, min: 12, max: 48, fallback: 24 })).toBe(24)
  })
})

describe('readWidgetStyle', () => {
  it('reads all four values', () => {
    expect(readWidgetStyle({ values: { themeColor: '#e63946', backgroundColor: '#ffffff', cornerRadius: '0', priceSize: '36' }, tools: WIDGET_STYLE_TOOLS })).toEqual({
      themeColor: '#E63946', backgroundColor: '#FFFFFF', cornerRadius: 0, priceSize: 36,
    })
  })

  it('replaces every bad value by its default', () => {
    expect(readWidgetStyle({ values: { themeColor: 'x', backgroundColor: '', cornerRadius: 'wide', priceSize: '' }, tools: WIDGET_STYLE_TOOLS })).toEqual(DEFAULT_WIDGET_STYLE)
  })
})
