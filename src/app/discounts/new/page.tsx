import { getShopTimezone } from '@/lib/shop'
import { formatShopLocalNow } from '@/flash/schedule'
import NewDiscountForm from './NewDiscountForm'

export default async function NewDiscountPage() {
  const shopTimezone = await getShopTimezone()
  return <NewDiscountForm shopTimezone={shopTimezone} nowLocal={formatShopLocalNow({ timeZone: shopTimezone, now: new Date() })} />
}
