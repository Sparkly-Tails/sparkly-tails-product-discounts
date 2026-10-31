import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EXTENSION_SCRIPTS, EXTENSION_SCRIPT_BYTE_LIMIT, EXTENSION_STYLESHEETS } from '../../scripts/extensionFiles.mjs'

/** What the Liquid blocks, the entry files and the build list must agree on. */
const EXTENSION = path.resolve(__dirname, '../../extensions/product-tier-pricing')
const read = (file: string) => fs.readFileSync(path.join(EXTENSION, file), 'utf8')

const COMPONENTS: Record<string, string> = {
  model: 'tier-pricing-model.js',
  paint: 'tier-pricing-paint.js',
  flash: 'tier-pricing-flash.js',
  timeSale: 'tier-pricing-time-sale.js',
  siblings: 'tier-pricing-siblings.js',
}

describe('the extension build list', () => {
  const scriptNames = EXTENSION_SCRIPTS.map((script: { name: string }) => script.name)

  it('builds exactly the scripts and stylesheets the blocks and the core script use', () => {
    expect(scriptNames.sort()).toEqual(['tier-pricing-flash.js', 'tier-pricing-model.js', 'tier-pricing-paint.js', 'tier-pricing-siblings.js', 'tier-pricing-time-sale.js', 'tier-pricing.js', 'time-based-discount.js'])
    expect(EXTENSION_STYLESHEETS.map((sheet: { name: string }) => sheet.name).sort()).toEqual(['tier-pricing.css', 'time-based-discount.css'])
  })

  it('keeps Shopify\'s limit of 10,000 bytes for a script', () => {
    expect(EXTENSION_SCRIPT_BYTE_LIMIT).toBe(10_000)
  })

  it('has a source file for every entry', () => {
    for (const file of [...EXTENSION_SCRIPTS, ...EXTENSION_STYLESHEETS]) expect(fs.existsSync(path.join(EXTENSION, 'src', file.entry))).toBe(true)
  })

  it('has each block name a script and a stylesheet that the build produces', () => {
    for (const block of ['blocks/tier-pricing.liquid', 'blocks/time-based-discount.liquid']) {
      const schema = JSON.parse(read(block).split('{% schema %}')[1].split('{% endschema %}')[0])
      expect(scriptNames).toContain(schema.javascript)
      expect(EXTENSION_STYLESHEETS.map((sheet: { name: string }) => sheet.name)).toContain(schema.stylesheet)
    }
  })
})

describe('the tier block and the components', () => {
  const block = read('blocks/tier-pricing.liquid')

  it('hands the core script the address of every component, under the name the core asks for', () => {
    for (const [name, file] of Object.entries(COMPONENTS)) expect(block).toContain(`"${name}": {{ '${file}' | asset_url | json }}`)
    expect(block).toContain("data-component-urls='{{ component_urls_json }}'")
  })

  it('preloads the parts every page needs', () => {
    expect(block).toContain("{{ 'tier-pricing-model.js' | asset_url | preload_tag: as: 'script' }}")
    expect(block).toContain("{{ 'tier-pricing-paint.js' | asset_url | preload_tag: as: 'script' }}")
  })

  it('has each component\'s entry register it under that same name', () => {
    for (const [name, file] of Object.entries(COMPONENTS)) {
      const entry = EXTENSION_SCRIPTS.find((script: { name: string }) => script.name === file)
      expect(read(`src/${entry?.entry}`)).toContain(`name: '${name}'`)
    }
  })
})

describe('what is uploaded to Shopify', () => {
  it('leaves the readable source out: only the built files in assets/ go up', () => {
    expect(read('.shopifyignore')).toMatch(/^src\/\*\*$/m)
  })
})
