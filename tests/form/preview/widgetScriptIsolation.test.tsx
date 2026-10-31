// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import WidgetView from '@/form/preview/components/WidgetView'
import { buildPreviewModel } from '@/form/preview/buildPreviewModel'
import { PREVIEW_TOOLS } from '@/form/preview/previewTools'
import { WIDGET_FUNCTIONS } from '@/form/preview/widgetFunctions'
import { readBuiltWidget, runWidgetScripts } from '../../helpers/builtWidget'

/**
 * The admin imports the storefront widget script for its functions, and that script also starts itself
 * when it loads: it scans the page for [data-sparkly-tier-pricing] and reads the Shopify block's data
 * attributes from each hit. The preview's markup must therefore never carry that marker, or the admin
 * page dies with `"undefined" is not valid JSON` as soon as it loads with a product in the preview.
 */
const built = readBuiltWidget()

function renderPreviewMarkup(): string {
  const { viewModel } = buildPreviewModel({
    products: [{ title: 'Tuna Soup', price: 20, imageUrl: null }], selectedIndex: 0, tiers: [{ minQty: 5, percentOff: 10 }], flash: null,
    highDemand: false, quantity: 1, timeZone: 'UTC', nowSeconds: 1_800_000_000, formatMoney: (amount) => WIDGET_FUNCTIONS.formatMoney(amount, '${{amount}}'), tools: PREVIEW_TOOLS,
  })
  return renderToString(<WidgetView viewModel={viewModel!} hasTiers onPickQuantity={() => {}} />)
}

afterEach(() => { document.body.innerHTML = ''; vi.clearAllTimers(); vi.useRealTimers() })

describe('the preview next to the storefront script', () => {
  it('does not carry the marker the script scans for', () => {
    expect(renderPreviewMarkup()).not.toContain('data-sparkly-tier-pricing')
  })

  it('lets the script load on a page whose server markup already holds the preview', () => {
    document.body.innerHTML = renderPreviewMarkup()
    expect(() => runWidgetScripts({ built })).not.toThrow()
  })

  it('still looks like the widget (the stylesheet and the painted parts are all there)', () => {
    document.body.innerHTML = renderPreviewMarkup()
    expect(document.querySelector('.sparkly-tier-pricing.sparkly-tier-pricing--card')).not.toBeNull()
    expect(document.querySelector('[data-tier-pricing-price]')).toHaveProperty('textContent')
  })
})
