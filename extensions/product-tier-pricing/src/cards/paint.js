// Puts the offer on a card: the theme's own price is hidden and replaced by the struck price, "From £x" and a tag.
// The new price line takes the classes of the theme's price, so it is set in the theme's own type.

const MARK = 'smoothDiscountsCard'
const POSITIONED_VALUES = ['relative', 'absolute', 'fixed', 'sticky']

export function isMarked({ root }) {
  return root.dataset[MARK] !== undefined
}

export function markCard({ root, state }) {
  root.dataset[MARK] = state
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

/** The element an image sits in (for an image in a picture element, the one the picture sits in), or null for a card without an image. */
export function findMediaElement({ root }) {
  const image = root.querySelector('img')
  return image === null ? null : image.closest('picture') ? image.closest('picture').parentElement : image.parentElement
}

/** Makes sure a tag can be placed in the corner of the image, without changing a holder the theme already made a positioning box. */
export function prepareMedia({ media }) {
  const style = media.ownerDocument.defaultView.getComputedStyle(media)
  if (!POSITIONED_VALUES.includes(style.position)) media.classList.add('smooth-discounts-card__media')
}

/** The tag goes on the product image like the theme's sale badge; a card without an image has it under the price. */
export function placeTag({ tag, block, root, tools }) {
  const media = tools.findMediaElement({ root })
  if (media === null) return block.insertAdjacentElement('afterend', tag)
  tools.prepareMedia({ media })
  tag.classList.add('smooth-discounts-card__tag--image')
  media.appendChild(tag)
}

/** Replaces the theme's price with the offer, and adds the tag. Nothing is deleted: the theme's price is only hidden. */
export function paintCard({ target, offer, moneyFormat, tools }) {
  const { root, priceElement } = target
  const wasText = tools.formatMoney(offer.basePrice, moneyFormat)
  const block = tools.buildPriceBlock({ priceElement, wasText, fromText: tools.buildFromText({ offer, moneyFormat, tools }), tools })
  const tag = tools.createTextElement({ document: priceElement.ownerDocument, tag: 'span', className: 'smooth-discounts-card__tag', text: tools.buildTagText({ offer, moneyFormat, tools }) })
  priceElement.setAttribute('data-smooth-discounts-replaced', '')
  priceElement.insertAdjacentElement('afterend', block)
  tools.placeTag({ tag, block, root, tools })
  tools.markCard({ root, state: 'on' })
}

export const PAINT_TOOLS = { isMarked, markCard, createTextElement, buildPriceBlock, findMediaElement, prepareMedia, placeTag, paintCard }
