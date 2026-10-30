// The colours and the corner sizes the Design card offers, as in the design.
// Nothing here is saved yet: the card only shows the choices.

export interface ColorChoice {
  label: string
  hex: string
  /** The outline of an unchosen background swatch, where it differs from the others. */
  edgeClass?: string
}

export const THEME_COLORS: ColorChoice[] = [
  { label: 'Black', hex: '#1E2022' },
  { label: 'Red', hex: '#E63946' },
  { label: 'Orange', hex: '#F77F00' },
  { label: 'Yellow', hex: '#FCBF49' },
  { label: 'Green', hex: '#2A9D8F' },
  { label: 'Cyan', hex: '#00B4D8' },
  { label: 'Blue', hex: '#0055C7' },
  { label: 'Purple', hex: '#7209B7' },
  { label: 'Magenta', hex: '#F72585' },
]

export const BACKGROUND_COLORS: ColorChoice[] = [
  { label: 'Off White', hex: '#FBF9F5' },
  { label: 'Soft Gray', hex: '#F3F4F6' },
  { label: 'Warm Sand', hex: '#F5EFE1' },
  { label: 'Light Beige', hex: '#FAF5EF' },
  { label: 'Muted Slate', hex: '#F1F5F9' },
  { label: 'White', hex: '#FFFFFF', edgeClass: 'border-form-outline-variant/60' },
  { label: 'Dark Graphite', hex: '#191C16' },
]

export const DEFAULT_THEME_HEX = '#0055C7'
export const DEFAULT_BACKGROUND_HEX = '#F5EFE1'
export const DEFAULT_CORNER_RADIUS = 12

/** True for a whole colour code such as #F5EFE1. */
export function isHexColor({ text }: { text: string }): boolean {
  return /^#[0-9a-f]{6}$/i.test(text)
}

export function formatHexColor({ text }: { text: string }): string {
  return text.toUpperCase()
}
