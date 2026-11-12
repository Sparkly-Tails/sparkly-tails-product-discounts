// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearWidgetRegistry, readBuiltWidget, runPopupScripts } from '../helpers/builtWidget'

/**
 * The bundle pop-up's core script: it stops a Checkout press, works out which bundles in the cart are one step from their
 * first tier, has the UI component show them, and lets checkout go ahead after anything that goes wrong. The UI component is
 * replaced here by a function the test controls (its own tests are in popup-ui.test.ts).
 */
const built = readBuiltWidget()
const NOW_SECONDS = 1_800_000_000

type Member = { productId: string; handle: string; variantIds: string[] | null }
type Discount = { discountId?: string; title?: string; tiers: object[]; members: Member[]; flash: { startsAtUnix: number; endsAtUnix: number } | null }
type LiveVariant = { id: number; title?: string; price: number; available: boolean }
type CartLine = { product_id: number; variant_id: number; quantity: number }
type Answer = { action: 'continue' | 'close'; didAdd: boolean }

const FIXED_TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const memberOf = (handle: string, productId = '100', variantIds: string[] | null = null): Member => ({ productId, handle, variantIds })
const discountOf = (overrides: Partial<Discount> = {}): Discount => ({ discountId: 'gid://shopify/DiscountAutomaticNode/1', title: 'Tins mix', tiers: FIXED_TIERS, members: [memberOf('tuna')], flash: null, ...overrides })
const lineOf = (productId: number, variantId: number, quantity: number): CartLine => ({ product_id: productId, variant_id: variantId, quantity })

const TUNA_FEED: Record<string, LiveVariant[] | 'fail'> = { tuna: [{ id: 1, title: 'Small', price: 169, available: true }, { id: 2, title: 'Large', price: 169, available: true }], salmon: [{ id: 3, title: 'Default Title', price: 169, available: true }] }
const URLS = { popupBoxes: 'https://cdn.test/bundle-popup-boxes.js', popupUi: 'https://cdn.test/bundle-popup-ui.js', popupView: 'https://cdn.test/bundle-popup-view.js', popupFacts: 'https://cdn.test/bundle-popup-facts.js', popupParts: 'https://cdn.test/bundle-popup-parts.js', currency: 'https://cdn.test/tier-pricing-currency.js' }

type CurrencyPage = { shopCurrency: string; activeCurrency: string; rate: string; sample: string }
const GBP_PAGE: CurrencyPage = { shopCurrency: 'GBP', activeCurrency: 'GBP', rate: '1.0', sample: '£1,234.56' }

const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')

function embedHtml({ discounts, rootUrl, currency, urls, frequency }: { discounts: Discount[]; rootUrl: string; currency: CurrencyPage; urls: object; frequency: string }) {
  return `<div data-smooth-discounts-popup hidden data-index="${attribute(JSON.stringify({ discounts }))}" data-money-format="${attribute(JSON.stringify('£{{amount}}'))}" data-root-url="${attribute(JSON.stringify(rootUrl))}" data-shop-currency="${attribute(JSON.stringify(currency.shopCurrency))}" data-money-sample="${attribute(JSON.stringify(currency.sample))}" data-component-urls="${attribute(JSON.stringify(urls))}" data-moss-color="${attribute(JSON.stringify('#434625'))}" data-cream-color="${attribute(JSON.stringify('#f3ecd9'))}" data-night-color="${attribute(JSON.stringify('#2b2d17'))}" data-radius="12" data-frequency="${attribute(JSON.stringify(frequency))}" data-sun-color="${attribute(JSON.stringify('#ffdc4c'))}"></div>`
}

const fetchMock = vi.fn()
/** Stand-ins for the drawing, the arithmetic and the parts components, which the core only hands over to the UI. */
const VIEW = { name: 'view' }
const FACTS = { name: 'facts' }
const PARTS = { name: 'parts' }
const openPopup = vi.fn<(options: Record<string, unknown>) => Promise<Answer>>()
const assign = vi.fn()
const reload = vi.fn()
let submits = 0
/** The listeners a test's script put on the document, taken off again afterwards so one test's script does not answer another test's press. */
const addedListeners: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = []

function removeAddedListeners() {
  for (const [type, listener, options] of addedListeners) document.removeEventListener(type, listener, options)
  addedListeners.length = 0
}

type CartMode = 'ok' | 'reject' | 'text' | 'hang'
type Network = { lines: CartLine[]; feed: Record<string, LiveVariant[] | 'fail'>; cartMode: CartMode }

function stubNetwork({ lines, feed, cartMode }: Network) {
  fetchMock.mockImplementation(async (path: string) => {
    if (/\/cart\.js$/.test(path)) {
      if (cartMode === 'reject') throw new Error('offline')
      if (cartMode === 'hang') return new Promise(() => {})
      return { ok: true, json: async () => (cartMode === 'text' ? Promise.reject(new SyntaxError('not json')) : { items: lines }) }
    }
    const handle = /\/products\/([^/.]+)\.js$/.exec(path)?.[1] ?? ''
    const entry = feed[handle]
    if (entry === undefined || entry === 'fail') return { ok: false, json: async () => null }
    return { ok: true, json: async () => ({ handle, title: handle[0].toUpperCase() + handle.slice(1), featured_image: null, variants: entry }) }
  })
}

async function settle() {
  for (let round = 0; round < 6; round += 1) await vi.advanceTimersByTimeAsync(0)
}

type MountOptions = {
  discounts?: Discount[]; lines?: CartLine[]; feed?: Record<string, LiveVariant[] | 'fail'>; cartMode?: CartMode; rootUrl?: string; currency?: CurrencyPage
  button?: string; hasEmbed?: boolean; hasUi?: boolean; urls?: object; components?: string[]; frequency?: 'session' | 'checkout'
}

/** A cart page with a Checkout button in a form, the embed, and the scripts. The UI component is `openPopup` unless `hasUi` is false. */
async function mountPage({ discounts = [discountOf()], lines = [lineOf(100, 1, 3)], feed = TUNA_FEED, cartMode = 'ok', rootUrl = '/', currency = GBP_PAGE, button, hasEmbed = true, hasUi = true, urls = URLS, components = ['bundle-popup-boxes.js', 'tier-pricing-currency.js'], frequency = 'session' }: MountOptions = {}) {
  removeAddedListeners()
  clearWidgetRegistry()
  vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
  stubNetwork({ lines, feed, cartMode })
  if (currency.activeCurrency !== currency.shopCurrency) (window as unknown as { Shopify: object }).Shopify = { currency: { active: currency.activeCurrency, rate: currency.rate } }
  const checkout = button ?? '<form action="/cart" method="post" id="cartform"><button type="submit" name="checkout" id="checkout">Check out</button></form>'
  document.body.innerHTML = `${checkout}${hasEmbed ? embedHtml({ discounts, rootUrl, currency, urls, frequency }) : ''}`
  document.getElementById('cartform')?.addEventListener('submit', (event) => { event.preventDefault(); submits += 1 })
  if (hasUi) (window as unknown as { SmoothDiscounts: object }).SmoothDiscounts = { components: { popupUi: { openPopup }, popupView: VIEW, popupFacts: FACTS, popupParts: PARTS }, deferreds: {} }
  runPopupScripts({ built, components })
  await settle()
}

/** Presses Checkout; says whether the page's own handling of the press was stopped. */
async function pressCheckout(selector = '#checkout') {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.querySelector(selector)!.dispatchEvent(event)
  await settle()
  return event.defaultPrevented
}

