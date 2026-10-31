// The Mix & match list: rows from the siblings, then painting them.
import { extractNumericId, perUnitPrice, sumMemberQuantityInCart } from './tierMath.js'
import { setText } from './dom.js'

// Mix & match product list — pure row-building, then a thin DOM paint.

// The price label of a row: its own price at the per-unit price the applied
// tier gives it ('' without a price or without pricing context).
export function formatRowPrice({ priceCents, pricing }) {
  if (priceCents == null || !pricing) return ''
  return pricing.formatMoney(perUnitPrice(priceCents / 100, pricing.combinedQty, pricing.tierState))
}

// `pricing` ({ combinedQty, tierState, formatMoney }) prices each row; null
// leaves the price label empty. Prices in `products` are Shopify's integer
// minor units (cents). A row shows what is in the cart (`qty`) and, unless it is
// the product on the page or sold out, an Add link to that product (`showAdd`).
export function buildMixMatchRows({ products, cartItems, pricing, currentVariantId }) {
  return products.map((product) => {
    const member = { productId: extractNumericId(product.productId), variantId: product.variantId ? extractNumericId(product.variantId) : undefined }
    const cartVariantId = product.cartVariantId != null ? String(product.cartVariantId) : null
    const isCurrent = cartVariantId != null && currentVariantId != null && cartVariantId === String(currentVariantId)
    const available = product.available !== false
    return {
      // The theme (Liquid) builds the link from the live product, including any ?variant= query.
      href: product.url,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qty: sumMemberQuantityInCart(cartItems || [], [member]),
      priceLabel: formatRowPrice({ priceCents: product.price, pricing }),
      available,
      showAdd: available && !isCurrent,
    }
  })
}

export function formatItemsChosen(qty) {
  return qty + (qty === 1 ? ' item chosen' : ' items chosen')
}

// Cross-product siblings plus every one of this product's own other
// member-variants, INCLUDING whichever one is currently selected/displayed.
// Previously excluded the current variant on the theory that showing "the
// exact one you're looking at" would be confusing — in practice that made
// its cart quantity invisible everywhere in the widget (e.g. viewing
// Chicken with 2 already in the cart: the list showed the other members'
// counts but never Chicken's, so 5 real combined units looked like only 3
// were accounted for). Cross-product siblings were never excluded this way
// either, so this also makes same-product and cross-product members behave
// consistently. Own-variant rows link back to this same product with a
// ?variant= query param so clicking one selects that flavour (a no-op for
// the row matching the currently-displayed variant).
export function buildDisplayMixMatchItems(config) {
  const ownRows = (config.ownVariantOptions || []).map((opt) => ({
    productId: config.productId,
    variantId: opt.variantId,
    title: opt.title,
    url: opt.url,
    imageUrl: opt.imageUrl || null,
    price: opt.price,
    available: opt.available,
    cartVariantId: opt.cartVariantId,
  }))
  return ownRows.concat(config.mixMatchListItems)
}

// One row per member: thumbnail, name and price (a link to the product), the
// number in the cart, and a small Add link that opens the product.
export function paintMixMatchList(listEl, rows) {
  listEl.innerHTML = ''
  rows.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'sparkly-tier-pricing__list-item'

    const link = document.createElement('a')
    link.href = row.href
    link.className = 'sparkly-tier-pricing__list-link'

    if (row.imageUrl) {
      const img = document.createElement('img')
      img.src = row.imageUrl
      img.alt = ''
      img.className = 'sparkly-tier-pricing__list-thumb'
      link.appendChild(img)
    } else {
      const placeholder = document.createElement('span')
      placeholder.className = 'sparkly-tier-pricing__list-thumb sparkly-tier-pricing__list-thumb--placeholder'
      link.appendChild(placeholder)
    }

    const text = document.createElement('span')
    text.className = 'sparkly-tier-pricing__list-text'
    const name = document.createElement('span')
    name.className = 'sparkly-tier-pricing__list-name'
    name.textContent = row.title
    text.appendChild(name)
    const price = document.createElement('span')
    price.className = 'sparkly-tier-pricing__list-price'
    price.textContent = row.available ? (row.priceLabel ? row.priceLabel + ' each' : '') : 'Sold out'
    text.appendChild(price)
    link.appendChild(text)
    item.appendChild(link)

    item.appendChild(paintRowAction(row))

    listEl.appendChild(item)
  })
}

// The number in the cart plus, when the product can be added, an "Add" link to
// it (the product on the page and sold-out rows have none).
export function paintRowAction(row) {
  const group = document.createElement('div')
  group.className = 'sparkly-tier-pricing__row-action'

  const count = document.createElement('span')
  count.className = 'sparkly-tier-pricing__list-qty'
  count.textContent = String(row.qty)
  count.setAttribute('aria-label', row.qty + ' in cart')
  group.appendChild(count)

  if (row.showAdd) {
    const add = document.createElement('a')
    add.href = row.href
    add.className = 'sparkly-tier-pricing__add'
    add.textContent = '+ Add'
    add.setAttribute('aria-label', 'Add ' + row.title)
    group.appendChild(add)
  }
  return group
}

export function renderMixMatchList({ listEl, products, cartItems, pricing, currentVariantId }) {
  paintMixMatchList(listEl, buildMixMatchRows({ products, cartItems, pricing, currentVariantId }))
}

// Paints the whole list and its "N items chosen" line from the widget's current state.
export function paintSiblingsList({ listEl, chosenEl, config, cartItems, pricing, currentVariantId }) {
  renderMixMatchList({ listEl, products: buildDisplayMixMatchItems(config), cartItems, pricing, currentVariantId })
  if (pricing) setText(chosenEl, formatItemsChosen(pricing.combinedQty))
}
