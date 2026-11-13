// The store-wide look of the widget and the pop-up: four values, saved once for the store.
// Pure and client-safe (the Settings page and the server both use it).
import { CORNER_RADIUS_RANGE, readHexColor, readWholeNumber } from '@/lib/widgetStyle'

export type FlashTone = 'olive-night' | 'pure-onyx' | 'deep-pine'

/** The colour each flash tone prints as the flash bar's background. */
export const FLASH_TONE_COLOURS: Record<FlashTone, string> = {
  'olive-night': '#2B2D17',
  'pure-onyx': '#111111',
  'deep-pine': '#1B3A2D',
}

export interface DesignSettings {
  /** The accent (moss) colour: #RRGGBB. */
  accentColor: string
  /** The widget's surface colour: #RRGGBB, or #RRGGBBAA when partly transparent. */
  backgroundColor: string
  /** Corner radius in px, 0 to 24. */
  cornerRadius: number
  flashTone: FlashTone
}

/** What a store that has not saved settings gets, and what a missing or bad value falls back to. */
export const DEFAULT_DESIGN: DesignSettings = { accentColor: '#434625', backgroundColor: '#F5EFE1', cornerRadius: 12, flashTone: 'olive-night' }

/** The whole-colour code length (#RRGGBB) that has no transparency. */
const SOLID_COLOUR_LENGTH = 7

/** The value as an object's fields; anything that is not a plain object has none. */
export function pickRecord({ value }: { value: unknown }): Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]' ? (value as Record<string, unknown>) : {}
}

/** Text or a number as text; anything else as empty text, which no reader accepts. */
export function pickText({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/** A solid colour (#RRGGBB) or the fallback: the accent has no transparency. */
export function readSolidColor({ text, fallback, tools }: { text: string; fallback: string; tools: { readHexColor: typeof readHexColor } }): string {
  return text.length === SOLID_COLOUR_LENGTH ? tools.readHexColor({ text, fallback }) : fallback
}

export function readFlashTone({ value }: { value: unknown }): FlashTone {
  return typeof value === 'string' && Object.hasOwn(FLASH_TONE_COLOURS, value) ? (value as FlashTone) : DEFAULT_DESIGN.flashTone
}

export const DESIGN_TOOLS = { pickRecord, pickText, readSolidColor, readFlashTone, readHexColor, readWholeNumber }

/** The design from stored data; each missing or bad field becomes its default. */
export function readDesign({ value, tools = DESIGN_TOOLS }: { value: unknown; tools?: typeof DESIGN_TOOLS }): DesignSettings {
  const record = tools.pickRecord({ value })
  return {
    accentColor: tools.readSolidColor({ text: tools.pickText({ value: record.accentColor }), fallback: DEFAULT_DESIGN.accentColor, tools }),
    backgroundColor: tools.readHexColor({ text: tools.pickText({ value: record.backgroundColor }), fallback: DEFAULT_DESIGN.backgroundColor }),
    cornerRadius: tools.readWholeNumber({ text: tools.pickText({ value: record.cornerRadius }), ...CORNER_RADIUS_RANGE, fallback: DEFAULT_DESIGN.cornerRadius }),
    flashTone: tools.readFlashTone({ value: record.flashTone }),
  }
}

/** The storefront's CSS variables for a design, as the text of a style attribute. */
export function buildDesignVars({ accentColor, backgroundColor, cornerRadius, flashTone }: DesignSettings): string {
  return [
    `--smooth-discounts-moss:${accentColor}`,
    `--smooth-discounts-cream:${backgroundColor}`,
    `--smooth-discounts-radius:${cornerRadius}px`,
    `--smooth-discounts-flash-dark:${FLASH_TONE_COLOURS[flashTone]}`,
  ].join(';')
}

/** What the form's preview paints the widget with: the design's four values, the flash tone as its colour (the shape of WidgetPaint, src/form/preview/previewModel.ts). */
export function buildDesignPaint({ accentColor, backgroundColor, cornerRadius, flashTone }: DesignSettings): { accentColor: string; backgroundColor: string; cornerRadius: number; flashColor: string } {
  return { accentColor, backgroundColor, cornerRadius, flashColor: FLASH_TONE_COLOURS[flashTone] }
}
