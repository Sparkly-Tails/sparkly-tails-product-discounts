import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

// Like the homepage tokens, the form tokens only reach the live page when the
// stylesheet that imports Tailwind also imports them.
describe('the app stylesheet carries the form tokens', () => {
  let css = ''

  beforeAll(async () => {
    const stylesheet = path.join(process.cwd(), 'src/app/globals.css')
    const source = fs.readFileSync(stylesheet, 'utf8') + '\n@source inline("bg-form-surface-container-lowest border-form-outline-variant/20 text-form-on-surface-variant gap-form-lg p-form-md text-form-headline-lg text-form-label-sm");\n'
    const result = await postcss([tailwind()]).process(source, { from: stylesheet })
    css = result.css
  }, 60000)

  it.each([
    '.bg-form-surface-container-lowest',
    '.text-form-on-surface-variant',
    '.gap-form-lg',
    '.p-form-md',
    '.text-form-headline-lg',
  ])('generates the utility %s', (selector) => {
    expect(css).toContain(selector)
  })

  it('defines the form colours from the design', () => {
    expect(css).toContain('--color-form-surface: #f9f9f9')
    expect(css).toContain('--color-form-secondary: #0055c7')
  })

  it('carries the storefront widget stylesheet, which the form preview paints with', () => {
    expect(css).toContain('.sparkly-tier-pricing__flash')
    expect(css).toContain('.sparkly-tier-pricing__chip')
  })

  it('gives a text size its line height and weight', () => {
    expect(css).toContain('--text-form-headline-lg--line-height: 36px')
    expect(css).toContain('--text-form-headline-lg--font-weight: 600')
    expect(css).toMatch(/\.text-form-headline-lg\s*\{[^}]*var\(--text-form-headline-lg--line-height\)/)
  })
})
