// The look of one discount's widget: two values, saved with the discount and carried to the storefront
// in the product's metafield. Pure and client-safe (the form and the server both use it).

export interface WidgetStyle {
  /** The tier card's background colour: #RRGGBB, or #RRGGBBAA when it is partly transparent. */
  backgroundColor: string
  /** The card's corner radius in px; the inner corners are derived from it. */
  cornerRadius: number
}

/** What the Design card starts with, and what a missing or bad value falls back to. */
export const DEFAULT_WIDGET_STYLE: WidgetStyle = { backgroundColor: '#F5EFE1', cornerRadius: 12 }

export const CORNER_RADIUS_RANGE = { min: 0, max: 24 }

/** A whole colour code (#RRGGBB or #RRGGBBAA) in capitals, or the fallback: nothing else can become CSS. */
export function readHexColor({ text, fallback }: { text: string; fallback: string }): string {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(text) ? text.toUpperCase() : fallback
}

/** A whole number moved into the range, or the fallback when the text is empty or not a number. */
export function readWholeNumber({ text, min, max, fallback }: { text: string; min: number; max: number; fallback: number }): number {
  const value = Number(text)
  return text.trim() === '' || Number.isNaN(value) ? fallback : Math.min(Math.max(Math.round(value), min), max)
}

export const WIDGET_STYLE_TOOLS = { readHexColor, readWholeNumber }

/** The style of the two values as text (a form's fields); each bad one is replaced by its default. */
export function readWidgetStyle({ values, tools }: {
  values: { backgroundColor: string; cornerRadius: string }
  tools: { readHexColor: typeof readHexColor; readWholeNumber: typeof readWholeNumber }
}): WidgetStyle {
  return {
    backgroundColor: tools.readHexColor({ text: values.backgroundColor, fallback: DEFAULT_WIDGET_STYLE.backgroundColor }),
    cornerRadius: tools.readWholeNumber({ text: values.cornerRadius, ...CORNER_RADIUS_RANGE, fallback: DEFAULT_WIDGET_STYLE.cornerRadius }),
  }
}
