import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// next/font/google fetches the font while Next builds, and Turbopack could not resolve it on Vercel
// ("Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'",
// https://github.com/vercel/next.js/discussions/61886). The fonts are linked from Google Fonts instead.
function listSources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSources(full)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [full] : []
  })
}

describe('the typeface', () => {
  it('is not loaded through next/font anywhere in the app', () => {
    const offenders = listSources(path.join(process.cwd(), 'src')).filter((file) => /next\/font/.test(fs.readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
