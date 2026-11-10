import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readBuiltWidget } from '../helpers/builtWidget'

/** The pop-up's stylesheet: a rule for every class the view writes, the widget's own custom properties with their defaults, nothing from outside, narrow screens and reduced motion. */
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
    expect(css).toMatch(/var\(--smooth-discounts-moss,\s*#434625\)/i)
    expect(css).toMatch(/var\(--smooth-discounts-sun,\s*#ffdc4c\)/i)
    expect(css).toMatch(/var\(--smooth-discounts-radius,\s*16px\)/i)
  })

  it('loads nothing from outside and keeps the theme\'s fonts', () => {
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//)
    for (const match of css.matchAll(/font-family:\s*([^;}]+)/g)) expect(match[1].trim()).toBe('inherit')
  })

  it('makes the dialog fill the width on a narrow screen', () => {
    const start = css.search(/@media\s*\(max-width:\s*480px\)/)
    expect(start).toBeGreaterThan(-1)
    expect(css.slice(start)).toMatch(/\.smooth-discounts-popup__dialog\s*\{[^}]*width:\s*100%/)
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
