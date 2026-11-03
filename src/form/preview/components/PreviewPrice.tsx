const TONES: Record<string, string> = { true: 'text-form-outline', false: 'text-form-on-surface' }

function Price({ text, isPlaceholder }: { text: string; isPlaceholder: boolean }) {
  return <span className={`text-form-headline-md font-semibold ${TONES[String(isPlaceholder)]}`}>{text}</span>
}

// The price once a tier applies: the regular price struck through, then the sale price.
function SalePrice({ plainPrice, discountedPrice }: { plainPrice: string; discountedPrice: string }) {
  return (
    <>
      <span className="sr-only">Regular price</span>
      <s className="text-form-body-md text-form-on-surface-variant">{plainPrice}</s>
      <span className="sr-only">Sale price</span>
      <Price text={discountedPrice} isPlaceholder={false} />
    </>
  )
}

// The price box of the preview, above the widget, as a theme shows a product's price: the regular price alone, or struck
// through next to the sale price once a tier applies. The box has the same height with or without a product (with none it
// shows a price of zero), so the preview does not jump when a product is added.
export default function PreviewPrice({ plainPrice, discountedPrice, isPlaceholder }: { plainPrice: string; discountedPrice: string | null; isPlaceholder: boolean }) {
  return (
    <div data-testid="preview-price" data-placeholder={isPlaceholder} className="h-9 flex items-baseline gap-2 overflow-hidden">
      {discountedPrice === null
        ? <Price text={plainPrice} isPlaceholder={isPlaceholder} />
        : <SalePrice plainPrice={plainPrice} discountedPrice={discountedPrice} />}
    </div>
  )
}
