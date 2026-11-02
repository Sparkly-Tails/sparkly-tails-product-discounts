// Colour codes for the colour picker: #RRGGBB (opaque) or #RRGGBBAA (partly transparent), and their parts.

export interface ColourParts {
  /** Whole numbers from 0 to 255. */
  red: number
  green: number
  blue: number
  /** How opaque the colour is, as a whole percent: 100 is solid, 0 is invisible. */
  alpha: number
}

/** The red, green, blue and opacity of a whole colour code (#RRGGBB is fully opaque). */
export function splitColour({ hex }: { hex: string }): ColourParts {
  const digits = hex.slice(1)
  const alphaByte = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) : 255
  return {
    red: parseInt(digits.slice(0, 2), 16),
    green: parseInt(digits.slice(2, 4), 16),
    blue: parseInt(digits.slice(4, 6), 16),
    alpha: Math.round((alphaByte / 255) * 100),
  }
}

/** A colour code in capitals: six digits while the colour is solid (so saved colours stay as they were), eight once it is not. */
export function joinColour({ red, green, blue, alpha }: ColourParts): string {
  const bytes = [red, green, blue].map((part) => Math.min(Math.max(Math.round(part), 0), 255))
  const percent = Math.min(Math.max(Math.round(alpha), 0), 100)
  const parts = percent === 100 ? bytes : [...bytes, Math.round((percent * 255) / 100)]
  return '#' + parts.map((part) => part.toString(16).padStart(2, '0')).join('').toUpperCase()
}
