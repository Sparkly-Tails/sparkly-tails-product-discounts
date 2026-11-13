// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearWidgetRegistry, readBuiltWidget } from '../helpers/builtWidget'

/**
 * The pop-up (bundle-popup-ui.js, with the drawing bundle-popup-view.js, the parts bundle-popup-parts.js and the arithmetic bundle-popup-facts.js it works with): the dialog, the
 * boxes, the list of items, the adding and the countdown. The built scripts are run on the page and openPopup is called the way the core script
 * calls it. The shop is a stub that keeps a cart.
 */
const built = readBuiltWidget()
const NOW_SECONDS = 1_800_000_000
const FIXED_TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const PERCENT_TIERS = [{ minQty: 5, percentOff: 10 }]

type Item = { variantId: string; productId: string; handle: string; label: string; imageUrl: string | null; price: number; available: boolean }
type Line = { product_id: number; variant_id: number; quantity: number }
type Box = {
  title: string; tiers: object[]; units: number; firstTierQty: number; items: Item[]; flash: { startsAtUnix: number; endsAtUnix: number } | null
  members: { productId: string; handle: string; variantIds: string[] | null }[]; basePrice: number | null; lines: Line[]; shownKey: string
}
type Answer = { action: 'continue' | 'close'; didAdd: boolean }

const itemOf = (variantId: number, productId: number, label: string, price = 1.69, available = true): Item => ({ variantId: String(variantId), productId: String(productId), handle: 'h' + productId, label, imageUrl: variantId === 11 ? 'https://cdn.test/tuna.jpg' : null, price, available })
const lineOf = (productId: number, variantId: number, quantity: number): Line => ({ product_id: productId, variant_id: variantId, quantity })
const PRODUCT_OF_VARIANT: Record<number, number> = { 11: 100, 12: 100, 13: 200, 21: 300, 22: 300 }

const boxOf = (overrides: Partial<Box> = {}): Box => ({
  title: 'Tins mix', tiers: FIXED_TIERS, units: 3, firstTierQty: 8,
  items: [itemOf(11, 100, 'Tuna – Small'), itemOf(12, 100, 'Tuna – Large'), itemOf(13, 200, 'Salmon'), itemOf(14, 200, 'Sold out one', 1.69, false)],
  flash: null, members: [{ productId: '100', handle: 'tuna', variantIds: null }, { productId: '200', handle: 'salmon', variantIds: null }],
  basePrice: 1.69, lines: [lineOf(100, 11, 3)], shownKey: 'key-1', ...overrides,
})
const secondBoxOf = (overrides: Partial<Box> = {}) => boxOf({
  title: 'Treats', tiers: PERCENT_TIERS, units: 2, firstTierQty: 5, basePrice: 2, lines: [lineOf(300, 21, 2)],
  items: [itemOf(21, 300, 'Chew', 2), itemOf(22, 300, 'Bone', 2)], members: [{ productId: '300', handle: 'treats', variantIds: null }], shownKey: 'key-2', ...overrides,
})

const fetchMock = vi.fn()
const showModal = vi.fn()
type Network = { cart: Record<number, number>; addStatus: number; posts: { path: string; body: { items: { id: number; quantity: number }[] } }[]; reads: string[]; cartFails: boolean }
let network: Network

function startNetwork(cart: Record<number, number>): Network {
  const next: Network = { cart, addStatus: 200, posts: [], reads: [], cartFails: false }
  fetchMock.mockImplementation(async (path: string, init?: { body?: string }) => {
    if (/cart\/add\.js$/.test(path)) {
      const body = JSON.parse(init?.body ?? '{}')
      next.posts.push({ path, body })
      if (next.addStatus !== 200) return { ok: false, status: next.addStatus, json: async () => ({ description: 'sold out' }) }
      for (const entry of body.items) next.cart[entry.id] = (next.cart[entry.id] ?? 0) + entry.quantity
      return { ok: true, status: 200, json: async () => ({}) }
    }
    if (/cart\.js$/.test(path)) {
      next.reads.push(path)
      if (next.cartFails) throw new Error('offline')
      const items = Object.entries(next.cart).map(([id, quantity]) => lineOf(PRODUCT_OF_VARIANT[Number(id)], Number(id), quantity))
      return { ok: true, status: 200, json: async () => ({ items }) }
    }
    throw new Error('unexpected request ' + path)
  })
  return next
}

class FakeObserver {
  static last: FakeObserver | null = null
  callback: (entries: { target: Element; intersectionRatio: number }[]) => void
  observed: Element[] = []
  disconnected = false
  constructor(callback: (entries: { target: Element; intersectionRatio: number }[]) => void) {
    this.callback = callback
    FakeObserver.last = this
  }
  observe(element: Element) { this.observed.push(element) }
  unobserve() {}
  disconnect() { this.disconnected = true }
}

