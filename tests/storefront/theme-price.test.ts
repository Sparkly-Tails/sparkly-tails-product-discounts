// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readBuiltWidget, runWidgetScripts } from '../helpers/builtWidget'

/**
 * The product page's own price is the price of the product: while a tier discount applies, the widget changes the amount in
 * it to the unit price for the quantity chosen, with "each" after it (no struck price of its own: a compare-at price the theme
 * shows stays the theme's). Nothing of the theme is assumed: the price
 * is found by its amount near the widget, never by a class name, and it is changed in place, in the theme's own markup and
 * type. Below the first tier, or when no price is found, the theme's price stays as the theme drew it.
 */
const built = readBuiltWidget()
const NOW = new Date('2026-10-05T12:00:00.000Z')

const discount = {
  title: 'Tins',
  tiers: [{ minQty: 8, percentOff: 3.5503 }, { minQty: 16, percentOff: 8.284 }],
  siblings: [],
  ownVariantIds: null,
  ownVariantOptions: [],
  selfVariantId: 'gid://shopify/ProductVariant/10',
}

/** A price the way Dawn writes it: a container the theme refreshes whenever the variant changes. */
const dawnPriceHtml = (amount = '£1.69') => `
  <div id="price-main" role="status">
    <div class="price price--large"><div class="price__container"><div class="price__regular"><span class="visually-hidden">Regular price</span><span class="price-item price-item--regular">${amount}</span></div></div></div>
  </div>`

/** A theme with nothing in common with Dawn: no word "price" in any name, no section wrapper, the amount in a bare element. */
const plainPriceHtml = (amount = '£1.69') => `<div class="x1"><b data-x="1">${amount}</b></div>`

const widgetHtml = `
  <div id="smooth-discounts-t1" class="smooth-discounts smooth-discounts--card" data-smooth-discounts
    data-discount='${JSON.stringify(discount)}'
    data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
    data-base-price="1.69" data-money-format='"£{{amount}}"' data-high-demand="false">
    <div class="smooth-discounts__body">
      <div class="smooth-discounts__summary">
        <div class="smooth-discounts__price-row"><span data-tier-pricing-tag hidden></span></div>
        <p data-tier-pricing-promo></p>
      </div>
      <div data-tier-pricing-card hidden>
        <div data-tier-pricing-tiers></div>
        <div data-tier-pricing-rail data-offer-state="progress">
          <div><span data-tier-pricing-status></span><span data-tier-pricing-aside></span></div>
          <div data-tier-pricing-bar role="progressbar"><div><div data-tier-pricing-fill></div></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div>
        </div>
      </div>
    </div>
  </div>`

async function mountProductPage({ quantity, priceHtml = dawnPriceHtml(), wrapper = 'section' }: { quantity: number; priceHtml?: string; wrapper?: 'section' | 'div' }) {
  document.body.innerHTML = `
    <${wrapper} id="main">
      <div>
        ${priceHtml}
        <p class="note">Salmon — £1.69</p>
        <input name="quantity" value="${quantity}">
        ${widgetHtml}
      </div>
    </${wrapper}>
    <div id="far"><div class="x2"><span id="far-price">£1.69</span><span id="far-sale">Sale</span></div></div>`
  runWidgetScripts({ built })
  await vi.advanceTimersByTimeAsync(0)
}

async function setQuantity(value: number) {
  const input = document.querySelector('input[name="quantity"]') as HTMLInputElement
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.advanceTimersByTimeAsync(0)
}

const painted = () => Array.from(document.querySelectorAll('[data-smooth-discounts-was]')) as HTMLElement[]
const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('the product page price while a tier applies', () => {
  it('shows the unit price for the quantity in the theme\'s own price, with "each" after it and no struck price of its own', async () => {
    await mountProductPage({ quantity: 10 })
    const price = document.querySelector('.price-item--regular') as HTMLElement
    expect(painted()).toEqual([price])
    expect(squash(price.textContent)).toBe('£1.63 each')
    expect(price.querySelector('s')).toBeNull()
  })

  it('changes the theme\'s text in place, adding no wrapper and copying no class of the theme', async () => {
    await mountProductPage({ quantity: 10 })
    const price = document.querySelector('.price-item--regular') as HTMLElement
    expect(price.className).toBe('price-item price-item--regular')
    expect(Array.from(price.children).map((child) => child.tagName)).toEqual(['SMALL'])
    for (const added of Array.from(price.children)) expect(added.className).toBe('')
  })

  it('needs no particular markup: a bare element with no price class, in a page with no section element, is found by its amount', async () => {
    await mountProductPage({ quantity: 10, priceHtml: plainPriceHtml(), wrapper: 'div' })
    expect(squash(document.querySelector('b[data-x]')!.textContent)).toBe('£1.63 each')
  })

  it('keeps the theme\'s own way of writing an amount, such as a currency code after it', async () => {
    await mountProductPage({ quantity: 10, priceHtml: plainPriceHtml('£1.69 GBP') })
    expect(squash(document.querySelector('b[data-x]')!.lastChild!.previousSibling!.textContent)).toBe('£1.63 GBP')
  })

  it('follows the quantity: back to the theme\'s own price below the first tier, and again on the way up', async () => {
    await mountProductPage({ quantity: 10 })
    await setQuantity(1)
    expect(painted()).toHaveLength(0)
    expect(document.querySelector('.price-item--regular')!.innerHTML).toBe('£1.69')
    await setQuantity(16)
    expect(squash(document.querySelector('.price-item--regular')!.textContent)).toBe('£1.55 each')
    expect(painted()).toHaveLength(1)
  })

  it('leaves the theme price alone below the first tier', async () => {
    await mountProductPage({ quantity: 1 })
    expect(painted()).toHaveLength(0)
    expect(document.querySelector('.price-item--regular')!.innerHTML).toBe('£1.69')
  })

  it('paints the price the theme draws again after a variant change, once', async () => {
    await mountProductPage({ quantity: 10 })
    document.getElementById('price-main')!.innerHTML = '<div class="price"><span class="price-item">£1.69</span></div>'
    await vi.advanceTimersByTimeAsync(1000)
    expect(painted()).toHaveLength(1)
    expect(squash(document.querySelector('.price-item')!.textContent)).toBe('£1.63 each')
  })

  it('does not touch what only looks like a price: a text with more than an amount in it, a price far from the widget', async () => {
    await mountProductPage({ quantity: 10 })
    expect(document.querySelector('.note')!.innerHTML).toBe('Salmon — £1.69')
    expect(document.getElementById('far-price')!.innerHTML).toBe('£1.69')
  })

  it('does not touch the widget itself', async () => {
    await mountProductPage({ quantity: 10 })
    expect(painted().filter((element) => element.closest('[data-smooth-discounts]'))).toHaveLength(0)
  })

  it('does nothing, and breaks nothing, when the page has no price with the amount', async () => {
    await mountProductPage({ quantity: 10, priceHtml: '' })
    expect(painted()).toHaveLength(0)
    expect(document.querySelector('[data-tier-pricing-status]')!.textContent).toContain('You have 10 units')
  })
})

