import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { deleteTimeDiscount } from '@/timeDiscounts/actions'
import { getShopTimezone } from '@/lib/shop'
import { getMemberInfo } from '@/lib/products'
import { itemKey, productAdminUrl } from '@/timeDiscounts/items'
import { loadCovered } from '@/timeDiscounts/groupServer'
import GroupDiscountEditor from '@/timeDiscounts/components/GroupDiscountEditor'
import TimeDiscountEditor from '@/timeDiscounts/components/TimeDiscountEditor'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import AuthLink from '@/components/AuthLink'

export default async function TimeDiscountPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getTimeDiscountsConfig()
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) notFound()

  const shopTimezone = await getShopTimezone()
  const adminProductBaseUrl = `https://${process.env.SHOPIFY_SHOP}/admin/products/`

  if (discount.kind === 'group' && discount.group) {
    const covered = await loadCovered(discount.items, adminProductBaseUrl)
    return (
      <main className="p-8 max-w-3xl mx-auto">
        <AuthLink
          href="/"
          token={token}
          className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
        >
          ← Back to discounts
        </AuthLink>

        <GroupDiscountEditor
          discountId={discountId}
          shopTimezone={shopTimezone}
          initialTitle={discount.title}
          initialStartsAt={discount.startsAt}
          initialEndsAt={discount.endsAt}
          initialPricingMode={discount.group.pricingMode}
          initialAmount={discount.group.amount}
          initialSelection={discount.group.selection}
          initialCovered={covered}
          deleteAction={deleteTimeDiscount.bind(null, discountId)}
        />
      </main>
    )
  }

  // A product that can no longer be looked up still gets a row, so it can be removed.
  const info = new Map((await getMemberInfo(discount.items)).map((m) => [itemKey(m), m]))
  const rows: DisplayRow[] = discount.items.map((item) => {
    const found = info.get(itemKey(item))
    return {
      productId: item.productId,
      variantId: item.variantId,
      title: found?.title ?? `Product ${item.productId.split('/').pop()}`,
      adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
      regularPrice: found?.price ?? null,
      pricingMode: item.pricingMode,
      amount: item.amount,
    }
  })

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <TimeDiscountEditor
        discountId={discountId}
        shopTimezone={shopTimezone}
        adminProductBaseUrl={adminProductBaseUrl}
        initialTitle={discount.title}
        initialStartsAt={discount.startsAt}
        initialEndsAt={discount.endsAt}
        initialRows={rows}
        deleteAction={deleteTimeDiscount.bind(null, discountId)}
      />
    </main>
  )
}