async function settle() {
  for (let round = 0; round < 8; round += 1) await vi.advanceTimersByTimeAsync(0)
}

type OpenOptions = { boxes?: Box[]; root?: string; moneyFormat?: string; accents?: object; cart?: Record<number, number> }
type Opened = { promise: Promise<Answer>; dialog: HTMLDialogElement; opener: HTMLElement; answers: Answer[] }

async function openBoxes({ boxes = [boxOf()], root = '/', moneyFormat = '£{{amount}}', accents = { moss: '#434625', cream: '#f3ecd9', night: '#2b2d17', radius: 12 }, cart = { 11: 3 } }: OpenOptions = {}): Promise<Opened> {
  network = startNetwork({ ...cart })
  document.body.innerHTML = '<button name="checkout" type="submit">Check out</button>'
  const opener = document.querySelector('button[name="checkout"]') as HTMLElement
  opener.focus()
  const components = (window as unknown as { SmoothDiscounts: { components: { popupUi: { openPopup: (options: object) => Promise<Answer> } } & Record<string, object> } }).SmoothDiscounts.components
  const answers: Answer[] = []
  const promise = components.popupUi.openPopup({ win: window, boxes, root, accents, moneyFormat, opener, components }).then((answer) => { answers.push(answer); return answer })
  await settle()
  return { promise, dialog: document.querySelector('dialog') as HTMLDialogElement, opener, answers }
}

const boxElements = () => Array.from(document.querySelectorAll('dialog [data-box]')) as HTMLElement[]
const textOf = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
const captionOf = (milestone: Element) => textOf(milestone.querySelector('.smooth-discounts-popup__caption'))
const buttonByText = (scope: ParentNode, text: string) => Array.from(scope.querySelectorAll('button')).find((button) => textOf(button).includes(text)) as HTMLButtonElement | undefined
const closeButton = (scope: ParentNode) => scope.querySelector('.smooth-discounts-popup__close') as HTMLButtonElement
/** Escape: the dialog's own "cancel" event, which closes the pop-up and stays on the page. */
const pressEscape = async (dialog: HTMLElement) => {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
  await settle()
}
const controlOf = (scope: ParentNode, action: string, variantId: string) => scope.querySelector(`button[data-action="${action}"][data-variant="${variantId}"]`) as HTMLButtonElement
const addButtons = (scope: ParentNode) => Array.from(scope.querySelectorAll('button[data-action="add"]')) as HTMLButtonElement[]
const pressAndSettle = async (button: Element | undefined) => { (button as HTMLElement).click(); await settle() }

