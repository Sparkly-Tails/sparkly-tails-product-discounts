import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/** `shopify app deploy` bundles each extension on its own, so an extension's own dependencies must be installed first. */
const ROOT = path.resolve(__dirname, '../..')
const DEPLOY_SCRIPTS = ['deploy:dev', 'deploy:prod']

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
const listExtensionsWithDependencies = (): string[] =>
  fs
    .readdirSync(path.join(ROOT, 'extensions'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'extensions', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .filter((name) => Object.keys(readJson(`extensions/${name}/package.json`).dependencies ?? {}).length > 0)

const extensionNames = listExtensionsWithDependencies()
const scripts: Record<string, string> = readJson('package.json').scripts

describe('extensions with their own dependencies', () => {
  it('finds the metrics pixel', () => {
    expect(extensionNames).toContain('metrics-pixel')
  })

  describe.each(extensionNames)('%s', (name) => {
    it('has a lockfile, so the install is repeatable', () => {
      expect(fs.existsSync(path.join(ROOT, 'extensions', name, 'package-lock.json'))).toBe(true)
    })

    it.each(DEPLOY_SCRIPTS)('is installed by %s before the app is deployed', (scriptName) => {
      const script = scripts[scriptName]
      const installAt = script.indexOf(`npm ci --prefix extensions/${name}`)
      expect(installAt).toBeGreaterThanOrEqual(0)
      expect(installAt).toBeLessThan(script.indexOf('shopify app deploy'))
    })
  })
})
