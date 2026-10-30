import { saveDiscount } from '@/actions/saveDiscount'
import { formatShopLocalNow } from '@/flash/schedule'
import TierDiscountForm from '@/form/components/TierDiscountForm'
import FormPage from '@/form/components/FormPage'
import { EMPTY_FORM_VALUES, EMPTY_TIERS } from '@/form/emptyValues'
import { getShopCurrencyCode, getShopTimezone } from '@/lib/shop'

export default async function NewDiscountPage() {
  const [shopTimezone, currencyCode] = await Promise.all([getShopTimezone(), getShopCurrencyCode()])
  const now = new Date()
  return (
    <FormPage>
      <TierDiscountForm
        breadcrumbLabel="Create tier discount"
        heading="Create tier discount"
        badge="Draft"
        mode="create"
        initial={EMPTY_FORM_VALUES}
        initialTiers={EMPTY_TIERS}
        currencyCode={currencyCode}
        shopTimezone={shopTimezone}
        nowLocal={formatShopLocalNow({ timeZone: shopTimezone, now })}
        initialNowSeconds={Math.floor(now.getTime() / 1000)}
        saveAction={saveDiscount}
      />
    </FormPage>
  )
}