beforeEach(() => {
  vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
  clearWidgetRegistry()
  FakeObserver.last = null
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  showModal.mockReset()
  ;(HTMLDialogElement.prototype as unknown as { showModal: () => void }).showModal = function showModalStub(this: HTMLDialogElement) { showModal(); this.setAttribute('open', '') }
  ;(HTMLDialogElement.prototype as unknown as { close: () => void }).close = function closeStub(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
  for (const name of ['bundle-popup-facts.js', 'bundle-popup-parts.js', 'bundle-popup-view.js', 'bundle-popup-ui.js']) (0, eval)(built[name])
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('the dialog', () => {
  it('opens a modal dialog labelled by its heading, with a close button and the boxes, and no footer or Continue link', async () => {
    const { dialog } = await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(showModal).toHaveBeenCalledTimes(1)
    expect(dialog.hasAttribute('open')).toBe(true)
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby') as string)
    expect(textOf(heading)).toBe('Wait, complete your bundle to unlock instant savings')
    expect(closeButton(dialog).getAttribute('aria-label')).toBe('Close dialog')
    expect(boxElements()).toHaveLength(2)
    expect(dialog.querySelector('.smooth-discounts-popup__footer')).toBeNull()
    expect(dialog.querySelector('.smooth-discounts-popup__continue')).toBeNull()
    expect(Array.from(dialog.querySelectorAll('a, button')).some((element) => textOf(element) === 'Continue to checkout')).toBe(false)
  })

  it('shows the heading and the intro of the design above the boxes, with no eyebrow tag above the heading, the same for one box or several', async () => {
    const { dialog } = await openBoxes()

    expect(dialog.querySelector('.smooth-discounts-popup__eyebrow')).toBeNull()
    expect(dialog.textContent).not.toContain('Unclaimed Bundle Savings')
    expect(textOf(dialog.querySelector('.smooth-discounts-popup__heading'))).toBe('Wait, complete your bundle to unlock instant savings')
    expect(textOf(dialog.querySelector('.smooth-discounts-popup__intro'))).toBe('You are only a few units away from triggering volume discount rates on qualifying items.')
    expect(dialog.querySelector('.smooth-discounts-popup__header')!.compareDocumentPosition(dialog.querySelector('[data-box]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('moves focus into the dialog, and back to the Checkout button when it closes', async () => {
    const { dialog, opener, promise } = await openBoxes()

    expect(dialog.contains(document.activeElement)).toBe(true)
    await pressAndSettle(closeButton(dialog))
    await promise
    expect(document.activeElement).toBe(opener)
  })

  it('resolves { action: "continue" } for the close button, which carries the customer on to checkout, and takes the dialog off the page', async () => {
    const byButton = await openBoxes()
    await pressAndSettle(closeButton(byButton.dialog))
    await expect(byButton.promise).resolves.toEqual({ action: 'continue', didAdd: false })
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('resolves { action: "close" } for Escape and a click on the backdrop, which stay on the page', async () => {
    const byEscape = await openBoxes()
    await pressEscape(byEscape.dialog)
    await expect(byEscape.promise).resolves.toEqual({ action: 'close', didAdd: false })

    const byBackdrop = await openBoxes()
    byBackdrop.dialog.click()
    await settle()
    await expect(byBackdrop.promise).resolves.toEqual({ action: 'close', didAdd: false })
  })

  it('does not close when the click is inside the dialog', async () => {
    const { dialog, answers } = await openBoxes()

    ;(dialog.querySelector('[data-box]') as HTMLElement).click()
    await settle()

    expect(answers).toEqual([])
    expect(dialog.hasAttribute('open')).toBe(true)
  })

  it('stops watching the boxes and the clock when it closes', async () => {
    const { dialog, promise } = await openBoxes({ boxes: [boxOf({ flash: { startsAtUnix: NOW_SECONDS - 10, endsAtUnix: NOW_SECONDS + 500 } })] })

    await pressAndSettle(closeButton(dialog))
    await promise

    expect(FakeObserver.last?.disconnected).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('expanded and contracted boxes', () => {
  it('opens with the first box expanded and the others contracted', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(boxElements().map((element) => element.dataset.expanded)).toEqual(['true', 'false'])
  })

  it('expands a contracted box when its "View & mix eligible products" is pressed, and contracts the other', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })
    const second = boxElements()[1]

    await pressAndSettle(buttonByText(second, 'View & mix eligible products (2 available)'))

    expect(boxElements().map((element) => element.dataset.expanded)).toEqual(['false', 'true'])
    expect(addButtons(boxElements()[1])).toHaveLength(2)
    expect(addButtons(boxElements()[0])).toHaveLength(0)
  })

  it('expands the box that is most in view', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })
    const observer = FakeObserver.last as FakeObserver
    expect(observer.observed).toEqual(boxElements())

    observer.callback([{ target: boxElements()[0], intersectionRatio: 0.2 }, { target: boxElements()[1], intersectionRatio: 0.8 }])
    await settle()

    expect(boxElements().map((element) => element.dataset.expanded)).toEqual(['false', 'true'])
  })

  it('works without an IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)

    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(boxElements()).toHaveLength(2)
  })

  it('shows the title, the badge and the incentive line of an expanded fixed-price box, then the chips, the items and the Quick auto-fill row', async () => {
    await openBoxes()
    const [first] = boxElements()

    expect(textOf(first.querySelector('h3'))).toBe('Tins mix')
    expect(first.textContent).toContain('Tier 1 at 8 items')
    expect(first.textContent).toContain('Currently 3 units selected • Add 5 more to unlock £1.63/ea (Save £0.48 on these items!)')
    expect(Array.from(first.querySelectorAll('[data-chip]')).map(textOf)).toEqual(['1 × £1.69', '3 × £5.07 (Current)', '8 × £13.04 (Tier 1)', '16 × £24.80'])
    const rows = Array.from(first.querySelectorAll('[data-item]'))
    expect(rows.map((row) => textOf(row.querySelector('[data-name]')))).toEqual(['Tuna – Small', 'Tuna – Large', 'Salmon'])
    expect(textOf(rows[0].querySelector('[data-rate]'))).toBe('Tier rate: £1.63/ea')
    expect(textOf(rows[0].querySelector('[data-count]'))).toBe('3 in cart')
    expect(rows[1].querySelector('[data-count]')).toBeNull()
    expect(rows[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/tuna.jpg')
    expect(rows[2].querySelector('img')).toBeNull()
    expect(first.textContent).toContain('⚡ Quick auto-fill: Add 5 more items')
    expect(first.textContent).toContain('(+£8.45)')
    expect(buttonByText(first, 'Add 5 & unlock tier')).toBeDefined()
  })

  it('tags only the chip of the customer\'s units and the chip of the first tier', async () => {
    await openBoxes({ boxes: [boxOf({ units: 1, lines: [lineOf(100, 11, 1)] })] })
    const [first] = boxElements()

    expect(Array.from(first.querySelectorAll('[data-chip]')).map(textOf)).toEqual(['1 × £1.69 (Current)', '8 × £13.04 (Tier 1)', '16 × £24.80'])
    expect(Array.from(first.querySelectorAll('[data-chip]')).map((chip) => chip.getAttribute('data-tag'))).toEqual(['current', 'tier', ''])
  })

  it('shows the percentage wording, and chips worked out from the cheapest item, for a percentage bundle whose items cost different amounts', async () => {
    const mixed = secondBoxOf({ basePrice: null, items: [itemOf(21, 300, 'Chew', 3), itemOf(22, 300, 'Bone', 2)] })
    await openBoxes({ boxes: [mixed] })
    const [only] = boxElements()

    expect(only.textContent).toContain('Unlock 10% off at 5 units')
    expect(only.textContent).toContain('2 of 5 items selected • Add 3 more to unlock 10% off the whole bundle')
    expect(Array.from(only.querySelectorAll('[data-chip]')).map(textOf)).toEqual(['1 × £2.00', '2 × £4.00 (Current)', '5 × £9.00 (Tier 1)'])
  })

  it('shows a contracted box as its title, badge, incentive and the two buttons, with no items', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })
    const second = boxElements()[1]

    expect(textOf(second.querySelector('h3'))).toBe('Treats')
    expect(second.textContent).toContain('Unlock 10% off at 5 units')
    expect(second.textContent).toContain('2 of 5 items selected')
    expect(buttonByText(second, 'View & mix eligible products (2 available)')).toBeDefined()
    expect(textOf(buttonByText(second, 'Quick-add'))).toBe('⚡ Quick-add 3 to unlock 10% OFF (+£6.00)')
    expect(second.querySelectorAll('[data-item]')).toHaveLength(0)
    expect(second.querySelectorAll('[data-chip]')).toHaveLength(0)
  })

  it('counts only the items that can be added in "available"', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(buttonByText(boxElements()[1], '(2 available)')).toBeDefined()
    await pressAndSettle(buttonByText(boxElements()[1], 'View & mix'))
    await pressAndSettle(buttonByText(boxElements()[0], 'View & mix eligible products (3 available)'))
    expect(boxElements().map((element) => element.dataset.expanded)).toEqual(['true', 'false'])
  })
})

describe('the progress rail', () => {
  it('fills the rail as far as the units are of the first tier, with the milestones under it', async () => {
    await openBoxes()
    const [first] = boxElements()

    expect(first.querySelector('[data-progress]')?.getAttribute('style')).toBe('width:38%')
    const milestones = Array.from(first.querySelectorAll('.smooth-discounts-popup__milestone'))
    expect(milestones.map(captionOf)).toEqual(['1 item', '3 in cart', '8 items (Tier 1)', '16 items (Tier 2)'])
    expect(milestones.map((milestone) => milestone.getAttribute('data-state'))).toEqual(['done', 'current', 'target', 'later'])
  })

  it('puts a small numbered circle with the quantity above each milestone label', async () => {
    await openBoxes()
    const [first] = boxElements()

    const markers = Array.from(first.querySelectorAll('.smooth-discounts-popup__milestone > .smooth-discounts-popup__marker'))
    expect(markers.map(textOf)).toEqual(['1', '3', '8', '16'])
    expect(markers.map((marker) => marker.getAttribute('aria-hidden'))).toEqual(['true', 'true', 'true', 'true'])
  })

  it('shows the rail in a contracted box too', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })
    const second = boxElements()[1]

    expect(second.querySelector('[data-progress]')?.getAttribute('style')).toBe('width:40%')
    expect(Array.from(second.querySelectorAll('.smooth-discounts-popup__milestone')).map(captionOf)).toEqual(['1 item', '2 in cart', '5 items (Tier 1)'])
  })

  it('moves the rail on after an add', async () => {
    await openBoxes()

    await pressAndSettle(addButtons(boxElements()[0])[0])

    expect(boxElements()[0].querySelector('[data-progress]')?.getAttribute('style')).toBe('width:50%')
  })
})

