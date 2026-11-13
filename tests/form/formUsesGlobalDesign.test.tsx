// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import TierDiscountForm from '@/form/components/TierDiscountForm'
import type { FormValues } from '@/form/formValues'
import { stubChipLayout } from '../helpers/chipLayout'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/actions/memberPickerActions', () => ({
  searchProductsAction: vi.fn(async () => []),
  listProductsAction: vi.fn(async () => []),
  getProductVariantsAction: vi.fn(async () => []),
  validateMemberAction: vi.fn(async () => ({ ok: true })),
}))

const NOW = 1_800_000_000
const SALMON = { productId: 'p1', variantId: 'v1', productTitle: 'Salmon Oil', variantTitle: '16 fl oz', price: 28, imageUrl: null }
const SAVED: FormValues = {
  name: 'Salmon Oil Volume Discount',
  title: 'Salmon Oil bundle',
  members: [SALMON],
  pricingMode: 'percent',
  tiers: [{ minQty: 3, percentOff: 10 }],
  flash: { enabled: false, startsAt: '', endsAt: '', showTeaser: true, highDemand: false },
}
const DESIGN = { accentColor: '#112233', backgroundColor: '#FFFFFF', cornerRadius: 8, flashTone: 'deep-pine' as const }

function renderForm() {
  const saveAction = vi.fn(async () => null)
  const view = render(
    <TierDiscountForm
      breadcrumbLabel="Edit Discount" heading="Salmon Oil Volume Discount" badge="Draft" mode="edit" status="draft"
      initial={SAVED} initialTiers={{ mode: 'percent', percentTiers: [{ minQty: 3, percentOff: 10 }], fixedTiers: [] }}
      currencyCode="USD" shopTimezone="UTC" nowLocal="2026-10-30T12:00" initialNowSeconds={NOW}
      design={DESIGN} saveAction={saveAction}
    />,
  )
  return { saveAction, ...view }
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW * 1000 })
  stubChipLayout({ chipWidth: 100, viewWidth: 400 })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('the discount form uses the store-wide design', () => {
  it('has no Design card and no field for the background, the corner radius or the pop-up frequency', () => {
    renderForm()
    expect(screen.queryByRole('heading', { level: 2, name: 'Design' })).toBeNull()
    for (const name of ['backgroundColor', 'cornerRadius', 'popupFrequency', 'style-backgroundColor', 'style-cornerRadius']) {
      expect(document.querySelector(`[name="${name}"]`)).toBeNull()
    }
    expect(screen.queryByLabelText('Show the pop-up')).toBeNull()
  })

  it('paints the preview with the design the page passes', () => {
    renderForm()
    const widget = document.querySelector('.smooth-discounts') as HTMLElement
    expect(widget.style.getPropertyValue('--smooth-discounts-moss')).toBe('#112233')
    expect(widget.style.getPropertyValue('--smooth-discounts-cream')).toBe('#FFFFFF')
    expect(widget.style.getPropertyValue('--smooth-discounts-radius')).toBe('8px')
    expect(widget.style.getPropertyValue('--smooth-discounts-flash-dark')).toBe('#1B3A2D')
  })

  it('sends no style and no pop-up frequency when it saves', async () => {
    const { saveAction } = renderForm()
    await act(async () => { (document.querySelector('form') as HTMLFormElement).requestSubmit() })
    const formData = (saveAction.mock.calls[0] as unknown as [unknown, FormData])[1]
    const sent = [...formData.keys()]
    expect(sent.filter((key) => key.startsWith('style') || key === 'popupFrequency')).toEqual([])
    expect(formData.get('name')).toBe('Salmon Oil Volume Discount')
  })
})
