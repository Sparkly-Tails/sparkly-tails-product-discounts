// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { findComponent, loadComponent, registerComponent } from '../../extensions/product-tier-pricing/src/loader/registry.js'
import { isTimeSaleData, listNeededComponents, loadComponentSet, parseComponentUrls } from '../../extensions/product-tier-pricing/src/loader/components.js'

/** One page: a shared object standing in for the window, and the test's own document for the script tags. */
let root: Record<string, unknown>

beforeEach(() => { root = {} })
afterEach(() => { document.head.innerHTML = '' })

const scriptsOnPage = () => Array.from(document.head.querySelectorAll('script')) as HTMLScriptElement[]

describe('registerComponent and findComponent', () => {
  it('finds nothing before a component registers, and its functions after', () => {
    const api = { paint: () => 'painted' }
    expect(findComponent({ root, name: 'paint' })).toBeNull()

    registerComponent({ root, name: 'paint', api })

    expect(findComponent({ root, name: 'paint' })).toBe(api)
    expect(findComponent({ root, name: 'model' })).toBeNull()
  })

  it('keeps the registry on the page object under one name, so every script of the widget shares it', () => {
    registerComponent({ root, name: 'paint', api: {} })

    expect(Object.keys(root)).toEqual(['SparklyTierPricing'])
  })
})

describe('loadComponent', () => {
  it('resolves at once, without adding a script, for a component that already registered', async () => {
    const api = { paint: () => 'painted' }
    registerComponent({ root, name: 'paint', api })

    await expect(loadComponent({ root, document, name: 'paint', url: 'https://cdn.example/paint.js' })).resolves.toBe(api)
    expect(scriptsOnPage()).toHaveLength(0)
  })

  it('adds one script with the address, and resolves when the component registers', async () => {
    const api = { siblings: true }
    const loading = loadComponent({ root, document, name: 'siblings', url: 'https://cdn.example/siblings.js' })

    expect(scriptsOnPage().map((script) => script.src)).toEqual(['https://cdn.example/siblings.js'])
    registerComponent({ root, name: 'siblings', api })

    await expect(loading).resolves.toBe(api)
  })

  it('adds the script once however many widgets ask, and answers each of them', async () => {
    const first = loadComponent({ root, document, name: 'flash', url: 'https://cdn.example/flash.js' })
    const second = loadComponent({ root, document, name: 'flash', url: 'https://cdn.example/flash.js' })
    const api = { flash: true }

    registerComponent({ root, name: 'flash', api })

    expect(scriptsOnPage()).toHaveLength(1)
    await expect(Promise.all([first, second])).resolves.toEqual([api, api])
  })

  it('rejects when the script cannot be loaded', async () => {
    const loading = loadComponent({ root, document, name: 'flash', url: 'https://cdn.example/flash.js' })

    scriptsOnPage()[0].dispatchEvent(new Event('error'))

    await expect(loading).rejects.toBeDefined()
  })

  it('tries again with a new script when the next request comes after a failed load', async () => {
    const failed = loadComponent({ root, document, name: 'siblings', url: 'https://cdn.example/siblings.js' })
    scriptsOnPage()[0].dispatchEvent(new Event('error'))
    await expect(failed).rejects.toBeDefined()

    const again = loadComponent({ root, document, name: 'siblings', url: 'https://cdn.example/siblings.js' })
    const api = { siblings: true }
    registerComponent({ root, name: 'siblings', api })

    expect(scriptsOnPage()).toHaveLength(2)
    await expect(again).resolves.toBe(api)
  })

  it('rejects without adding a script when the block gave no address', async () => {
    await expect(loadComponent({ root, document, name: 'flash', url: undefined })).rejects.toThrow('No address')
    expect(scriptsOnPage()).toHaveLength(0)
  })
})

describe('what a widget needs', () => {
  it('always needs the model and the paint, the flash sale and the time-based sale only when it has one', () => {
    expect(listNeededComponents({ hasFlash: false, hasTimeSale: false })).toEqual(['model', 'paint'])
    expect(listNeededComponents({ hasFlash: true, hasTimeSale: false })).toEqual(['model', 'paint', 'flash'])
    expect(listNeededComponents({ hasFlash: false, hasTimeSale: true })).toEqual(['model', 'paint', 'timeSale'])
    expect(listNeededComponents({ hasFlash: true, hasTimeSale: true })).toEqual(['model', 'paint', 'flash', 'timeSale'])
  })

  it('reads the addresses the block wrote, and none when they are missing or broken', () => {
    expect(parseComponentUrls('{"model":"https://cdn.example/model.js"}')).toEqual({ model: 'https://cdn.example/model.js' })
    expect(parseComponentUrls(undefined)).toEqual({})
    expect(parseComponentUrls('not json')).toEqual({})
  })

  it('sees a time-based discount in the block data, and none in the empty object the block writes', () => {
    expect(isTimeSaleData('{"startsAt":"2026-10-05T12:00:00.000Z"}')).toBe(true)
    expect(isTimeSaleData('{}')).toBe(false)
    expect(isTimeSaleData('')).toBe(false)
    expect(isTimeSaleData(undefined)).toBe(false)
  })
})

describe('loadComponentSet', () => {
  it('starts every load before waiting for any, and resolves with the functions by name', async () => {
    const started: string[] = []
    const apis: Record<string, { name: string }> = { model: { name: 'm' }, paint: { name: 'p' } }
    const loadOne = (name: string) => { started.push(name); return Promise.resolve(apis[name]) }

    const set = loadComponentSet({ names: ['model', 'paint'], loadOne })

    expect(started).toEqual(['model', 'paint'])
    await expect(set).resolves.toEqual({ model: { name: 'm' }, paint: { name: 'p' } })
  })

  it('rejects when one of the loads fails', async () => {
    const loadOne = (name: string) => (name === 'paint' ? Promise.reject(new Error('offline')) : Promise.resolve({}))

    await expect(loadComponentSet({ names: ['model', 'paint'], loadOne })).rejects.toThrow('offline')
  })
})
