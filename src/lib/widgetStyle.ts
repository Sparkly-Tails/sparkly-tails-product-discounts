// Readers for the design's two number-and-colour values, shared by the Settings page and its tests.
// Pure and client-safe (the form and the server both use it).

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
