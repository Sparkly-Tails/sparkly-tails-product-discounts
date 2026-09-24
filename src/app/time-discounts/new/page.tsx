import { getShopTimezone } from '@/lib/shop'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'

export default async function NewTimeDiscountPage() {
  const shopTimezone = await getShopTimezone()
  return <NewTimeDiscountForm shopTimezone={shopTimezone} />
}
