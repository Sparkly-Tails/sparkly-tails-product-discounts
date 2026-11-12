// The look of a box: the store-wide design the embed printed (the Settings page), or the stylesheet's default for a value
// that is missing. The embed's attributes are text, so a colour and a radius are checked again here before they can reach CSS.
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

/** `{ background, radius }` of a box, from the embed's background colour and corner radius; each is empty (`''`, `null`) when it is not usable. */
export function readBoxLook({ accents, tools }) {
  return {
    background: tools.pickHexColor({ candidates: [accents.cream] }),
    radius: tools.isCornerRadius(accents.radius) ? accents.radius : null,
  }
}

export function hasPropertyValue(pair) {
  return pair[1] !== ''
}

export function setBoxProperty({ box }, pair) {
  box.style.setProperty(pair[0], pair[1])
}

/** Sets the widget's custom properties on the box element, the flash bar tone included; a value that is empty (no radius, a colour that was not usable) is left unset, so the stylesheet's default applies. */
export function applyBoxLook({ box, look, accents, tools }) {
  const properties = [
    ['--smooth-discounts-cream', look.background],
    ['--smooth-discounts-radius', look.radius === null ? '' : look.radius + 'px'],
    ['--smooth-discounts-moss', tools.pickHexColor({ candidates: [accents.moss] })],
    ['--smooth-discounts-sun', tools.pickHexColor({ candidates: [accents.sun] })],
    ['--smooth-discounts-flash-dark', tools.pickHexColor({ candidates: [accents.night] })],
  ]
  properties.filter(hasPropertyValue).forEach(tools.setBoxProperty.bind(null, { box }))
}

export const LOOK_TOOLS = { isHexColor, pickHexColor, isCornerRadius, readBoxLook, hasPropertyValue, setBoxProperty, applyBoxLook }
