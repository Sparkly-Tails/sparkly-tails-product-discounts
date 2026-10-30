// Why Fixed price is off: it needs every product to cost the same.
export default function PercentOnlyNote({ isShown }: { isShown: boolean }) {
  if (!isShown) return null
  return <p className="text-form-body-sm text-form-on-surface-variant">These products/variants have different prices, so only a percentage discount is available.</p>
}
