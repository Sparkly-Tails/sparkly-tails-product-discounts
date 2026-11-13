import { describe, it, expect } from 'vitest'
import { CORNER_RADIUS_RANGE, readHexColor, readWholeNumber } from '@/lib/widgetStyle'

describe('CORNER_RADIUS_RANGE', () => {
  it('is 0 to 24 px', () => {
    expect(CORNER_RADIUS_RANGE).toEqual({ min: 0, max: 24 })
  })
})

describe('readHexColor', () => {
  it('keeps a whole colour code, in capitals', () => {
    expect(readHexColor({ text: '#0055c7', fallback: '#000000' })).toBe('#0055C7')
  })

  it('keeps a colour code with transparency (#RRGGBBAA), in capitals', () => {
    expect(readHexColor({ text: '#f5efe1cc', fallback: '#000000' })).toBe('#F5EFE1CC')
  })

  it('falls back for anything that is not exactly #RRGGBB or #RRGGBBAA, so no CSS can get through', () => {
    for (const text of ['', 'red', '#fff', '#12345', '#1234567', '#123456789', '#12345G', '#12345GFF', 'null', '#0055C7;}', '#0055C7CC;}', 'url(x)']) {
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
