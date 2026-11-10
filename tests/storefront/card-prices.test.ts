// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clearWidgetRegistry, readBuiltWidget, runCardScripts } from '../helpers/builtWidget'
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

const URLS = { cardOffer: 'https://cdn.test/card-prices-offer.js', currency: 'https://cdn.test/tier-pricing-currency.js' }
/** What the page says about currency: the shop's own, the one the customer sees with its rate, and a sample of the theme's money filter in it. */
type CurrencyPage = { shopCurrency: string; activeCurrency: string; rate: string; sample: string }
const GBP_PAGE: CurrencyPage = { shopCurrency: 'GBP', activeCurrency: 'GBP', rate: '1.0', sample: '£1,234.56' }
const CAD_PAGE: CurrencyPage = { shopCurrency: 'GBP', activeCurrency: 'CAD', rate: '1.35', sample: 'CA$1,234.56' }

function embedHtml(discounts: Discount[], rootUrl = '/', currency?: CurrencyPage) {
  const index = JSON.stringify({ discounts })
  const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  const currencyAttributes = currency ? ` data-shop-currency="${attribute(JSON.stringify(currency.shopCurrency))}" data-money-sample="${attribute(JSON.stringify(currency.sample))}"` : ''
  return `<div data-smooth-discounts-cards hidden data-index="${attribute(index)}" data-money-format="${attribute(JSON.stringify('£{{amount}}'))}" data-root-url="${attribute(JSON.stringify(rootUrl))}" data-component-urls="${attribute(JSON.stringify(URLS))}"${currencyAttributes}></div>`
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

type MountOptions = { cards: string; discounts: Discount[]; rootUrl?: string; extra?: string; feed?: Record<string, Variant[] | 'fail'>; currency?: CurrencyPage; components?: string[] }

/** The page, then the card scripts. By default every component is already on the page; `components` says which are, so a test can leave the loading to the core script. */
async function mountPage({ cards, discounts, rootUrl, extra = '', feed = productFeed, currency, components }: MountOptions) {
  vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
  stubFeed(feed)
  if (currency) (window as unknown as { Shopify: object }).Shopify = { currency: { active: currency.activeCurrency, rate: currency.rate } }
  document.body.innerHTML = `${extra}<ul>${cards}</ul>${embedHtml(discounts, rootUrl, currency)}`
  runCardScripts({ built, components })
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
  document.head.innerHTML = ''
  clearWidgetRegistry()
  delete (window as unknown as { Shopify?: object }).Shopify
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

/** A card whose image link and title link have no common element with a price below it, except the outer wrapper: two candidates for one card. */
const splitCardHtml = (handle: string) => `
  <li class="grid__item">
    <div class="card-wrapper">
      <div class="card__inner"><div class="media"><img alt=""></div><a href="/products/${handle}" class="card__link">image</a></div>
      <div class="card__information">
        <h3 class="card__heading"><a href="/products/${handle}">${handle}</a></h3>
        <div class="price"><span class="price-item price-item--regular">£1.69</span></div>
      </div>
    </div>
  </li>`

describe('where the offer goes on a card', () => {
  it('paints one price and one tag when the image and the title are in different parts of the card, both finding the same price', async () => {
    await mountPage({ cards: splitCardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    expect(document.querySelectorAll('.smooth-discounts-card__price').length).toBe(1)
    expect(document.querySelectorAll('.smooth-discounts-card__tag').length).toBe(1)
  })

  it('puts the tag on the product image, and not with the price', async () => {
    await mountPage({ cards: splitCardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    const tag = document.querySelector('.smooth-discounts-card__tag') as HTMLElement
    expect(tag.parentElement).toBe(document.querySelector('.media'))
    expect(tag.classList.contains('smooth-discounts-card__tag--image')).toBe(true)
    expect(document.querySelector('.card__information')!.contains(tag)).toBe(false)
  })

  it('puts the tag beside the image when the image is in a picture element', async () => {
    const card = splitCardHtml('tuna').replace('<img alt="">', '<picture><img alt=""></picture>')
    await mountPage({ cards: card, discounts: [discountOf([memberOf('tuna')])] })
    expect((document.querySelector('.smooth-discounts-card__tag') as HTMLElement).parentElement).toBe(document.querySelector('.media'))
  })

  it('lets the tag be placed over the image by making the image holder a positioning box, unless the theme already did', async () => {
    await mountPage({ cards: splitCardHtml('tuna').replace('class="media"', 'class="media" style="position: relative"') + splitCardHtml('salmon'), discounts: [discountOf([memberOf('tuna'), memberOf('salmon')])] })
    const holders = Array.from(document.querySelectorAll('.media'))
    expect(holders[0].classList.contains('smooth-discounts-card__media')).toBe(false)
    expect(holders[1].classList.contains('smooth-discounts-card__media')).toBe(true)
  })

  it('gives the tag the classes of the theme\'s own badge on the card, so it looks like the sale tag', async () => {
    const card = splitCardHtml('tuna').replace('<img alt="">', '<img alt=""><span class="badge badge--bottom-left color-scheme-3">Sale</span>')
    await mountPage({ cards: card, discounts: [discountOf([memberOf('tuna')])] })
    const tag = document.querySelector('.smooth-discounts-card__tag') as HTMLElement
    expect(tag.classList.contains('badge')).toBe(true)
    expect(tag.classList.contains('color-scheme-3')).toBe(true)
    expect(document.querySelector('.badge')!.textContent).toBe('Sale')
  })

  it('has no theme classes on the tag when the card has no badge', async () => {
    await mountPage({ cards: splitCardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])] })
    expect((document.querySelector('.smooth-discounts-card__tag') as HTMLElement).className).toBe('smooth-discounts-card__tag smooth-discounts-card__tag--image')
  })

  it('sets the size and place of the tag over the theme\'s rule that stretches everything in an image holder, and its own colours only when the theme gave none', () => {
    const css = built['card-prices.css']
    for (const rule of ['position:absolute!important', 'top:12px!important', 'left:12px!important', 'width:auto!important', 'height:auto!important', 'max-width:none!important']) expect(css).toContain(rule)
    expect(css).toMatch(/smooth-discounts-card__tag:not\(\.badge\)\{[^}]*color:#fff!important/)
  })

  it('keeps the tag under the price when the card has no image', async () => {
    const card = cardHtml('tuna').replace('<img alt="">', '')
    await mountPage({ cards: card, discounts: [discountOf([memberOf('tuna')])] })
    const tag = document.querySelector('.smooth-discounts-card__tag') as HTMLElement
    expect(tag.previousElementSibling).toBe(document.querySelector('.smooth-discounts-card__price'))
    expect(tag.classList.contains('smooth-discounts-card__tag--image')).toBe(false)
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

  it('prints nothing when there is no index, and no longer when the customer sees another currency', () => {
    expect(block).toMatch(/\{%- if card_index != blank -%\}/)
    expect(block).not.toContain('iso_code')
  })

  it('hands the script the shop\'s currency, a sample of the money filter in the customer\'s currency, and the address of each component', () => {
    expect(block).toContain("data-shop-currency='{{ shop.currency | json | escape }}'")
    expect(block).toContain("data-money-sample='{{ 123456 | money | json | escape }}'")
    expect(block).toContain("\"cardOffer\": {{ 'card-prices-offer.js' | asset_url | json }}")
    expect(block).toContain("\"currency\": {{ 'tier-pricing-currency.js' | asset_url | json }}")
    expect(block).toContain("data-component-urls='{{ component_urls_json }}'")
  })

  it('preloads the offer component, which every page with the embed needs', () => {
    expect(block).toContain("{{ 'card-prices-offer.js' | asset_url | preload_tag: as: 'script' }}")
  })
})

describe('in the currency the customer sees', () => {
  const scriptFor = (url: string) => Array.from(document.head.querySelectorAll('script')).find((script) => script.src === url) as HTMLScriptElement | undefined
  const priced = (price: number) => ({ tuna: [{ id: 1, price, available: true }] })

  it('works out a fixed price tier in that currency: the stored price times the rate, to two decimals', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: CAD_PAGE, feed: priced(228) })
    const card = cardOf('tuna')
    expect(text('.smooth-discounts-card__was', card)).toBe('CA$2.28')
    expect(text('.smooth-discounts-card__from', card)).toBe('From CA$2.09')
    expect(text('.smooth-discounts-card__tag', card)).toBe('Buy 16+ for CA$2.09')
  })

  it('leaves a percentage tier as it is, and only writes the amounts in that currency', async () => {
    const tiers = [{ minQty: 2, percentOff: 10 }, { minQty: 5, percentOff: 25 }]
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')], { tiers })], currency: CAD_PAGE, feed: priced(2000) })
    expect(text('.smooth-discounts-card__was', cardOf('tuna'))).toBe('CA$20.00')
    expect(text('.smooth-discounts-card__from', cardOf('tuna'))).toBe('From CA$15.00')
  })

  it('shows no offer when the converted price is no saving on the live price', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: CAD_PAGE, feed: priced(200) })
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('does not load the currency component, or change anything, for a customer who sees the shop\'s currency', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: GBP_PAGE, components: [] })
    expect(scriptFor(URLS.cardOffer)).toBeDefined()
    expect(scriptFor(URLS.currency)).toBeUndefined()
  })

  it('loads the currency component, with the offer component, for a customer who sees another currency', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: CAD_PAGE, components: [] })
    expect(scriptFor(URLS.cardOffer)).toBeDefined()
    expect(scriptFor(URLS.currency)).toBeDefined()
  })

  it('waits for its components, which arrive after the core script, and then paints', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: CAD_PAGE, feed: priced(228), components: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    for (const name of ['card-prices-offer.js', 'tier-pricing-currency.js']) (0, eval)(built[name])
    await settle()
    expect(text('.smooth-discounts-card__from', cardOf('tuna'))).toBe('From CA$2.09')
  })

  it('leaves the cards alone, and asks for no prices, when the rate cannot be read', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: { ...CAD_PAGE, rate: 'abc' } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('leaves the cards alone when the money sample holds no amount', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: { ...CAD_PAGE, sample: 'n/a' } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
  })

  it('leaves the cards alone, and does not break the page, when a component cannot be loaded', async () => {
    await mountPage({ cards: cardHtml('tuna'), discounts: [discountOf([memberOf('tuna')])], currency: CAD_PAGE, components: [] })
    scriptFor(URLS.currency)!.dispatchEvent(new Event('error'))
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('.smooth-discounts-card__from')).toBeNull()
    expect(cardOf('tuna').querySelector('.price')).not.toBeNull()
  })
})