describe('the quantity of an item', () => {
  it('starts at 1 on every row, between a "one fewer" and a "one more" button', async () => {
    await openBoxes()
    const rows = Array.from(boxElements()[0].querySelectorAll('[data-item]'))

    expect(rows.map((row) => textOf(row.querySelector('[data-quantity]')))).toEqual(['1', '1', '1'])
    expect(controlOf(boxElements()[0], 'minus', '12').getAttribute('aria-label')).toBe('One fewer: Tuna – Large')
    expect(controlOf(boxElements()[0], 'plus', '12').getAttribute('aria-label')).toBe('One more: Tuna – Large')
  })

  it('goes up and down with the buttons, never below 1 and never above 99', async () => {
    await openBoxes()
    const quantityOf = () => textOf(boxElements()[0].querySelector('[data-item="12"] [data-quantity]'))

    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))
    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))
    expect(quantityOf()).toBe('3')
    await pressAndSettle(controlOf(boxElements()[0], 'minus', '12'))
    expect(quantityOf()).toBe('2')
    await pressAndSettle(controlOf(boxElements()[0], 'minus', '12'))
    await pressAndSettle(controlOf(boxElements()[0], 'minus', '12'))
    expect(quantityOf()).toBe('1')
    for (let press = 0; press < 100; press += 1) controlOf(boxElements()[0], 'plus', '12').click()
    expect(quantityOf()).toBe('99')
  })

  it('does not change the other rows, and puts nothing in the cart', async () => {
    await openBoxes()

    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))

    expect(textOf(boxElements()[0].querySelector('[data-item="11"] [data-quantity]'))).toBe('1')
    expect(network.posts).toEqual([])
  })

  it('keeps focus on the button that was pressed', async () => {
    await openBoxes()
    controlOf(boxElements()[0], 'plus', '12').focus()

    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))

    expect(document.activeElement).toBe(controlOf(boxElements()[0], 'plus', '12'))
  })

  it('adds that many units of the item in one request, then sets the number back to 1', async () => {
    await openBoxes()
    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))
    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))

    await pressAndSettle(controlOf(boxElements()[0], 'add', '12'))

    expect(network.posts).toEqual([{ path: '/cart/add.js', body: { items: [{ id: 12, quantity: 3 }] } }])
    expect(boxElements()[0].textContent).toContain('Currently 6 units selected • Add 2 more')
    expect(textOf(boxElements()[0].querySelector('[data-item="12"] [data-quantity]'))).toBe('1')
  })

  it('keeps the number when the add fails, so the customer can try again', async () => {
    await openBoxes()
    network.addStatus = 422
    await pressAndSettle(controlOf(boxElements()[0], 'plus', '12'))

    await pressAndSettle(controlOf(boxElements()[0], 'add', '12'))

    expect(textOf(boxElements()[0].querySelector('[data-item="12"] [data-quantity]'))).toBe('2')
  })
})

