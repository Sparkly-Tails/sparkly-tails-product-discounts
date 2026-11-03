import { vi } from 'vitest'

/**
 * Gives the tier row a layout jsdom does not have: the row (`[data-tier-pricing-tiers]`) is `viewWidth` wide at the left
 * edge of the page and its boxes are `chipWidth` wide, one after the other, shifted left by how far the row is scrolled.
 */
export function stubChipLayout({ chipWidth, viewWidth }: { chipWidth: number; viewWidth: number }): void {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-tier-pricing-tiers') ? viewWidth : 0
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const row = this.closest('[data-tier-pricing-tiers]') as HTMLElement | null
    const isRow = this.hasAttribute('data-tier-pricing-tiers')
    const scrolled = row ? row.scrollLeft : 0
    const index = !isRow && row ? Array.from(row.children).indexOf(this) : 0
    const left = isRow ? 0 : index * chipWidth - scrolled
    return { left, right: left + (isRow ? viewWidth : chipWidth), width: isRow ? viewWidth : chipWidth, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect
  })
}
