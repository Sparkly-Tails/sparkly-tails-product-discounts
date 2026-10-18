import { getShopTimezone } from '@/lib/shop'
import { getRequestShop } from '@/lib/requestShop'
import { adminProductBaseUrl as buildAdminProductBaseUrl } from '@/timeDiscounts/shopifyRecord'
import NewDiscountForm from '@/timeDiscounts/components/NewDiscountForm'

export default async function NewTimeDiscountPage() {
  const shopTimezone = await getShopTimezone()
  const adminProductBaseUrl = buildAdminProductBaseUrl(await getRequestShop())
  return <NewDiscountForm shopTimezone={shopTimezone} adminProductBaseUrl={adminProductBaseUrl} />
}