/** Dawn on a sale variant: the amount is printed twice, once in a block the theme's CSS hides and once in the one it shows. */
const dawnSalePriceHtml = () => `
  <style>.price--on-sale .price__regular { display: none; }</style>
  <div id="price-main" role="status">
    <div class="price price--large price--on-sale"><div class="price__container">
      <div class="price__regular"><span class="visually-hidden">Regular price</span><span class="price-item price-item--regular">£1.69</span></div>
      <div class="price__sale"><span><s class="price-item price-item--regular">£2.10</s></span><span class="price-item price-item--sale">£1.69</span></div>
      <div class="price__badges"><span class="badge price__badge-sale" id="sale-badge">Sale</span><span class="badge price__badge-sold-out" id="sold-badge">Sold out</span></div>
    </div></div>
  </div>`

describe('a theme that prints the price twice, one of them hidden', () => {
  it('changes the price that is shown, not the hidden copy that comes first in the page', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml() })
    expect(squash(document.querySelector('.price-item--sale')!.textContent)).toBe('£1.63 each')
    expect(document.querySelector('.price__regular .price-item')!.innerHTML).toBe('£1.69')
  })

  it('leaves the compare-at price the theme shows as it is, and adds no struck price of its own', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml() })
    expect(document.querySelectorAll('s')).toHaveLength(1)
    expect(document.querySelector('s.price-item')!.innerHTML.trim()).toBe('£2.10')
  })

  it('puts the shown price back below the first tier', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml() })
    await setQuantity(1)
    expect(painted()).toHaveLength(0)
    expect(document.querySelector('.price-item--sale')!.innerHTML).toBe('£1.69')
  })
})

describe('the theme\'s "Sale" badge while the tier price shows', () => {
  const badge = () => document.getElementById('sale-badge') as HTMLElement

  it('is hidden while a tier applies, and no other badge is', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml() })
    expect(badge().style.display).toBe('none')
    expect((document.getElementById('sold-badge') as HTMLElement).style.display).toBe('')
  })

  it('comes back as the theme drew it below the first tier, with its own inline display kept', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml().replace('id="sale-badge"', 'id="sale-badge" style="display:inline-flex"') })
    expect(badge().style.display).toBe('none')
    await setQuantity(1)
    expect(badge().style.display).toBe('inline-flex')
    expect(badge().hasAttribute('data-smooth-discounts-hid')).toBe(false)
  })

  it('is found by its word in any letter case, not by a class', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml().replace('class="badge price__badge-sale"', 'class="x9"').replace('>Sale<', '> SALE <') })
    expect(badge().style.display).toBe('none')
  })

  it('is left alone when it is away from the price, and when it is not the word alone', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml().replace('>Sold out<', '>Sale ends soon<') })
    expect((document.getElementById('far-sale') as HTMLElement).style.display).toBe('')
    expect((document.getElementById('sold-badge') as HTMLElement).style.display).toBe('')
  })

  it('is hidden again after the theme redraws its price, once', async () => {
    await mountProductPage({ quantity: 10, priceHtml: dawnSalePriceHtml() })
    document.getElementById('price-main')!.innerHTML = '<div class="price"><div class="price__container"><span class="price-item">£1.69</span><span class="badge" id="sale-badge">Sale</span></div></div>'
    await vi.advanceTimersByTimeAsync(1000)
    expect(badge().style.display).toBe('none')
  })

  it('stays when there is no price to change', async () => {
    await mountProductPage({ quantity: 10, priceHtml: '<span class="badge" id="sale-badge">Sale</span>' })
    expect(badge().style.display).toBe('')
  })
})

describe('the widget itself', () => {
  it('no longer draws a price of its own: the tag stays in its row', async () => {
    await mountProductPage({ quantity: 10 })
    expect(document.querySelector('[data-smooth-discounts] [data-tier-pricing-price]')).toBeNull()
    expect(document.querySelector('[data-smooth-discounts] [data-tier-pricing-tag]')).not.toBeNull()
  })
})
