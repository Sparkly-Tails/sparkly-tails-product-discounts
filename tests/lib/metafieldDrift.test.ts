import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const FUNCTION_QUERIES = [
  { path: 'extensions/product-discount/src/cart_lines_discounts_generate_run.graphql', key: METAFIELD_KEYS.tierConfig },
  { path: 'extensions/time-based-discount/src/cart_lines_discounts_generate_run.graphql', key: METAFIELD_KEYS.timeFunctionConfig },
]

const liquidRead = (key: string) => `product.metafields['${METAFIELD_NAMESPACE}'].${key}`

const LIQUID_READERS = [
  { path: 'extensions/product-tier-pricing/blocks/tier-pricing.liquid', keys: [METAFIELD_KEYS.tierDiscount, METAFIELD_KEYS.tierSiblingProducts, METAFIELD_KEYS.tierSiblingVariants, METAFIELD_KEYS.timeDiscount] },
  { path: 'extensions/product-tier-pricing/blocks/time-based-discount.liquid', keys: [METAFIELD_KEYS.timeDiscount] },
  { path: 'extensions/product-tier-pricing/snippets/product-card-with-discount.liquid', keys: [METAFIELD_KEYS.timeDiscount] },
]

const OLD_NAMESPACES = ['sparkly_product_discounts', 'sparkly_time_discounts', 'sparkly_tiers']
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.liquid', '.graphql', '.rs', '.toml']
const SKIPPED_DIRECTORIES = ['node_modules', 'target', 'dist', '.next']

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const relative = join(directory, name)
    if (SKIPPED_DIRECTORIES.includes(name)) return []
    if (statSync(join(root, relative)).isDirectory()) return sourceFiles(relative)
    return SCANNED_EXTENSIONS.includes(extname(name)) && !name.includes('.test.') ? [relative] : []
  })
}

describe('metafield readers match the names module', () => {
  it('every reader contains the namespace and its key from the names module', () => {
    for (const { path, key } of FUNCTION_QUERIES) {
      expect(read(path), path).toContain(`metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${key}")`)
    }
    for (const { path, keys } of LIQUID_READERS) {
      for (const key of keys) expect(read(path), `${path} reads ${key}`).toContain(liquidRead(key))
    }
  })

  it('no source file still mentions an old namespace', () => {
    const offenders = [...sourceFiles('src'), ...sourceFiles('extensions')].filter((path) => {
      const text = read(path)
      return OLD_NAMESPACES.some((old) => text.includes(old))
    })
    expect(offenders).toEqual([])
  })
})
