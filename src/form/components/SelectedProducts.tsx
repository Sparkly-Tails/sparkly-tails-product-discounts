import { formatMoneyAmount } from '@/home/formatMoney'
import ProductRow from '@/form/components/ProductRow'
import { describeGroup, groupMembersByProduct, type SelectedMember } from '@/form/memberSelection'

// The rows of the chosen products, and the hidden fields that send every
// (product, variant) to the save action in the order they were added.
export default function SelectedProducts({ members, currencyCode, onRemoveProduct }: {
  members: SelectedMember[]
  currencyCode: string
  onRemoveProduct: (productId: string) => void
}) {
  const formatPrice = (amount: number) => formatMoneyAmount({ amount, currencyCode })
  return (
    <div className="space-y-form-xs pt-1">
      {members.map((member, index) => (
        <span key={`${member.productId}-${member.variantId ?? ''}`} hidden>
          <input type="hidden" name={`member-${index}-productId`} value={member.productId} />
          {member.variantId ? <input type="hidden" name={`member-${index}-variantId`} value={member.variantId} /> : null}
        </span>
      ))}
      {groupMembersByProduct({ members }).map((group) => (
        <ProductRow
          key={group.productId}
          title={group.productTitle}
          imageUrl={group.imageUrl}
          summary={describeGroup({ group, currencyCode, formatPrice })}
          onRemove={() => onRemoveProduct(group.productId)}
        />
      ))}
    </div>
  )
}
