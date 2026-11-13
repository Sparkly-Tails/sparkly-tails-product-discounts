import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const WIDTH_CLASS = /max-w-\[(\d+)px\]/

function readPageWidth(path: string): string {
  const match = readFileSync(path, 'utf8').match(WIDTH_CLASS)
  return match ? match[1] : 'none'
}

describe('page width', () => {
  it('is the same on the homepage and on the pages built on the form frame (Settings, Create, Edit), whatever their columns', () => {
    const homeWidth = readPageWidth('src/home/components/HomeView.tsx')
    expect(homeWidth).toBe('1024')
    expect(readPageWidth('src/form/components/FormPage.tsx')).toBe(homeWidth)
  })

  it('is the same in the homepage footer', () => {
    expect(readPageWidth('src/home/components/HomeFooter.tsx')).toBe('1024')
  })
})
