import { describe, it, expect } from 'vitest'
import { pickPreviewPrice } from '@/form/preview/pickPreviewPrice'

describe('pickPreviewPrice', () => {
  it('gives the plain and the discounted price the widget decided for the chosen quantity', () => {
    expect(pickPreviewPrice({ viewModel: { plainPrice: '$28.00', discountedPrice: '$25.20' }, placeholder: '$0.00' })).toEqual({ plainPrice: '$28.00', discountedPrice: '$25.20', isPlaceholder: false })
  })

  it('gives the plain price alone while no tier applies', () => {
    expect(pickPreviewPrice({ viewModel: { plainPrice: '$28.00', discountedPrice: null }, placeholder: '$0.00' })).toEqual({ plainPrice: '$28.00', discountedPrice: null, isPlaceholder: false })
  })

  it('gives the placeholder, marked as one, when there is no product', () => {
    expect(pickPreviewPrice({ viewModel: null, placeholder: '£0.00' })).toEqual({ plainPrice: '£0.00', discountedPrice: null, isPlaceholder: true })
  })
})
