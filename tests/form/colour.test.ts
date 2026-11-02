import { describe, it, expect } from 'vitest'
import { joinColour, splitColour } from '@/form/colour'

describe('splitColour', () => {
  it('reads the red, green and blue of a six-digit colour, fully opaque', () => {
    expect(splitColour({ hex: '#F5EFE1' })).toEqual({ red: 245, green: 239, blue: 225, alpha: 100 })
  })

  it('reads the transparency of an eight-digit colour as a whole percent', () => {
    expect(splitColour({ hex: '#F5EFE180' })).toEqual({ red: 245, green: 239, blue: 225, alpha: 50 })
    expect(splitColour({ hex: '#00000000' }).alpha).toBe(0)
    expect(splitColour({ hex: '#000000FF' }).alpha).toBe(100)
  })

  it('reads lower-case codes too', () => {
    expect(splitColour({ hex: '#f5efe1cc' })).toEqual({ red: 245, green: 239, blue: 225, alpha: 80 })
  })
})

describe('joinColour', () => {
  it('writes six digits, in capitals, while the colour is fully opaque, so saved colours stay as they were', () => {
    expect(joinColour({ red: 245, green: 239, blue: 225, alpha: 100 })).toBe('#F5EFE1')
    expect(joinColour({ red: 0, green: 5, blue: 255, alpha: 100 })).toBe('#0005FF')
  })

  it('writes eight digits once there is any transparency', () => {
    expect(joinColour({ red: 245, green: 239, blue: 225, alpha: 80 })).toBe('#F5EFE1CC')
    expect(joinColour({ red: 245, green: 239, blue: 225, alpha: 0 })).toBe('#F5EFE100')
    expect(joinColour({ red: 245, green: 239, blue: 225, alpha: 99 })).toHaveLength(9)
    expect(joinColour({ red: 245, green: 239, blue: 225, alpha: 50 })).toBe('#F5EFE180')
  })

  it('keeps every part inside its range', () => {
    expect(joinColour({ red: 300, green: -4, blue: 12.6, alpha: 140 })).toBe('#FF000D')
    expect(joinColour({ red: 0, green: 0, blue: 0, alpha: -5 })).toBe('#00000000')
  })

  it('gives back what splitColour read, for every whole percent of transparency', () => {
    for (let alpha = 0; alpha <= 100; alpha += 1) {
      expect(splitColour({ hex: joinColour({ red: 10, green: 20, blue: 30, alpha }) }).alpha).toBe(alpha)
    }
  })
})
