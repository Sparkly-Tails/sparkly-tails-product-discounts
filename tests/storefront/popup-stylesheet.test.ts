import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readBuiltWidget } from '../helpers/builtWidget'

/** The pop-up's stylesheet: a rule for every class the view writes, the widget's own custom properties with their defaults, nothing from outside, a dialog 1000px wide, the whole screen on a phone, and reduced motion. */
const SOURCE = path.resolve(__dirname, '../../extensions/product-tier-pricing/src/popup')
/** The stylesheet with every run of white space made one space, so the checks do not depend on how it is laid out. */
const css = readBuiltWidget()['bundle-popup.css'].replace(/\s+/g, ' ')
const PREFIX = 'smooth-discounts-popup__'

/** The class names the view writes: every `name: 'x'` of a node description in box.js, parts.js and shell.js, plus the box element's own class. */
const writtenNames = (): string[] => {
  const found = new Set<string>(['box'])
  for (const file of ['box.js', 'parts.js', 'shell.js']) {
    for (const match of fs.readFileSync(path.join(SOURCE, file), 'utf8').matchAll(/\bname: '([a-z-]+)'/g)) found.add(match[1])
  }
  return [...found]
}

describe('the classes the view writes', () => {
  it('finds the classes it checks (so this test cannot pass by finding none)', () => {
    expect(writtenNames()).toEqual(expect.arrayContaining(['dialog', 'box', 'chip', 'item', 'flash', 'error', 'continue', 'quick-add']))
  })

  it('has a rule for each of them', () => {
    for (const name of writtenNames()) expect(css, name).toContain('.' + PREFIX + name)
  })

  it('tells an expanded box from a contracted one by its data-expanded attribute', () => {
    expect(css).toMatch(/\.smooth-discounts-popup__box\[data-expanded=["']?true/)
    expect(css).toMatch(/\.smooth-discounts-popup__box\[data-expanded=["']?false/)
  })
})

describe('the look', () => {
  it('uses the widget\'s custom properties with the widget\'s defaults', () => {
    expect(css).toMatch(/var\(--smooth-discounts-cream,\s*#f3ecd9\)/i)
    expect(css).toMatch(/var\(--smooth-discounts-moss,\s*#2c3822\)/i)
    expect(css).toMatch(/var\(--smooth-discounts-sun,\s*#eae3d2\)/i)
    expect(css).toMatch(/var\(--smooth-discounts-radius,\s*16px\)/i)
  })

  it('loads nothing from outside, keeps the theme\'s font for the text, and uses only system fonts for the headings and the countdown', () => {
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//)
    const serif = 'var(--popup-serif)'
    const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    for (const match of css.matchAll(/font-family:\s*([^;}]+)/g)) expect(['inherit', serif, mono.replace(/ /g, '')]).toContain(match[1].trim().replace(/ /g, ''))
    expect(css).toMatch(/--popup-serif:\s*Georgia, "Times New Roman", serif;/)
  })

  it('lets each bundle\'s own colour reach its box, by declaring the colour aliases on the box as well as on the dialog', () => {
    expect(css).toMatch(/\.smooth-discounts-popup__box[^{]*\{[^}]*--popup-cream:\s*var\(--smooth-discounts-cream,\s*#f3ecd9\)/)
    expect(css).toMatch(/\.smooth-discounts-popup__box[^{]*\{[^}]*--popup-sand:/)
  })

  it('paints the list of items in the bundle\'s own colour, 70% lighter, and a hovered row 30% lighter', () => {
    expect(css).toMatch(/\.smooth-discounts-popup__items\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--popup-cream\) 30%,\s*#fff\)/)
    expect(css).toMatch(/\.smooth-discounts-popup__item:hover\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--popup-cream\) 70%,\s*#fff\)/)
  })

  it('keeps the cream panel of an expanded box as tall as its content, not stretched by the full-row basis meant for a contracted box', () => {
    expect(css).toMatch(/\.smooth-discounts-popup__box\[data-expanded=["']?true["']?\]\s+\.smooth-discounts-popup__summary\s*\{[^}]*flex:\s*none/)
  })

  it('is 1000px wide on a wide screen, and never wider than the screen', () => {
    expect(css).toMatch(/\.smooth-discounts-popup__dialog\s*\{[^}]*\bwidth:\s*1000px/)
    expect(css).toMatch(/\.smooth-discounts-popup__dialog\s*\{[^}]*max-width:\s*calc\(100% - 2rem\)/)
  })

  it('makes the dialog the whole screen on a phone', () => {
    const start = css.search(/@media\s*\(max-width:\s*640px\)/)
    expect(start).toBeGreaterThan(-1)
    const phone = css.slice(start)
    expect(phone).toMatch(/\.smooth-discounts-popup__dialog\s*\{[^}]*width:\s*100%/)
    expect(phone).toMatch(/\.smooth-discounts-popup__dialog\s*\{[^}]*height:\s*100dvh/)
    expect(phone).toMatch(/\.smooth-discounts-popup__dialog\s*\{[^}]*border-radius:\s*0/)
  })

  it('keeps the milestones of the rail in one row on a phone, each taking an equal share and letting its caption wrap', () => {
    const phone = css.slice(css.search(/@media\s*\(max-width:\s*640px\)/))
    expect(phone).toMatch(/\.smooth-discounts-popup__milestones\s*\{[^}]*flex-wrap:\s*nowrap/)
    expect(phone).toMatch(/\.smooth-discounts-popup__milestone\s*\{[^}]*flex:\s*1 1 0/)
  })

  it('keeps a box from shrinking inside the scrolling list, so the list scrolls instead of the box clipping its items', () => {
    expect(css).toMatch(/\.smooth-discounts-popup__box\s*\{[^}]*flex:\s*none/)
  })

  it('turns animation off for people who ask for reduced motion', () => {
    const start = css.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(start).toBeGreaterThan(-1)
    expect(css.slice(start)).toMatch(/animation:\s*none|transition:\s*none|animation-duration:\s*0/)
  })

  it('keeps the page from scrolling behind the open dialog', () => {
    expect(css).toMatch(/overflow:\s*hidden/)
  })
})
