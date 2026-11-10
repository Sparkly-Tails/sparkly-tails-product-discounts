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
  style: object | null; members: { productId: string; handle: string; variantIds: string[] | null }[]; basePrice: number | null; lines: Line[]; shownKey: string; popupFrequency: string
}
type Answer = { action: 'continue' | 'close'; didAdd: boolean }

const itemOf = (variantId: number, productId: number, label: string, price = 1.69, available = true): Item => ({ variantId: String(variantId), productId: String(productId), handle: 'h' + productId, label, imageUrl: variantId === 11 ? 'https://cdn.test/tuna.jpg' : null, price, available })
const lineOf = (productId: number, variantId: number, quantity: number): Line => ({ product_id: productId, variant_id: variantId, quantity })
const PRODUCT_OF_VARIANT: Record<number, number> = { 11: 100, 12: 100, 13: 200, 21: 300, 22: 300 }

const boxOf = (overrides: Partial<Box> = {}): Box => ({
  title: 'Tins mix', tiers: FIXED_TIERS, units: 3, firstTierQty: 8,
  items: [itemOf(11, 100, 'Tuna – Small'), itemOf(12, 100, 'Tuna – Large'), itemOf(13, 200, 'Salmon'), itemOf(14, 200, 'Sold out one', 1.69, false)],
  flash: null, style: {}, members: [{ productId: '100', handle: 'tuna', variantIds: null }, { productId: '200', handle: 'salmon', variantIds: null }],
  basePrice: 1.69, lines: [lineOf(100, 11, 3)], shownKey: 'key-1', popupFrequency: 'session', ...overrides,
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

async function openBoxes({ boxes = [boxOf()], root = '/', moneyFormat = '£{{amount}}', accents = { moss: '#434625', cream: '#f3ecd9', sun: '#ffdc4c' }, cart = { 11: 3 } }: OpenOptions = {}): Promise<Opened> {
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
const buttonByText = (scope: ParentNode, text: string) => Array.from(scope.querySelectorAll('button')).find((button) => textOf(button).includes(text)) as HTMLButtonElement | undefined
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
  it('opens a modal dialog labelled by its heading, with a close button, the boxes and the Continue link under them', async () => {
    const { dialog } = await openBoxes({ boxes: [boxOf(), secondBoxOf()] })

    expect(showModal).toHaveBeenCalledTimes(1)
    expect(dialog.hasAttribute('open')).toBe(true)
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby') as string)
    expect(textOf(heading)).toBe('Complete your bundles')
    expect(buttonByText(dialog, 'Close')).toBeDefined()
    expect(boxElements()).toHaveLength(2)
    const link = Array.from(dialog.querySelectorAll('a, button')).find((element) => textOf(element) === 'Continue to checkout') as HTMLElement
    expect(link).toBeDefined()
    expect(dialog.querySelector('[data-box]')!.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('names the heading in the singular for one box', async () => {
    const { dialog } = await openBoxes()

    expect(textOf(document.getElementById(dialog.getAttribute('aria-labelledby') as string))).toBe('Complete your bundle')
  })

  it('moves focus into the dialog, and back to the Checkout button when it closes', async () => {
    const { dialog, opener, promise } = await openBoxes()

    expect(dialog.contains(document.activeElement)).toBe(true)
    await pressAndSettle(buttonByText(dialog, 'Close'))
    await promise
    expect(document.activeElement).toBe(opener)
  })

  it('resolves { action: "close" } for the close button, Escape and a click on the backdrop, and takes the dialog off the page', async () => {
    const byButton = await openBoxes()
    await pressAndSettle(buttonByText(byButton.dialog, 'Close'))
    await expect(byButton.promise).resolves.toEqual({ action: 'close', didAdd: false })
    expect(document.querySelector('dialog')).toBeNull()

    const byEscape = await openBoxes()
    byEscape.dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    await settle()
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

  it('resolves { action: "continue", didAdd: false } for the Continue link when nothing was added', async () => {
    const { dialog, promise } = await openBoxes()

    await pressAndSettle(buttonByText(dialog, 'Continue to checkout') ?? (Array.from(dialog.querySelectorAll('a')).find((link) => textOf(link) === 'Continue to checkout') as HTMLElement))

    await expect(promise).resolves.toEqual({ action: 'continue', didAdd: false })
  })

  it('stops watching the boxes and the clock when it closes', async () => {
    const { dialog, promise } = await openBoxes({ boxes: [boxOf({ flash: { startsAtUnix: NOW_SECONDS - 10, endsAtUnix: NOW_SECONDS + 500 } })] })

    await pressAndSettle(buttonByText(dialog, 'Close'))
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
    expect(Array.from(first.querySelectorAll('[data-chip]')).map(textOf)).toEqual(['1 × £1.69', '3 × £5.07', '8 × £13.04', '16 × £24.80'])
    const rows = Array.from(first.querySelectorAll('[data-item]'))
    expect(rows.map((row) => textOf(row.querySelector('[data-name]')))).toEqual(['Tuna – Small', 'Tuna – Large', 'Salmon'])
    expect(textOf(rows[0].querySelector('[data-price]'))).toBe('£1.69')
    expect(textOf(rows[0].querySelector('[data-count]'))).toBe('3 in cart')
    expect(rows[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/tuna.jpg')
    expect(rows[2].querySelector('img')).toBeNull()
    expect(first.textContent).toContain('⚡ Quick auto-fill: Add 5 more items')
    expect(first.textContent).toContain('(+£8.45)')
    expect(buttonByText(first, 'Add 5 & unlock tier')).toBeDefined()
  })

  it('shows the percentage wording and no chips for a percentage bundle whose items cost different amounts', async () => {
    await openBoxes({ boxes: [secondBoxOf({ basePrice: null })] })
    const [only] = boxElements()

    expect(only.textContent).toContain('Unlock 10% off at 5 units')
    expect(only.textContent).toContain('2 of 5 items selected • Add 3 more to unlock 10% off the whole bundle')
    expect(only.querySelectorAll('[data-chip]')).toHaveLength(0)
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

  it('takes the box off when its countdown reaches zero, and leaves the others and the Continue link', async () => {
    const { dialog } = await openBoxes({ boxes: [boxOf({ flash }), secondBoxOf()] })
    expect(boxElements()).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(3000)

    expect(boxElements().map((element) => textOf(element.querySelector('h3')))).toEqual(['Treats'])
    expect(textOf(dialog)).toContain('Continue to checkout')
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
    expect(Array.from(after.querySelectorAll('[data-chip]')).map(textOf)).toContain('4 × £6.76')
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

  it('adds all the missing units in one request with several items when Quick auto-fill is pressed, and shows "Tier unlocked"', async () => {
    await openBoxes()

    await pressAndSettle(buttonByText(boxElements()[0], 'Add 5 & unlock tier'))

    expect(network.posts).toHaveLength(1)
    const quantity = network.posts[0].body.items.reduce((total, entry) => total + entry.quantity, 0)
    expect(quantity).toBe(5)
    expect(network.posts[0].body.items.length).toBeGreaterThan(1)
    const after = boxElements()[0]
    expect(after.textContent).toContain('Tier unlocked')
    expect(addButtons(after)).toHaveLength(0)
    expect(buttonByText(after, 'unlock tier')).toBeUndefined()
    expect(buttonByText(after, 'Quick-add')).toBeUndefined()
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
    await pressAndSettle(Array.from(dialog.querySelectorAll('a, button')).find((element) => textOf(element) === 'Continue to checkout'))
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

  it('counts an add that is still on its way as an add, for Continue and for Close', async () => {
    for (const [label, action] of [['Continue to checkout', 'continue'], ['Close', 'close']] as const) {
      const opened = await openBoxes()
      const answerRead = fetchMock.getMockImplementation() as (path: string, init?: object) => Promise<unknown>
      fetchMock.mockImplementation((path: string, init?: object) => (/cart\/add\.js$/.test(path) ? new Promise(() => {}) : answerRead(path, init)))
      await pressAndSettle(addButtons(boxElements()[0])[0])

      await pressAndSettle(Array.from(opened.dialog.querySelectorAll('a, button')).find((element) => textOf(element) === label))

      await expect(opened.promise).resolves.toEqual({ action, didAdd: true })
    }
  })

  it('resolves Continue with didAdd true after any successful add, and Close the same way', async () => {
    const continued = await openBoxes()
    await pressAndSettle(addButtons(boxElements()[0])[0])
    await pressAndSettle(Array.from(continued.dialog.querySelectorAll('a, button')).find((element) => textOf(element) === 'Continue to checkout'))
    await expect(continued.promise).resolves.toEqual({ action: 'continue', didAdd: true })

    const closed = await openBoxes()
    await pressAndSettle(addButtons(boxElements()[0])[0])
    await pressAndSettle(buttonByText(closed.dialog, 'Close'))
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

  it('gives each box the look of its own discount: two styles, two backgrounds', async () => {
    await openBoxes({ boxes: [boxOf({ style: { backgroundColor: '#112233', cornerRadius: 8 } }), secondBoxOf({ style: { backgroundColor: '#AABBCC' } })] })
    const [first, second] = boxElements()

    expect(first.style.getPropertyValue('--smooth-discounts-cream')).toBe('#112233')
    expect(first.style.getPropertyValue('--smooth-discounts-radius')).toBe('8px')
    expect(second.style.getPropertyValue('--smooth-discounts-cream')).toBe('#AABBCC')
    expect(second.style.getPropertyValue('--smooth-discounts-radius')).toBe('')
    expect(first.style.getPropertyValue('--smooth-discounts-moss')).toBe('#434625')
    expect(first.style.getPropertyValue('--smooth-discounts-sun')).toBe('#FFDC4C')
  })

  it('falls back to the embed colour for a style that is missing or unsafe', async () => {
    await openBoxes({ boxes: [boxOf({ style: null }), secondBoxOf({ style: { backgroundColor: 'red;}body{display:none', cornerRadius: 99 } })] })

    expect(boxElements().map((element) => element.style.getPropertyValue('--smooth-discounts-cream'))).toEqual(['#F3ECD9', '#F3ECD9'])
    expect(boxElements()[1].style.getPropertyValue('--smooth-discounts-radius')).toBe('')
  })

  it('writes every amount in the money format it was given', async () => {
    await openBoxes({ moneyFormat: '{{amount}} €' })
    const first = boxElements()[0]

    expect(first.textContent).toContain('1.63 €/ea')
    expect(textOf(first.querySelector('[data-price]'))).toBe('1.69 €')
    expect(first.textContent).toContain('(+8.45 €)')
  })

  it('shows what the shop sends as text, never as markup', async () => {
    await openBoxes({ boxes: [boxOf({ title: '<img src=x onerror=alert(1)>', items: [itemOf(11, 100, '<b>Tuna</b>')] })] })

    expect(boxElements()[0].querySelector('h3 img')).toBeNull()
    expect(textOf(boxElements()[0].querySelector('h3'))).toBe('<img src=x onerror=alert(1)>')
    expect(boxElements()[0].querySelector('[data-name] b')).toBeNull()
  })
})