describe('the list of eligible items', () => {
  const manyItems = [itemOf(11, 100, 'Tuna – Small'), itemOf(12, 100, 'Tuna – Large'), itemOf(13, 200, 'Salmon'), itemOf(15, 200, 'Trout'), itemOf(16, 200, 'Cod'), itemOf(17, 200, 'Hake')]

  it('lists the first four items with how many of how many it shows, and "Show 2 more"', async () => {
    await openBoxes({ boxes: [boxOf({ items: manyItems })] })
    const [first] = boxElements()

    expect(first.querySelectorAll('[data-item]')).toHaveLength(4)
    expect(first.textContent).toContain('Showing 4 of 6 eligible items')
    expect(textOf(first.querySelector('.smooth-discounts-popup__label'))).toBe('Eligible items in this bundle — add any to qualify')
    expect(buttonByText(first, 'Show 2 more')).toBeDefined()
  })

  it('lists all of them after "Show 2 more", and four again after "Show fewer"', async () => {
    await openBoxes({ boxes: [boxOf({ items: manyItems })] })

    await pressAndSettle(buttonByText(boxElements()[0], 'Show 2 more'))
    expect(boxElements()[0].querySelectorAll('[data-item]')).toHaveLength(6)
    expect(boxElements()[0].textContent).toContain('Showing 6 of 6 eligible items')

    await pressAndSettle(buttonByText(boxElements()[0], 'Show fewer'))
    expect(boxElements()[0].querySelectorAll('[data-item]')).toHaveLength(4)
  })

  it('keeps focus on the "Show more" button after it is pressed', async () => {
    await openBoxes({ boxes: [boxOf({ items: manyItems })] })
    buttonByText(boxElements()[0], 'Show 2 more')!.focus()

    await pressAndSettle(buttonByText(boxElements()[0], 'Show 2 more'))

    expect(document.activeElement).toBe(boxElements()[0].querySelector('[data-action="reveal"]'))
  })

  it('has no paging row for four items or fewer', async () => {
    await openBoxes()

    expect(boxElements()[0].querySelector('[data-action="reveal"]')).toBeNull()
    expect(boxElements()[0].textContent).not.toContain('Showing')
  })
})

describe('what a contracted box shows of the cart', () => {
  it('lists the items in the cart and how many more are needed', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(textOf(boxElements()[1].querySelector('.smooth-discounts-popup__preview'))).toBe('2× Chew (3 more needed for discount)')
  })
})

