// Puts the offer on a card: the theme's own price is hidden and replaced by the struck price, "From £x" and a tag.
// The new price line takes the classes of the theme's price, so it is set in the theme's own type.

const MARK = 'smoothDiscountsCard'

export function isMarked({ root }) {
  return root.dataset[MARK] !== undefined
}

export function markCard({ root, state }) {
  root.dataset[MARK] = state
}

/** A card whose offer could not be made keeps its price; it is marked so it is not asked again. */
export function markCardOff(root) {
  root.dataset[MARK] = 'off'
}

/** One element with its text and class (a new element of the same document as `priceElement`). */
export function createTextElement({ document, tag, className, text }) {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

/** The block that takes the place of the theme's price: the plain price struck, then the price from. */
export function buildPriceBlock({ priceElement, wasText, fromText, tools }) {
  const document = priceElement.ownerDocument
  const block = document.createElement('div')
  block.className = (priceElement.className + ' smooth-discounts-card__price').trim()
  block.appendChild(tools.createTextElement({ document, tag: 's', className: 'smooth-discounts-card__was', text: wasText }))
  block.appendChild(tools.createTextElement({ document, tag: 'span', className: 'smooth-discounts-card__from', text: fromText }))
  return block
}

/** Replaces the theme's price with the offer, and adds the tag. Nothing is deleted: the theme's price is only hidden. */
export function paintCard({ target, offer, moneyFormat, tools }) {
  const { root, priceElement } = target
  const wasText = tools.formatMoney(offer.basePrice, moneyFormat)
  const block = tools.buildPriceBlock({ priceElement, wasText, fromText: tools.buildFromText({ offer, moneyFormat, tools }), tools })
  const tag = tools.createTextElement({ document: priceElement.ownerDocument, tag: 'span', className: 'smooth-discounts-card__tag', text: tools.buildTagText({ offer, moneyFormat, tools }) })
  priceElement.setAttribute('data-smooth-discounts-replaced', '')
  priceElement.insertAdjacentElement('afterend', block)
  block.insertAdjacentElement('afterend', tag)
  tools.markCard({ root, state: 'on' })
}

export const PAINT_TOOLS = { isMarked, markCard, markCardOff, createTextElement, buildPriceBlock, paintCard }
