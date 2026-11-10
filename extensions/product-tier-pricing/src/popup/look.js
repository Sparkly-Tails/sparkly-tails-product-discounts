// The look of one box, read the way the widget reads it: the discount's own style wins, then the embed's setting, then the
// stylesheet's default. The index is text, so a colour and a radius are checked again here before they can reach CSS.
const HEX_COLOR = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/
const MAX_RADIUS = 24

/** True for a whole #RRGGBB or #RRGGBBAA colour. */
export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/** The first whole hex colour of the list, upper-cased; '' when there is none. */
export function pickHexColor({ candidates }) {
  const found = candidates.find(isHexColor)
  return found === undefined ? '' : found.toUpperCase()
}

/** True for a whole number from 0 to 24. */
export function isCornerRadius(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_RADIUS
}

/** `{ background, radius }` of a box: the discount's style, else the embed's cream colour; the radius is null when the style has none that is usable. */
export function readBoxLook({ style, creamFallback, tools }) {
  const given = Object(style)
  return {
    background: tools.pickHexColor({ candidates: [given.backgroundColor, creamFallback] }),
    radius: tools.isCornerRadius(given.cornerRadius) ? given.cornerRadius : null,
  }
}

export function hasPropertyValue(pair) {
  return pair[1] !== ''
}

export function setBoxProperty({ box }, pair) {
  box.style.setProperty(pair[0], pair[1])
}

/** Sets the widget's custom properties on the box element; a value that is empty (no radius, a colour that was not usable) is left unset, so the stylesheet's default applies. */
export function applyBoxLook({ box, look, accents, tools }) {
  const properties = [
    ['--smooth-discounts-cream', look.background],
    ['--smooth-discounts-radius', look.radius === null ? '' : look.radius + 'px'],
    ['--smooth-discounts-moss', tools.pickHexColor({ candidates: [accents.moss] })],
    ['--smooth-discounts-sun', tools.pickHexColor({ candidates: [accents.sun] })],
  ]
  properties.filter(hasPropertyValue).forEach(tools.setBoxProperty.bind(null, { box }))
}

export const LOOK_TOOLS = { isHexColor, pickHexColor, isCornerRadius, readBoxLook, hasPropertyValue, setBoxProperty, applyBoxLook }
