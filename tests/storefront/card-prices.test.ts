// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readBuiltWidget } from '../helpers/builtWidget'
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from '@/lib/metafieldNames'

/**
 * Product cards: the "Product card prices" app embed prints the index of live discounts, the script finds the cards by
 * their product links (no theme markup assumed), fetches those products' live prices and paints the offer.
 */
const built = readBuiltWidget()
const block = readFileSync(join(process.cwd(), 'extensions/product-tier-pricing/blocks/card-prices.liquid'), 'utf8')
const NOW_SECONDS = 1_800_000_000

type Variant = { id: number; price: number; available: boolean }
type Member = { productId: string; handle: string; variantIds: string[] | null }
type Discount = { tiers: object[]; members: Member[]; flash: { startsAtUnix: number; endsAtUnix: number } | null }

const FIXED_TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const discountOf = (members: Member[], overrides: Partial<Discount> = {}): Discount => ({ tiers: FIXED_TIERS, members, flash: null, ...overrides })
const memberOf = (handle: string, variantIds: string[] | null = null): Member => ({ productId: '100', handle, variantIds })

const productFeed: Record<string, Variant[]> = {
  tuna: [{ id: 1, price: 169, available: true }],
  salmon: [{ id: 2, price: 169, available: true }],
}

/** A card the way many themes write it: image link, title link, a price block. Nothing here is special to the app. */
const cardHtml = (handle: string, price = '£1.69') => `
  <li class="grid__item">
    <div class="card-wrapper">
      <a href="/products/${handle}" class="card__media"><img alt=""></a>
      <h3 class="card__heading"><a href="/collections/dogs/products/${handle}">${handle}</a></h3>
      <div class="price"><span class="price-item price-item--regular">${price}</span></div>
    </div>
  </li>`

function embedHtml(discounts: Discount[], rootUrl = '/') {
  const index = JSON.stringify({ discounts })
  const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  return `<div data-smooth-discounts-cards hidden data-index="${attribute(index)}" data-money-format="${attribute(JSON.stringify('£{{amount}}'))}" data-root-url="${attribute(JSON.stringify(rootUrl))}"></div>`
}

const fetchMock = vi.fn()

function stubFeed(feed: Record<string, Variant[] | 'fail'>) {
  fetchMock.mockImplementation(async (path: string) => {
    const handle = /\/products\/([^/.]+)\.js$/.exec(path)?.[1] ?? ''
    const entry = feed[handle]
    if (entry === undefined || entry === 'fail') return { ok: false, json: async () => null }
    return { ok: true, json: async () => ({ handle, variants: entry }) }
  })
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
}

async function mountPage({ cards, discounts, rootUrl, extra = '', feed = productFeed }: { cards: string; discounts: Discount[]; rootUrl?: string; extra?: string; feed?: Record<string, Variant[] | 'fail'> }) {
  vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
  stubFeed(feed)
  document.body.innerHTML = `${extra}<ul>${cards}</ul>${embedHtml(discounts, rootUrl)}`
  ;(0, eval)(built['card-prices.js'])
  await settle()
}

