'use client'

import { useEffect, useState } from 'react'
import { getProductVariantsAction, listProductsAction, searchProductsAction, validateMemberAction } from '@/actions/memberPickerActions'
import Card from '@/form/components/Card'
import ProductSearch from '@/form/components/ProductSearch'
import SelectedProducts from '@/form/components/SelectedProducts'
import { addMemberOnce, describeProductCount, removeProductMembers, type SelectedMember } from '@/form/memberSelection'

// How long after the last keystroke the search starts.
const SEARCH_DELAY_MS = 300

// The "Products & variants" card: what is chosen, and the search to choose more.
// Every change is reported with all the chosen members.
export default function ProductsCard({ initialMembers, currencyCode, excludeDiscountId, onMembersChange }: {
  initialMembers: SelectedMember[]
  currencyCode: string
  /** The discount being edited, so its own products are never refused as already taken. */
  excludeDiscountId?: string
  onMembersChange: (members: SelectedMember[]) => void
}) {
  const [members, setMembers] = useState(initialMembers)

  // Reported when the members change, not whenever the parent passes a new callback (which would loop if it sets state).
  useEffect(() => {
    onMembersChange(members)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [members])

  const tools = {
    findProducts: ({ query }: { query: string }) => searchProductsAction(query),
    listProducts: () => listProductsAction(),
    findVariants: ({ productId }: { productId: string }) => getProductVariantsAction(productId),
    checkMember: ({ productId, variantId, excludeDiscountId: excluded }: { productId: string; variantId?: string; excludeDiscountId?: string }) => validateMemberAction(productId, variantId, excluded),
  }
  const productCount = new Set(members.map((member) => member.productId)).size

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-form-sm">
          <h2 className="text-form-headline-sm text-form-on-surface">Products &amp; variants</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-form-surface-container text-form-label-sm text-form-on-surface-variant font-medium">{describeProductCount({ productCount })}</span>
        </div>
        <span className="text-form-body-sm text-form-on-surface-variant">Applies automatically</span>
      </div>
      <ProductSearch
        members={members}
        currencyCode={currencyCode}
        excludeDiscountId={excludeDiscountId}
        delayMs={SEARCH_DELAY_MS}
        tools={tools}
        onAddMember={(member) => setMembers((current) => addMemberOnce({ members: current, member }))}
      />
      <SelectedProducts members={members} currencyCode={currencyCode} onRemoveProduct={(productId) => setMembers((current) => removeProductMembers({ members: current, productId }))} />
    </Card>
  )
}
