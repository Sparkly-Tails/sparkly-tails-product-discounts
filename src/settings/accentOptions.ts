// The accent colours the Appearance panel offers as swatches (the first is the default).
import type { ColorChoice } from '@/form/designOptions'

export const ACCENT_COLORS: ColorChoice[] = [
  { label: 'Moss', hex: '#434625' },
  { label: 'Pine', hex: '#1B3A2D' },
  { label: 'Terracotta', hex: '#8A4B2D' },
  { label: 'Slate', hex: '#2F4858' },
  { label: 'Plum', hex: '#5B3A6B' },
]

/** True for a whole solid colour code such as #434625: the accent has no transparency. */
export function isSolidHexColor({ text }: { text: string }): boolean {
  return /^#[0-9a-f]{6}$/i.test(text)
}