const text = (selector: string, root: ParentNode = document) => root.querySelector(selector)?.textContent?.trim()
const cardOf = (handle: string) => document.querySelector(`a[href$="/products/${handle}"]`)!.closest('li') as HTMLElement

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('a card of a discounted product', () => {
  it('shows the plain price struck, the price from the top tier, and a tag with the top tier', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    const card = cardOf('tuna')
    expect(text('.smooth-discounts-card__was', card)).toBe('£1.69')
    expect(text('.smooth-discounts-card__from', card)).toBe('From £1.55')
    expect(text('.smooth-discounts-card__tag', card)).toBe('Buy 16+ for £1.55')
  })

  it('hides the theme\'s own price instead of deleting it, and sets the new price in the theme\'s price classes', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    const card = cardOf('tuna')
    expect(card.querySelector('.price[data-smooth-discounts-replaced]')).not.toBeNull()
    expect(card.querySelectorAll('.price').length).toBe(2)
    expect((card.querySelector('.smooth-discounts-card__price') as HTMLElement).className).toContain('price')
  })

  it('works out percentage tiers from the live price of the product', async () => {
    const tiers = [{ minQty: 2, percentOff: 10 }, { minQty: 5, percentOff: 25 }]
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')], { tiers })], feed: { tuna: [{ id: 1, price: 2000, available: true }] } })
    expect(text('.smooth-discounts-card__was', cardOf('tuna'))).toBe('£20.00')
    expect(text('.smooth-discounts-card__from', cardOf('tuna'))).toBe('From £15.00')
    expect(text('.smooth-discounts-card__tag', cardOf('tuna'))).toBe('Buy 5+ for £15.00')
  })

  it('offers the cheapest variant that is in stock and in the discount', async () => {
    const feed = { tuna: [{ id: 1, price: 1000, available: false }, { id: 2, price: 1500, available: true }, { id: 3, price: 1200, available: true }, { id: 4, price: 900, available: true }] }
    const tiers = [{ minQty: 3, percentOff: 20 }]
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna', ['1', '2', '3'])], { tiers })], feed })
    expect(text('.smooth-discounts-card__was', cardOf('tuna'))).toBe('£12.00')
    expect(text('.smooth-discounts-card__from', cardOf('tuna'))).toBe('From £9.60')
  })

  it('stays as it is when every variant of the discount is sold out', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], feed: { tuna: [{ id: 1, price: 169, available: false }] } })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
    expect(document.querySelector('[data-smooth-discounts-replaced]')).toBeNull()
  })

  it('stays as it is when the discount would not lower the price', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')], { tiers: [{ minQty: 3, percentOff: 0 }] })] })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('stays as it is when the live prices cannot be read, and leaves the other cards alone', async () => {
    await mountPage({ cards: cardHtml('tuna') + cardHtml('salmon'), discounts: [discountOf([memberOf('tuna'), memberOf('salmon')])], feed: { tuna: 'fail', salmon: productFeed.salmon } })
    expect(document.querySelector('.smooth-discounts-card__from')).not.toBeNull()
    expect(cardOf('tuna').querySelector('.smooth-discounts-card__from')).toBeNull()
    expect(cardOf('salmon').querySelector('.smooth-discounts-card__from')).not.toBeNull()
  })
})

describe('which cards are touched', () => {
  it('leaves the cards of other products alone and asks for the prices of discounted products only', async () => {
    await mountPage({ cards: cardHtml('tuna') + cardHtml('chicken'), discounts: [discountOf([memberOf('tuna')])] })
    expect(cardOf('chicken').querySelector('.smooth-discounts-card__from')).toBeNull()
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/products/tuna.js'])
  })

  it('asks once per product, even when it is on the page twice', async () => {
    await mountPage({ cards: cardHtml('tuna') + cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('.smooth-discounts-card__from').length).toBe(2)
  })

  it('paints one price per card, although the card has an image link and a title link', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    expect(document.querySelectorAll('.smooth-discounts-card__from').length).toBe(1)
  })

  it('does not touch product links in the header, the menu, the footer, the cart or a dialog', async () => {
    const menu = ['header', 'nav', 'footer', 'div class="cart-drawer"', 'div role="dialog"'].map((open) => {
      const name = open.split(' ')[0]
      return `<${open}><a href="/products/tuna">Tuna</a><span class="price">£1.69</span></${name}>`
    }).join('')
    await mountPage({ cards: '', extra: menu, discounts: [discountOf([memberOf('tuna')])] })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not touch the product page of the product itself, whose price is not a card', async () => {
    window.history.pushState({}, '', '/products/tuna')
    await mountPage({ cards: cardHtml('tuna') + cardHtml('salmon'), discounts: [discountOf([memberOf('tuna'), memberOf('salmon')])] })
    expect(cardOf('tuna').querySelector('.smooth-discounts-card__from')).toBeNull()
    expect(cardOf('salmon').querySelector('.smooth-discounts-card__from')).not.toBeNull()
    window.history.pushState({}, '', '/')
  })

  it('does not touch a list of several products that has no card of its own', async () => {
    const list = `<div class="featured"><a href="/products/tuna">Tuna</a><a href="/products/salmon">Salmon</a><span class="price">£1.69</span></div>`
    await mountPage({ cards: list, discounts: [discountOf([memberOf('tuna'), memberOf('salmon')])] })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('leaves the tier widget of the product page alone', async () => {
    const widget = `<div data-smooth-discounts><a href="/products/tuna">Tuna</a><span class="price">£1.69</span></div>`
    await mountPage({ cards: '', extra: widget, discounts: [discountOf([memberOf('tuna')])] })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })
})

describe('flash sales', () => {
  const window_ = (startsAtUnix: number, endsAtUnix: number) => ({ startsAtUnix, endsAtUnix })

  it('show their price while the sale runs', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')], { flash: window_(NOW_SECONDS - 60, NOW_SECONDS + 60) })] })
    expect(text('.smooth-discounts-card__from', cardOf('tuna'))).toBe('From £1.55')
  })

  it('show nothing before the sale starts', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')], { flash: window_(NOW_SECONDS + 60, NOW_SECONDS + 600) })] })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('show nothing after the sale ended', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')], { flash: window_(NOW_SECONDS - 600, NOW_SECONDS - 1) })] })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })
})