describe('the flash sale', () => {
  const flash = { startsAtUnix: NOW_SECONDS - 100, endsAtUnix: NOW_SECONDS + 3 }

  it('shows the flash bar with the countdown on a flash sale box, and none on another', async () => {
    await openBoxes({ boxes: [boxOf({ flash: { startsAtUnix: NOW_SECONDS - 100, endsAtUnix: NOW_SECONDS + 15_000 } }), secondBoxOf()] })
    const [first, second] = boxElements()

    expect(first.textContent).toContain('⚡ TIER 1 FLASH SALE ENDS IN')
    expect(textOf(first.querySelector('[data-countdown]'))).toBe('04 : 10 : 00')
    expect(second.textContent).not.toContain('FLASH SALE')
  })

  it('counts down each second', async () => {
    await openBoxes({ boxes: [boxOf({ flash: { startsAtUnix: NOW_SECONDS - 100, endsAtUnix: NOW_SECONDS + 75 } })] })
    expect(textOf(document.querySelector('[data-countdown]'))).toBe('01 : 15')

    await vi.advanceTimersByTimeAsync(1000)
    expect(textOf(document.querySelector('[data-countdown]'))).toBe('01 : 14')

    await vi.advanceTimersByTimeAsync(2000)
    expect(textOf(document.querySelector('[data-countdown]'))).toBe('01 : 12')
  })

  it('takes the box off when its countdown reaches zero, and leaves the others and the close button', async () => {
    const { dialog } = await openBoxes({ boxes: [boxOf({ flash }), secondBoxOf()] })
    expect(boxElements()).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(3000)

    expect(boxElements().map((element) => textOf(element.querySelector('h3')))).toEqual(['Treats'])
    expect(closeButton(dialog)).not.toBeNull()
  })

  it('keeps counting a flash sale box that is contracted, and removes it on time', async () => {
    await openBoxes({ boxes: [secondBoxOf(), boxOf({ flash })] })
    expect(boxElements()[1].dataset.expanded).toBe('false')

    await vi.advanceTimersByTimeAsync(3000)

    expect(boxElements()).toHaveLength(1)
  })
})

