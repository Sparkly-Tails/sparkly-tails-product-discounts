// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearWidgetRegistry, readBuiltWidget, runWidgetScripts, WIDGET_COMPONENTS, WIDGET_CORE } from '../helpers/builtWidget'

/** The tier widget's built scripts, run in the page the way the theme loads them, on markup like tier-pricing.liquid renders. */
const built = readBuiltWidget()

const NOW = new Date('2026-10-05T12:00:00.000Z')
const V10 = 'gid://shopify/ProductVariant/10'

describe('the built storefront scripts', () => {
  it('leave nothing on the page but the one object the components share', () => {
    clearWidgetRegistry()
    const before = new Set(Object.getOwnPropertyNames(window))

    for (const name of [...WIDGET_COMPONENTS, WIDGET_CORE]) (0, eval)(built[name])

    expect(Object.getOwnPropertyNames(window).filter((name) => !before.has(name))).toEqual(['SmoothDiscounts'])
  })
})

/**
 * The redesigned tier widget: status row, bar with a dot on the current
 * quantity, and the copy per state. Markup mirrors tier-pricing.liquid; the
 * cart comes from a stubbed /cart.js.
 */
describe('tier widget painting (redesign)', () => {
  type CartLine = { key?: string; product_id: number; variant_id: number; quantity: number }
  let cartItems: CartLine[] = []
  let cartRequests: Array<{ url: string; body: Record<string, unknown> }> = []
  let nextCartError: Record<string, string> | null = null
  const rowProductFor = (variantId: number) => (variantId === 10 ? 9 : 20)
  beforeEach(() => {
    cartItems = []
    vi.useFakeTimers({ now: NOW })
    cartRequests = []
    nextCartError = null
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      if (url === '/cart.js') return { ok: true, json: async () => ({ items: cartItems }) }
      cartRequests.push({ url, body: JSON.parse(init!.body!) })
      if (nextCartError) return { ok: false, json: async () => nextCartError }
      const body = JSON.parse(init!.body!)
      if (url === '/cart/add.js') {
        const { id, quantity } = body.items[0]
        const line = cartItems.find((item) => item.variant_id === id)
        if (line) line.quantity += quantity
        else cartItems.push({ key: String(id) + ':k', product_id: rowProductFor(id), variant_id: id, quantity })
      } else if (url === '/cart/change.js') {
        const line = cartItems.find((item) => item.key === body.id)!
        line.quantity = body.quantity
        cartItems = cartItems.filter((item) => item.quantity > 0)
      }
      return { ok: true, json: async () => ({}) }
    }))
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  const discount = {
    title: 'Tins',
    tiers: [{ minQty: 8, percentOff: 3.5503 }, { minQty: 16, percentOff: 8.284 }],
    siblings: [],
    ownVariantIds: null,
    ownVariantOptions: [],
    selfVariantId: V10,
  }

  async function mountTiers(quantity: number, extra: Record<string, unknown> = {}) {
    document.body.innerHTML = `
      <input name="quantity" value="${quantity}">
      <div id="smooth-discounts-t1" class="smooth-discounts smooth-discounts--card" data-smooth-discounts
        data-discount='${JSON.stringify({ ...discount, ...extra, highDemand: undefined })}'
        data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
        data-base-price="1.69" data-compare-at-price="0" data-money-format='"£{{amount}}"' data-high-demand="${extra.highDemand ? 'true' : 'false'}">
        <div class="smooth-discounts__body">
          <div class="smooth-discounts__summary">
            <div class="smooth-discounts__price-row">
              <div class="smooth-discounts__price-group">
                <span data-tier-pricing-price>£1.69</span>
                <span data-tier-pricing-each-label>each</span>
                <s data-tier-pricing-struck hidden></s>
              </div>
              <span data-tier-pricing-tag hidden></span>
            </div>
            <p data-tier-pricing-promo></p>
          </div>
          <div data-tier-pricing-card hidden>
            <div data-tier-pricing-tiers></div>
            <div data-tier-pricing-rail data-offer-state="progress">
              <div><span data-tier-pricing-status></span><span data-tier-pricing-aside></span></div>
              <div data-tier-pricing-bar role="progressbar"><div><div data-tier-pricing-fill></div></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div>
            </div>
            <div data-tier-pricing-drawer data-open="false">
              <button data-tier-pricing-toggle aria-expanded="false"><span>Mix &amp; match flavours</span></button>
              <div data-tier-pricing-list hidden></div>
              <p data-tier-pricing-chosen hidden></p>
            </div>
          </div>
        </div>
      </div>`
    runWidgetScripts({ built })
    await vi.advanceTimersByTimeAsync(0)
  }

  async function setQuantity(value: number) {
    const input = document.querySelector('input[name="quantity"]') as HTMLInputElement
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
  }

  function painted() {
    const text = (selector: string) => (document.querySelector(selector) as HTMLElement).textContent
    const dot = document.querySelector('[data-tier-pricing-dot]') as HTMLElement
    const aside = document.querySelector('[data-tier-pricing-aside]') as HTMLElement
    const pct = (el: HTMLElement) => el.style.getPropertyValue('--smooth-discounts-pct')
    return {
      promo: text('[data-tier-pricing-promo]'),
      status: text('[data-tier-pricing-status]'),
      aside: aside.textContent,
      tone: aside.dataset.tone,
      offerState: (document.querySelector('[data-tier-pricing-rail]') as HTMLElement).dataset.offerState,
      dot: dot.textContent,
      dotPct: pct(dot),
      fill: (document.querySelector('[data-tier-pricing-fill]') as HTMLElement).style.width,
      markers: [...document.querySelectorAll('.smooth-discounts__marker')].map((m) => ({ text: m.textContent, pct: pct(m as HTMLElement), reached: m.classList.contains('smooth-discounts__marker--reached'), covered: m.classList.contains('smooth-discounts__marker--covered') })),
    }
  }

  it('below the first offer: units owned, a hint to the next price in the accent colour, the dot on the quantity', async () => {
    await mountTiers(5)
    expect(painted()).toEqual({
      promo: 'Buy 8+ for £1.63 or 16+ for £1.55',
      status: 'You have 5 units',
      aside: 'Add 3 for £1.63/ea',
      tone: 'accent',
      offerState: 'progress',
      dot: '5',
      dotPct: '29%',
      fill: '29%',
      markers: [
        { text: '1', pct: '0%', reached: true, covered: false },
        { text: '8', pct: '50%', reached: false, covered: false },
        { text: '16', pct: '100%', reached: false, covered: false },
      ],
    })
  })

  it('middle tier: the same sentence, a hint to the next price, the reached markers filled, the promo line unchanged', async () => {
    await mountTiers(5)
    await setQuantity(10)
    expect(painted()).toMatchObject({
      promo: 'Buy 8+ for £1.63 or 16+ for £1.55',
      status: 'You have 10 units',
      aside: 'Add 6 for £1.55/ea',
      tone: 'olive',
      offerState: 'offer',
      dot: '10',
      dotPct: '63%',
    })
    expect(painted().markers.map((m) => m.reached)).toEqual([true, true, false])
  })

  function chips() {
    return [...document.querySelectorAll('[data-tier-pricing-tiers] > *')].map((el) => ({
      text: el.textContent,
      tag: el.tagName,
      tone: el.className.replace('smooth-discounts__chip smooth-discounts__chip--', ''),
    }))
  }

  it('chips show the total per tier; between tiers a dashed chip shows the total for the quantity', async () => {
    await mountTiers(5)
    expect(chips()).toEqual([
      { text: '1 × £1.69', tag: 'BUTTON', tone: 'idle' },
      { text: '5 × £8.45', tag: 'SPAN', tone: 'current-progress' },
      { text: '8 × £13.04', tag: 'BUTTON', tone: 'idle' },
      { text: '16 × £24.80', tag: 'BUTTON', tone: 'idle' },
    ])
    await setQuantity(10)
    expect(chips()).toEqual([
      { text: '1 × £1.69', tag: 'BUTTON', tone: 'idle' },
      { text: '8 × £13.04 ✓', tag: 'BUTTON', tone: 'applied' },
      { text: '10 × £16.30', tag: 'SPAN', tone: 'current-offer' },
      { text: '16 × £24.80', tag: 'BUTTON', tone: 'idle' },
    ])
  })

  it('a quantity exactly on a tier ticks that chip and shows no dashed chip', async () => {
    await mountTiers(8)
    expect(chips()).toEqual([
      { text: '1 × £1.69', tag: 'BUTTON', tone: 'idle' },
      { text: '8 × £13.04 ✓', tag: 'BUTTON', tone: 'applied' },
      { text: '16 × £24.80', tag: 'BUTTON', tone: 'idle' },
    ])
  })

  it('a quantity past the top tier shows a star on the dashed chip', async () => {
    await mountTiers(20)
    expect(chips().map((chip) => [chip.text, chip.tone])).toEqual([
      ['1 × £1.69', 'idle'], ['8 × £13.04', 'idle'], ['16 × £24.80 ✓', 'applied'], ['20 × £31.00 ★', 'current-highest'],
    ])
  })

  it('clicking a tier chip sets the quantity on the page', async () => {
    await mountTiers(5)
    await click('[data-tier-pricing-tiers] button', 1)
    expect((document.querySelector('input[name="quantity"]') as HTMLInputElement).value).toBe('8')
  })

  it('highest tier: Best Rate in the success colour and the dot on the last marker', async () => {
    await mountTiers(5)
    await setQuantity(16)
    expect(painted()).toMatchObject({
      promo: 'Buy 8+ for £1.63 or 16+ for £1.55',
      status: 'You have 16 units',
      aside: 'Best Rate (£1.55/ea • Add any qty)',
      tone: 'success',
      offerState: 'highest',
      dot: '16',
      dotPct: '100%',
    })
    expect(painted().markers.map((m) => [m.reached, m.covered])).toEqual([[true, false], [true, false], [true, true]])
  })

  it('the quantity beyond the top tier says it exceeds the tier', async () => {
    await mountTiers(5)
    await setQuantity(22)
    expect(painted().status).toBe('You have 22 units (Exceeds 16+ tier)')
  })

  it('the tag: the tier pill once an offer applies, High Demand when switched on before, nothing otherwise', async () => {
    const tag = () => document.querySelector('[data-tier-pricing-tag]') as HTMLElement
    await mountTiers(5)
    expect(tag().hidden).toBe(true)
    await setQuantity(10)
    expect([tag().hidden, tag().textContent, tag().dataset.kind]).toEqual([false, 'Tier 1 Active (8+ units)', 'tier'])
    await mountTiers(5, { highDemand: true })
    expect([tag().hidden, tag().textContent, tag().dataset.kind]).toEqual([false, 'High Demand', 'high-demand'])
    await setQuantity(16)
    expect(tag().textContent).toBe('Tier 2 Active (16+ • Unlimited)')
  })

  it('opens the mix & match list: a row per member with thumbnail slot, name, price at the applied tier and its cart quantity', async () => {
    cartItems = [{ key: '10:k', product_id: 9, variant_id: 10, quantity: 6 }, { key: '200:k', product_id: 20, variant_id: 200, quantity: 4 }]
    await mountTiers(1, {
      ownVariantOptions: [{ variantId: V10, title: 'Chicken & Salmon 85g', url: '/products/salmon', imageUrl: 'https://example.com/s.png', price: 169, available: true, cartVariantId: 10 }],
      siblings: [{ productId: 'gid://shopify/Product/20', variantId: null, title: 'Chicken & Herring 85g', url: '/products/herring', imageUrl: null, price: 169, available: false, cartVariantId: 200, listed: true }],
    })
    ;(document.querySelector('[data-tier-pricing-toggle]') as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(0)
    const rows = [...document.querySelectorAll('.smooth-discounts__list-item')].map((row) => ({
      name: row.querySelector('.smooth-discounts__list-name')!.textContent,
      price: row.querySelector('.smooth-discounts__list-price')!.textContent,
      qty: row.querySelector('.smooth-discounts__list-qty')!.textContent,
      href: row.querySelector('a')!.getAttribute('href'),
      hasImage: !!row.querySelector('img'),
    }))
    expect(rows).toEqual([
      { name: 'Chicken & Salmon 85g', price: '£1.63 each', qty: '6', href: '/products/salmon', hasImage: true },
      { name: 'Chicken & Herring 85g', price: 'Sold out', qty: '4', href: '/products/herring', hasImage: false },
    ])
    const chosen = document.querySelector('[data-tier-pricing-chosen]') as HTMLElement
    expect(chosen.hidden).toBe(false)
    expect(chosen.textContent).toBe('10 items chosen')
  })

  const LIST = {
    ownVariantOptions: [{ variantId: V10, title: 'Chicken & Salmon 85g', url: '/products/salmon', imageUrl: null, price: 169, available: true, cartVariantId: 10 }],
    siblings: [
      { productId: 'gid://shopify/Product/20', variantId: null, title: 'Chicken & Herring 85g', url: '/products/herring', imageUrl: null, price: 169, available: true, cartVariantId: 200, listed: true },
      { productId: 'gid://shopify/Product/30', variantId: null, title: 'Duck Mix', url: '/products/duck', imageUrl: null, price: 169, available: true, cartVariantId: null, listed: true },
    ],
  }

  async function openList(quantity = 1) {
    await mountTiers(quantity, LIST)
    ;(document.querySelector('[data-tier-pricing-toggle]') as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(0)
  }

  async function click(selector: string, index = 0) {
    ;(document.querySelectorAll(selector)[index] as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(0)
  }

  const rowAdds = () => [...document.querySelectorAll('.smooth-discounts__list-item')].map((row) => {
    const add = row.querySelector('.smooth-discounts__add')
    return add ? { href: add.getAttribute('href'), label: add.getAttribute('aria-label'), text: add.textContent, target: add.getAttribute('target') } : null
  })

  it('each row has a small Add link that opens the product in the same tab', async () => {
    await openList()
    // row 1 is the product on the page: no link to itself
    expect(rowAdds()).toEqual([
      null,
      { href: '/products/herring', label: 'Add Chicken & Herring 85g', text: '+ Add', target: null },
      { href: '/products/duck', label: 'Add Duck Mix', text: '+ Add', target: null },
    ])
  })

  it('a sold-out row has no Add link', async () => {
    await mountTiers(1, { ...LIST, siblings: [{ ...LIST.siblings[0], available: false }] })
    ;(document.querySelector('[data-tier-pricing-toggle]') as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(0)
    expect(rowAdds()).toEqual([null, null])
  })

  it('there are no − / + buttons in the list, and pressing Add does not change the cart', async () => {
    await openList()
    expect(document.querySelectorAll('.smooth-discounts__list button')).toHaveLength(0)
    await click('.smooth-discounts__add', 0)
    expect(cartRequests).toEqual([])
    expect(cartItems).toEqual([])
  })

  it('a row shows what is in the cart, and the bar, dot and copy follow the cart', async () => {
    cartItems = [{ key: '200:k', product_id: 20, variant_id: 200, quantity: 8 }]
    await openList()
    const numbers = () => [...document.querySelectorAll('.smooth-discounts__list-qty')]
    expect(numbers().map((el) => el.textContent)).toEqual(['0', '8', '0'])
    expect(numbers()[1].getAttribute('aria-label')).toBe('8 in cart')
    expect(painted()).toMatchObject({ status: 'You have 8 units', aside: 'Add 8 for £1.55/ea', dot: '8' })
    expect(document.querySelector('[data-tier-pricing-chosen]')!.textContent).toBe('8 items chosen')
  })

  describe('accessibility', () => {
    it('the bar is a progressbar with the quantity, its range and a spoken summary', async () => {
      await mountTiers(10)
      const bar = document.querySelector('[data-tier-pricing-bar]') as HTMLElement
      expect(bar.getAttribute('role')).toBe('progressbar')
      expect(bar.getAttribute('aria-valuenow')).toBe('10')
      expect(bar.getAttribute('aria-valuemin')).toBe('1')
      expect(bar.getAttribute('aria-valuemax')).toBe('16')
      expect(bar.getAttribute('aria-valuetext')).toBe('10 of 16 units. Offer unlocked, highest discount at 16.')
    })

    it('a discounted price reads as "Discounted price" then "Original price", never as two bare numbers', async () => {
      await mountTiers(10)
      const price = document.querySelector('[data-tier-pricing-price]') as HTMLElement
      const struck = document.querySelector('[data-tier-pricing-struck]') as HTMLElement
      expect(price.textContent!.replace(/\s+/g, ' ').trim()).toBe('Discounted price: £1.63')
      expect(struck.textContent!.replace(/\s+/g, ' ').trim()).toBe('Original price: £1.69')
      expect(struck.hidden).toBe(false)
      expect(price.querySelectorAll('.smooth-discounts__sr-only')).toHaveLength(1)
      expect(struck.querySelectorAll('.smooth-discounts__sr-only')).toHaveLength(1)
    })

    it('the chip that matches the quantity is pressed, the others are not', async () => {
      await mountTiers(8)
      const pressed = [...document.querySelectorAll('[data-tier-pricing-tiers] button')].map((b) => b.getAttribute('aria-pressed'))
      expect(pressed).toEqual(['false', 'true', 'false'])
    })

    it('the list toggle tells assistive technology whether the list is open', async () => {
      await openList()
      const toggle = document.querySelector('[data-tier-pricing-toggle]') as HTMLElement
      const drawer = document.querySelector('[data-tier-pricing-drawer]') as HTMLElement
      expect([toggle.getAttribute('aria-expanded'), drawer.dataset.open]).toEqual(['true', 'true'])
      ;(toggle as HTMLElement).click()
      expect([toggle.getAttribute('aria-expanded'), drawer.dataset.open]).toEqual(['false', 'false'])
    })

    it('live text is only rewritten when it changed, so the once-a-second refresh does not re-announce it', async () => {
      await mountTiers(5)
      const status = document.querySelector('[data-tier-pricing-status]') as HTMLElement
      const promo = document.querySelector('[data-tier-pricing-promo]') as HTMLElement
      const writes: string[] = []
      const observer = new MutationObserver((records) => records.forEach((r) => writes.push((r.target as HTMLElement).tagName)))
      observer.observe(status, { childList: true, characterData: true, subtree: true })
      observer.observe(promo, { childList: true, characterData: true, subtree: true })
      await vi.advanceTimersByTimeAsync(3500) // three polling renders, nothing changed
      expect(writes).toHaveLength(0)
      await setQuantity(10)
      expect(writes.length).toBeGreaterThan(0) // a real change is still written
      observer.disconnect()
    })
  })
})
