import { notFound } from 'next/navigation'
import { deleteDiscount } from '@/actions/discountActions'
import { saveDiscount } from '@/actions/saveDiscount'
import { computeLocalFlashStatus, describeFlashState, DISCOUNT_STATE_TOOLS } from '@/flash/discountState'
import { formatShopLocalNow } from '@/flash/schedule'
import FormPage from '@/form/components/FormPage'
import TierDiscountForm from '@/form/components/TierDiscountForm'
import { buildFlashValues, buildFormValues, buildSelectedMembers, buildTiersInitial } from '@/form/loadFormValues'
import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import { getShopCurrencyCode, getShopTimezone, zonedTimeToUtc } from '@/lib/shop'

export default async function DiscountPage({ params }: { params: Promise<{ discountId: string }> }) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)

  const config = await getConfig()
  const discount = config.discounts.find((candidate) => candidate.discountId === discountId)
  if (!discount) notFound()

  const [memberInfo, shopTimezone, currencyCode] = await Promise.all([getMemberInfo(discount.members), getShopTimezone(), getShopCurrencyCode()])
  const now = new Date()
  const flashStatus = discount.flash
    ? computeLocalFlashStatus({ startsAt: discount.flash.startsAt, endsAt: discount.flash.endsAt, timeZone: shopTimezone, nowMs: now.getTime(), convertToUtc: zonedTimeToUtc, tools: DISCOUNT_STATE_TOOLS })
    : null
  const flashState = describeFlashState({ discountStatus: discount.status, flashStatus })
  const badge = [discount.status === 'live' ? 'Live' : 'Draft', flashState].filter(Boolean).join(' · ')
  const { values, initialTiers } = buildFormValues({ discount, memberInfo, tools: { buildSelectedMembers, buildFlashValues, buildTiersInitial } })

  return (
    <FormPage>
      <TierDiscountForm
        breadcrumbLabel="Edit tier discount"
        heading={discount.name}
        badge={badge}
        mode="edit"
        status={discount.status}
        initial={values}
        initialTiers={initialTiers}
        currencyCode={currencyCode}
        shopTimezone={shopTimezone}
        nowLocal={formatShopLocalNow({ timeZone: shopTimezone, now })}
        initialNowSeconds={Math.floor(now.getTime() / 1000)}
        excludeDiscountId={discountId}
        saveAction={saveDiscount}
        deleteAction={deleteDiscount.bind(null, discountId)}
      />
    </FormPage>
  )
}