describe('the page changing', () => {
  it('paints cards that arrive later (filters, "load more", infinite scroll), once the page has been quiet a moment', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna'), memberOf('salmon')])] })
    document.querySelector('ul')!.insertAdjacentHTML('beforeend', cardHtml('salmon'))
    await vi.advanceTimersByTimeAsync(100)
    expect(cardOf('salmon').querySelector('.smooth-discounts-card__from')).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    await settle()
    expect(cardOf('salmon').querySelector('.smooth-discounts-card__from')).not.toBeNull()
  })

  it('does not paint a card twice when the page changes again', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    document.body.insertAdjacentHTML('beforeend', '<p>changed</p>')
    await vi.advanceTimersByTimeAsync(500)
    await settle()
    expect(document.querySelectorAll('.smooth-discounts-card__from').length).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('paints a card that replaces an earlier one (the theme draws the list again)', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    document.querySelector('ul')!.innerHTML = cardHtml('tuna')
    await vi.advanceTimersByTimeAsync(500)
    await settle()
    expect(document.querySelectorAll('.smooth-discounts-card__from').length).toBe(1)
  })
})

describe('the shop\'s root link', () => {
  it('is put before the product address, with a slash when the language has none', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], rootUrl: '/en-gb' })
    expect(fetchMock.mock.calls[0][0]).toBe('/en-gb/products/tuna.js')
  })

  it('is just a slash for the main language', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], rootUrl: '/' })
    expect(fetchMock.mock.calls[0][0]).toBe('/products/tuna.js')
  })
})

describe('when there is nothing to do', () => {
  it('does nothing when the embed printed nothing, and does not ask for any price', async () => {
    vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
    document.body.innerHTML = `<ul>${cardHtml('tuna')}</ul>`
    ;(0, eval)(built['card-prices.js'])
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('does nothing when no discount is live', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing, and does not break the page, when the index is damaged', async () => {
    vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
    document.body.innerHTML = `<ul>${cardHtml('tuna')}</ul><div data-smooth-discounts-cards data-index="{not json" data-money-format='"£{{amount}}"' data-root-url='"/"'></div>`
    expect(() => (0, eval)(built['card-prices.js'])).not.toThrow()
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('card-prices.liquid', () => {
  it('is an app embed in the body, with its own script and stylesheet', () => {
    const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
    expect(schema.target).toBe('body')
    expect(schema.javascript).toBe('card-prices.js')
    expect(schema.stylesheet).toBe('card-prices.css')
  })

  it('reads the shop\'s card index in the app namespace and prints it with the money format and the root link', () => {
    expect(block).toContain(`shop.metafields['${METAFIELD_NAMESPACE}'].${METAFIELD_KEYS.cardIndex}`)
    expect(block).toMatch(/data-index='\{\{ card_index\.value \| json \| escape \}\}'/)
    expect(block).toContain("data-money-format='{{ shop.money_format | json | escape }}'")
    expect(block).toContain("data-root-url='{{ routes.root_url | json | escape }}'")
  })

  it('prints nothing when there is no index or the shop sells in a currency other than its own', () => {
    expect(block).toMatch(/card_index != blank and cart\.currency\.iso_code == shop\.currency/)
  })
})
