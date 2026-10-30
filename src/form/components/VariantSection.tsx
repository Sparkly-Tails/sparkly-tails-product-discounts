import VariantList from '@/form/components/VariantList'
import { isMemberSelected, keepUnselectedVariants, type SelectedMember } from '@/form/memberSelection'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

// The variants of the product being expanded that are still to choose; nothing
// when no product is open or every variant is chosen.
export default function VariantSection({ expanding, variants, members, currencyCode, onPick, onDone }: {
  expanding: ProductSearchResult | null
  variants: ProductVariantOption[]
  members: SelectedMember[]
  currencyCode: string
  onPick: (option: ProductVariantOption) => void
  onDone: () => void
}) {
  if (!expanding) return null
  const options = keepUnselectedVariants({ options: variants, members, productId: expanding.id, tools: { isMemberSelected } })
  if (options.length === 0) return null
  return <VariantList productTitle={expanding.title} options={options} currencyCode={currencyCode} onPick={onPick} onDone={onDone} />
}
