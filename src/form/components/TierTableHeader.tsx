// The column names above the tier rows. An empty label leaves its column blank.
export default function TierTableHeader({ discountLabel, anchorLabel }: { discountLabel: string; anchorLabel: string }) {
  return (
    <div className="grid grid-cols-12 gap-form-sm px-3 py-2 text-form-label-sm text-form-on-surface-variant font-medium">
      <span className="col-span-3">Minimum quantity</span>
      <span className="col-span-4">{discountLabel}</span>
      <span className="col-span-3">{anchorLabel}</span>
      <span className="col-span-2 text-right">Action</span>
    </div>
  )
}
