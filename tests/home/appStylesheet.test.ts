import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

// The homepage styles only exist on the live page if the stylesheet that imports
// Tailwind also imports the homepage tokens: a second stylesheet with its own
// @theme is not seen by Tailwind, and every home-* colour utility is then left
// out (black borders, no backgrounds, invisible button text).
describe('the app stylesheet', () => {
  let css = ''

  beforeAll(async () => {
    const stylesheet = path.join(process.cwd(), 'src/app/globals.css')
    const result = await postcss([tailwind()]).process(fs.readFileSync(stylesheet, 'utf8'), { from: stylesheet })
    css = result.css
  }, 60000)

  it.each([
    '.bg-home-surface',
    '.bg-home-surface-container-lowest',
    '.bg-home-primary-container',
    '.text-home-on-surface',
    '.border-home-outline-variant',
    '.font-home',
  ])('generates the utility %s', (selector) => {
    expect(css).toContain(selector)
  })

  it('defines the homepage colours and the font', () => {
    expect(css).toContain('--color-home-surface: #fbf9f4')
    expect(css).toContain('--color-home-primary: #173028')
  })

  it('still generates the utilities of the other pages', () => {
    expect(css).toContain('.bg-accent')
    expect(css).toContain('.border-line')
  })
})