describe('adding', () => {
  it('posts the item to the cart, re-reads the cart, and updates the incentive line, the chips and the count in the cart', async () => {
    await openBoxes()
    const first = boxElements()[0]

    await pressAndSettle(addButtons(first)[1])

    expect(network.posts).toEqual([{ path: '/cart/add.js', body: { items: [{ id: 12, quantity: 1 }] } }])
    expect(network.reads).toEqual(['/cart.js'])
    const after = boxElements()[0]
    expect(after.textContent).toContain('Currently 4 units selected • Add 4 more to unlock £1.63/ea')
    expect(Array.from(after.querySelectorAll('[data-chip]')).map(textOf)).toContain('4 × £6.76 (Current)')
    expect(textOf(after.querySelectorAll('[data-item]')[1].querySelector('[data-count]'))).toBe('1 in cart')
    expect(after.textContent).toContain('Add 4 & unlock tier')
  })

  it('uses the root link of a language store for both requests', async () => {
    await openBoxes({ root: '/fr/' })

    await pressAndSettle(addButtons(boxElements()[0])[0])

    expect(network.posts[0].path).toBe('/fr/cart/add.js')
    expect(network.reads).toEqual(['/fr/cart.js'])
  })

  it('ignores a second press of Add while the first is on its way', async () => {
    await openBoxes()
    const button = addButtons(boxElements()[0])[0]

    button.click()
    button.click()
    await settle()

    expect(network.posts).toHaveLength(1)
  })

  it('adds all the missing units in one request with several items when Quick auto-fill is pressed, and shows "Tier unlocked" with the items still listed', async () => {
    await openBoxes()

    await pressAndSettle(buttonByText(boxElements()[0], 'Add 5 & unlock tier'))

    expect(network.posts).toHaveLength(1)
    const quantity = network.posts[0].body.items.reduce((total, entry) => total + entry.quantity, 0)
    expect(quantity).toBe(5)
    expect(network.posts[0].body.items.length).toBeGreaterThan(1)
    const after = boxElements()[0]
    expect(after.textContent).toContain('Tier unlocked')
    expect(addButtons(after).length).toBeGreaterThan(0)
    expect(buttonByText(after, 'unlock tier')).toBeUndefined()
    expect(buttonByText(after, 'Quick-add')).toBeUndefined()
  })

  it('keeps the box expanded, with its items and their Add buttons, when an Add reaches the first tier, so more can be added', async () => {
    await openBoxes({ boxes: [boxOf({ units: 7, lines: [lineOf(100, 11, 7)] })], cart: { 11: 7 } })
    const before = boxElements()[0]
    expect(addButtons(before).length).toBeGreaterThan(0)

    await pressAndSettle(addButtons(before)[0])

    const after = boxElements()[0]
    expect(after.textContent).toContain('Tier unlocked')
    expect(after.dataset.expanded).toBe('true')
    expect(after.querySelectorAll('[data-item]').length).toBeGreaterThan(0)
    expect(addButtons(after).length).toBeGreaterThan(0)
    expect(after.querySelector('[data-action="quick"]')).toBeNull()
    await pressAndSettle(addButtons(after)[0])
    expect(network.posts).toHaveLength(2)
    expect(boxElements()[0].dataset.expanded).toBe('true')
  })

  it('also unlocks a contracted box from its Quick-add button', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()], cart: { 11: 3, 21: 2 } })

    await pressAndSettle(buttonByText(boxElements()[1], 'Quick-add 3'))

    expect(network.posts[0].body.items.reduce((total, entry) => total + entry.quantity, 0)).toBe(3)
    expect(boxElements()[1].textContent).toContain('Tier unlocked')
    expect(boxElements()[0].textContent).toContain('Currently 3 units selected')
  })

  it('shows "We couldn\'t add that. Try again." when the shop refuses, re-reads the cart, and still lets the customer continue', async () => {
    const { dialog, promise } = await openBoxes()
    network.addStatus = 422

    await pressAndSettle(addButtons(boxElements()[0])[0])

    expect(boxElements()[0].textContent).toContain('We couldn\'t add that. Try again.')
    expect(network.reads).toEqual(['/cart.js'])
    expect(boxElements()[0].textContent).toContain('Currently 3 units selected')
    await pressAndSettle(closeButton(dialog))
    await expect(promise).resolves.toEqual({ action: 'continue', didAdd: false })
  })

  it('shows the same message when the request cannot be made, and clears it with the next good add', async () => {
    await openBoxes()
    fetchMock.mockImplementationOnce(async () => { throw new Error('offline') })

    await pressAndSettle(addButtons(boxElements()[0])[0])
    expect(boxElements()[0].textContent).toContain('We couldn\'t add that. Try again.')

    await pressAndSettle(addButtons(boxElements()[0])[0])
    expect(boxElements()[0].textContent).not.toContain('We couldn\'t add that.')
  })

  it('keeps the box as it was when the cart cannot be read after an add', async () => {
    await openBoxes()
    network.cartFails = true

    await pressAndSettle(addButtons(boxElements()[0])[0])

    expect(boxElements()[0].textContent).toContain('Currently 3 units selected')
    expect(addButtons(boxElements()[0])).toHaveLength(3)
  })

  it('counts an add that is still on its way as an add, for the close button and for Escape', async () => {
    for (const action of ['continue', 'close'] as const) {
      const opened = await openBoxes()
      const answerRead = fetchMock.getMockImplementation() as (path: string, init?: object) => Promise<unknown>
      fetchMock.mockImplementation((path: string, init?: object) => (/cart\/add\.js$/.test(path) ? new Promise(() => {}) : answerRead(path, init)))
      await pressAndSettle(addButtons(boxElements()[0])[0])

      if (action === 'continue') await pressAndSettle(closeButton(opened.dialog))
      else await pressEscape(opened.dialog)

      await expect(opened.promise).resolves.toEqual({ action, didAdd: true })
    }
  })

  it('resolves the close button with didAdd true after any successful add, and Escape the same way', async () => {
    const continued = await openBoxes()
    await pressAndSettle(addButtons(boxElements()[0])[0])
    await pressAndSettle(closeButton(continued.dialog))
    await expect(continued.promise).resolves.toEqual({ action: 'continue', didAdd: true })

    const closed = await openBoxes()
    await pressAndSettle(addButtons(boxElements()[0])[0])
    await pressEscape(closed.dialog)
    await expect(closed.promise).resolves.toEqual({ action: 'close', didAdd: true })
  })
})

describe('keyboard focus', () => {
  it('keeps focus on the control when the box it is in becomes the expanded one as the list scrolls', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })
    const quickAdd = boxElements()[1].querySelector('button[data-action="quick"]') as HTMLButtonElement
    quickAdd.focus()
    expect(document.activeElement).toBe(quickAdd)

    ;(FakeObserver.last as FakeObserver).callback([{ target: boxElements()[0], intersectionRatio: 0.2 }, { target: boxElements()[1], intersectionRatio: 0.8 }])
    await settle()

    expect(boxElements()[1].dataset.expanded).toBe('true')
    expect(document.activeElement).toBe(boxElements()[1].querySelector('button[data-action="quick"]'))
  })

  it('keeps focus on the same Add button after the box is drawn again', async () => {
    await openBoxes()
    const button = addButtons(boxElements()[0])[1]
    button.focus()

    await pressAndSettle(button)

    expect(document.activeElement).toBe(addButtons(boxElements()[0])[1])
    expect(document.activeElement).not.toBe(button)
  })

  it('moves focus to the box when the control that was pressed is gone, so it is not lost', async () => {
    await openBoxes()

    await pressAndSettle(buttonByText(boxElements()[0], 'Add 5 & unlock tier'))

    expect(document.activeElement).toBe(boxElements()[0])
  })

  it('moves focus to the box that was opened by "View & mix eligible products"', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    await pressAndSettle(buttonByText(boxElements()[1], 'View & mix'))

    expect(document.activeElement).toBe(boxElements()[1])
  })
})

