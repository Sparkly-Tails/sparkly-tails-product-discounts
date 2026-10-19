import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function files(directory: string): string[] {
  if (!existsSync(join(root, directory))) return []
  return readdirSync(join(root, directory)).flatMap((name) => {
    const relative = join(directory, name)
    if (name === 'node_modules') return []
    return statSync(join(root, relative)).isDirectory() ? files(relative) : [relative]
  })
}

describe('one app, many stores', () => {
  it('no file under src/ or scripts/ mentions SHOPIFY_SHOP', () => {
    const offenders = [...files('src'), ...files('scripts')].filter((path) => readFileSync(join(root, path), 'utf8').includes('SHOPIFY_SHOP'))
    expect(offenders).toEqual([])
  })
})