beforeEach(() => {
  submits = 0
  const addListener = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    addedListeners.push([type, listener, options])
    addListener(type, listener, options)
  })
  fetchMock.mockReset()
  openPopup.mockReset()
  openPopup.mockResolvedValue({ action: 'continue', didAdd: false })
  assign.mockReset()
  reload.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('location', { assign, reload, pathname: '/cart', href: 'http://localhost:3000/cart' })
  window.sessionStorage.clear()
})
afterEach(() => {
  removeAddedListeners()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  clearWidgetRegistry()
  delete (window as unknown as { Shopify?: object }).Shopify
})

describe('when the pop-up has nothing to do', () => {
  it('does not touch a Checkout press when the embed printed nothing', async () => {
    await mountPage({ hasEmbed: false })
    expect(await pressCheckout()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches nothing before a press', async () => {
    await mountPage()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops the press and then submits the form once when no bundle is due', async () => {
    await mountPage({ lines: [lineOf(100, 1, 8)] })
    expect(await pressCheckout()).toBe(true)
    expect(submits).toBe(1)
    expect(openPopup).not.toHaveBeenCalled()
  })

  it('ignores a click that is not on a Checkout button', async () => {
    await mountPage({ button: '<button id="other" name="update">Update</button><button id="checkout" name="checkout">Check out</button>' })
    expect(await pressCheckout('#other')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('a bundle that is due', () => {
  it('opens the pop-up with one box holding what the UI needs', async () => {
    await mountPage({ rootUrl: '/fr' })
    await pressCheckout()
    expect(openPopup).toHaveBeenCalledTimes(1)
    const options = openPopup.mock.calls[0][0] as { boxes: Record<string, unknown>[]; root: string; accents: object; moneyFormat: string; opener: unknown; components: Record<string, unknown> }
    expect(options.root).toBe('/fr')
    expect(options.components.popupView).toBe(VIEW)
    expect(options.components.popupFacts).toBe(FACTS)
    expect(options.components.popupParts).toBe(PARTS)
    expect(options.moneyFormat).toBe('£{{amount}}')
    expect(options.accents).toEqual({ moss: '#434625', cream: '#f3ecd9', sun: '#ffdc4c', night: '#2b2d17', radius: 12 })
    expect(options.opener).toBe(document.getElementById('checkout'))
    expect(options.boxes).toHaveLength(1)
    expect(options.boxes[0]).toMatchObject({ title: 'Tins mix', units: 3, firstTierQty: 8, basePrice: 1.69, flash: null })
    expect((options.boxes[0].items as { variantId: string }[]).map((item) => item.variantId)).toEqual(['1', '2'])
    expect(options.boxes[0].lines).toEqual([lineOf(100, 1, 3)])
    expect(submits).toBe(1)
  })

  it('gives a box of a stale index (no id or title) no title and the first product\'s key (Review Focus 1)', async () => {
    const stale = { tiers: FIXED_TIERS, members: [memberOf('tuna')], flash: null } as Discount
    await mountPage({ discounts: [stale] })
    await pressCheckout()
    const box = (openPopup.mock.calls[0][0] as { boxes: { title?: string }[] }).boxes[0]
    expect(box.title ?? '').toBe('')
    expect(window.sessionStorage.getItem('smoothDiscountsPopup:p100')).not.toBeNull()
  })

  it('shows a once-per-session bundle once, and a bundle set to every press every time', async () => {
    openPopup.mockResolvedValue({ action: 'close', didAdd: false })
    await mountPage()
    await pressCheckout()
    await pressCheckout()
    expect(openPopup).toHaveBeenCalledTimes(1)
    expect(submits).toBe(1)
    window.sessionStorage.clear()
    await mountPage({ frequency: 'checkout' })
    await pressCheckout()
    await pressCheckout()
    expect(openPopup).toHaveBeenCalledTimes(3)
  })

  it('remembers nothing in the session when the store shows the pop-up at every press, and remembers the bundle otherwise', async () => {
    await mountPage({ frequency: 'checkout' })
    await pressCheckout()
    expect(window.sessionStorage.length).toBe(0)

    await mountPage()
    await pressCheckout()
    expect(window.sessionStorage.getItem('smoothDiscountsPopup:gid://shopify/DiscountAutomaticNode/1')).not.toBeNull()
  })

  it('does not count a flash sale that ended between page load and the press (Review Focus 4)', async () => {
    await mountPage({ discounts: [discountOf({ flash: { startsAtUnix: NOW_SECONDS - 100, endsAtUnix: NOW_SECONDS + 5 } })] })
    await vi.advanceTimersByTimeAsync(10_000)
    await pressCheckout()
    expect(openPopup).not.toHaveBeenCalled()
    expect(submits).toBe(1)
  })

  it('gets no box for a bundle that cannot be completed because every variant is sold out', async () => {
    await mountPage({ feed: { tuna: [{ id: 1, price: 169, available: false }, { id: 2, price: 169, available: false }] } })
    await pressCheckout()
    expect(openPopup).not.toHaveBeenCalled()
    expect(submits).toBe(1)
  })

  it('drops a product whose data cannot be read, and the box too when nothing is left to add', async () => {
    await mountPage({ feed: { tuna: 'fail' } })
    await pressCheckout()
    expect(openPopup).not.toHaveBeenCalled()
    expect(submits).toBe(1)
  })

  it('offers only the listed variants of a member that lists variants (Review Focus 2)', async () => {
    await mountPage({ discounts: [discountOf({ members: [memberOf('tuna', '100', ['2'])] })], lines: [lineOf(100, 2, 3), lineOf(100, 1, 9)] })
    await pressCheckout()
    const box = (openPopup.mock.calls[0][0] as { boxes: { units: number; items: { variantId: string }[] }[] }).boxes[0]
    expect([box.units, box.items.map((item) => item.variantId)]).toEqual([3, ['2']])
  })

  it('shows a box for each of two bundles, in the index order', async () => {
    const second = discountOf({ discountId: 'two', title: 'Fish', members: [memberOf('salmon', '200')] })
    await mountPage({ discounts: [discountOf(), second], lines: [lineOf(200, 3, 2), lineOf(100, 1, 1)] })
    await pressCheckout()
    expect((openPopup.mock.calls[0][0] as { boxes: { title: string }[] }).boxes.map((box) => box.title)).toEqual(['Tins mix', 'Fish'])
  })
})

describe('what happens after the pop-up', () => {
  it('Continue without an add submits the form once, and the pop-up does not open again (Review Focus 3)', async () => {
    await mountPage()
    await pressCheckout()
    expect(submits).toBe(1)
    expect(openPopup).toHaveBeenCalledTimes(1)
    await settle()
    expect(openPopup).toHaveBeenCalledTimes(1)
  })

  it('lets a Checkout press go through, with no second pop-up, while the page is still leaving after Continue (Review Focus 3, every-press bundle)', async () => {
    await mountPage({ frequency: 'checkout' })
    await pressCheckout()
    expect(openPopup).toHaveBeenCalledTimes(1)

    const wasStopped = await pressCheckout()

    expect(openPopup).toHaveBeenCalledTimes(1)
    expect(wasStopped).toBe(false)
  })

  it('opens the pop-up again for an every-press bundle when the page comes back from the history after Continue', async () => {
    await mountPage({ frequency: 'checkout' })
    await pressCheckout()

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    await pressCheckout()

    expect(openPopup).toHaveBeenCalledTimes(2)
  })

  it('ignores a second press while the first is being worked out, then goes ahead once', async () => {
    let finish: (answer: Answer) => void = () => {}
    openPopup.mockReturnValue(new Promise<Answer>((resolve) => { finish = resolve }))
    await mountPage()
    await pressCheckout()
    expect(await pressCheckout()).toBe(true)
    expect(openPopup).toHaveBeenCalledTimes(1)
    expect(submits).toBe(0)
    finish({ action: 'continue', didAdd: false })
    await settle()
    expect(submits).toBe(1)
  })

  it('Continue after an add goes to the checkout of the shop\'s root, and does not submit the form', async () => {
    openPopup.mockResolvedValue({ action: 'continue', didAdd: true })
    await mountPage({ rootUrl: '/fr' })
    await pressCheckout()
    expect(assign).toHaveBeenCalledWith('/fr/checkout')
    expect(submits).toBe(0)
  })

  it('goes to /checkout for the root link "/"', async () => {
    openPopup.mockResolvedValue({ action: 'continue', didAdd: true })
    await mountPage()
    await pressCheckout()
    expect(assign).toHaveBeenCalledWith('/checkout')
  })

  it('reloads the page when the pop-up is closed after an add, and does nothing when closed without one', async () => {
    openPopup.mockResolvedValue({ action: 'close', didAdd: true })
    await mountPage()
    await pressCheckout()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(submits).toBe(0)
    openPopup.mockResolvedValue({ action: 'close', didAdd: false })
    await mountPage({ frequency: 'checkout' })
    await pressCheckout()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(submits).toBe(0)
    expect(assign).not.toHaveBeenCalled()
  })

  it('follows the link of a Checkout link after Continue', async () => {
    await mountPage({ button: '<a id="checkout" name="checkout" href="/checkout">Check out</a>' })
    expect(await pressCheckout()).toBe(true)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(String(assign.mock.calls[0][0])).toMatch(/\/checkout$/)
  })

  it('goes ahead when the pop-up itself fails', async () => {
    openPopup.mockRejectedValue(new Error('broken'))
    await mountPage()
    await pressCheckout()
    expect(submits).toBe(1)
  })
})

describe('every failure ends with checkout going ahead', () => {
  it('when the cart cannot be read: offline, not JSON, or never answering within 2 seconds', async () => {
    await mountPage({ cartMode: 'reject' })
    await pressCheckout()
    expect(submits).toBe(1)
    await mountPage({ cartMode: 'text' })
    await pressCheckout()
    expect(submits).toBe(2)
    await mountPage({ cartMode: 'hang' })
    await pressCheckout()
    expect(submits).toBe(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(submits).toBe(2)
    await vi.advanceTimersByTimeAsync(2)
    await settle()
    expect(submits).toBe(3)
    expect(openPopup).not.toHaveBeenCalled()
  })

  it('when the UI component cannot be loaded', async () => {
    await mountPage({ hasUi: false, urls: {} })
    await pressCheckout()
    expect(submits).toBe(1)
  })

  it('when the customer sees another currency and the rate cannot be read (Review Focus 5)', async () => {
    await mountPage({ currency: { shopCurrency: 'GBP', activeCurrency: 'CAD', rate: 'abc', sample: 'CA$1,234.56' } })
    await pressCheckout()
    expect(openPopup).not.toHaveBeenCalled()
    expect(submits).toBe(1)
  })

  it('when the customer sees another currency and the sample has no amount (Review Focus 5)', async () => {
    await mountPage({ currency: { shopCurrency: 'GBP', activeCurrency: 'CAD', rate: '1.35', sample: 'CAD' } })
    await pressCheckout()
    expect(openPopup).not.toHaveBeenCalled()
    expect(submits).toBe(1)
  })

  it('opens the pop-up anyway when sessionStorage cannot be read or written', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await mountPage()
    await pressCheckout()
    expect(openPopup).toHaveBeenCalledTimes(1)
  })
})

describe('another currency', () => {
  it('converts the fixed prices with the rate and writes amounts in the theme\'s format', async () => {
    await mountPage({ currency: { shopCurrency: 'GBP', activeCurrency: 'CAD', rate: '1.35', sample: 'CA$1,234.56' } })
    await pressCheckout()
    const options = openPopup.mock.calls[0][0] as { moneyFormat: string; boxes: { tiers: { fixedPrice: number }[] }[] }
    expect(options.moneyFormat).toBe('CA${{amount}}')
    expect(options.boxes[0].tiers.map((tier) => tier.fixedPrice)).toEqual([2.2, 2.09])
  })
})