describe('the look and the words', () => {
  it('heads a box that has no title "Your bundle"', async () => {
    await openBoxes({ boxes: [boxOf({ title: '' })] })

    expect(textOf(boxElements()[0].querySelector('h3'))).toBe('Your bundle')
  })

  it('gives every box the store\'s look: background, corner radius, accents and flash tone', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()], accents: { moss: '#434625', cream: '#aabbcc', night: '#1b3a2d', radius: 8 } })

    for (const element of boxElements()) {
      expect(element.style.getPropertyValue('--smooth-discounts-cream')).toBe('#AABBCC')
      expect(element.style.getPropertyValue('--smooth-discounts-radius')).toBe('8px')
      expect(element.style.getPropertyValue('--smooth-discounts-moss')).toBe('#434625')
      expect(element.style.getPropertyValue('--smooth-discounts-sun')).toBe('')
      expect(element.style.getPropertyValue('--smooth-discounts-flash-dark')).toBe('#1B3A2D')
    }
  })

  it('leaves out an unsafe colour and a radius out of range, so the stylesheet default applies', async () => {
    await openBoxes({ accents: { moss: '#434625', cream: 'red;}body{display:none', night: 'blue', radius: 99 } })

    const [element] = boxElements()
    expect(element.style.getPropertyValue('--smooth-discounts-cream')).toBe('')
    expect(element.style.getPropertyValue('--smooth-discounts-radius')).toBe('')
    expect(element.style.getPropertyValue('--smooth-discounts-flash-dark')).toBe('')
  })

  it('writes every amount in the money format it was given', async () => {
    await openBoxes({ moneyFormat: '{{amount}} €' })
    const first = boxElements()[0]

    expect(first.textContent).toContain('1.63 €/ea')
    expect(textOf(first.querySelector('[data-rate]'))).toBe('Tier rate: 1.63 €/ea')
    expect(first.textContent).toContain('(+8.45 €)')
  })

  it('shows what the shop sends as text, never as markup', async () => {
    await openBoxes({ boxes: [boxOf({ title: '<img src=x onerror=alert(1)>', items: [itemOf(11, 100, '<b>Tuna</b>')] })] })

    expect(boxElements()[0].querySelector('h3 img')).toBeNull()
    expect(textOf(boxElements()[0].querySelector('h3'))).toBe('<img src=x onerror=alert(1)>')
    expect(boxElements()[0].querySelector('[data-name] b')).toBeNull()
  })
})


describe('the tier chips', () => {
  const scrollTo = vi.fn()
  const CHIP_ROW_LEFT = 10
  const CURRENT_CHIP_LEFT = 310
  const rectOf = (left: number) => ({ left, right: left, top: 0, bottom: 0, width: 0, height: 0, x: left, y: 0, toJSON: () => ({}) })
  const chipRows = () => Array.from(document.querySelectorAll('.smooth-discounts-popup__chips')) as HTMLElement[]

  beforeEach(() => {
    scrollTo.mockReset()
    ;(Element.prototype as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: Element) {
      if (this.matches('.smooth-discounts-popup__chips')) return rectOf(CHIP_ROW_LEFT)
      return this.matches('[data-tag="current"]') ? rectOf(CURRENT_CHIP_LEFT) : rectOf(0)
    })
  })

  afterEach(() => {
    delete (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo
    vi.restoreAllMocks()
  })

  it('slides the chip of the customer\'s units to the left edge of the row when the pop-up opens', async () => {
    await openBoxes()

    expect(scrollTo).toHaveBeenLastCalledWith({ left: CURRENT_CHIP_LEFT - CHIP_ROW_LEFT, behavior: 'auto' })
    // Slid again once the dialog is shown: before that the row has no size on the page, so sliding it would do nothing.
    expect(scrollTo.mock.invocationCallOrder.at(-1)).toBeGreaterThan(showModal.mock.invocationCallOrder[0])
  })

  it('slides again after units change, starting from where the row was scrolled rather than from its start', async () => {
    await openBoxes()
    Object.defineProperty(chipRows()[0], 'scrollLeft', { value: 120, configurable: true })
    scrollTo.mockReset()

    await pressAndSettle(addButtons(boxElements()[0])[0])

    expect(scrollTo.mock.calls[0][0]).toEqual({ left: 120, behavior: 'instant' })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: CURRENT_CHIP_LEFT - CHIP_ROW_LEFT, behavior: 'auto' })
  })

  it('does nothing for a contracted box, which has no chips', async () => {
    await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(chipRows()).toHaveLength(1)
    expect(scrollTo.mock.calls.every((call) => call[0].behavior === 'instant' || call[0].behavior === 'auto')).toBe(true)
  })
})
