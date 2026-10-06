import { getShopTimezone } from '@/lib/shop'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'

export default async function NewTimeDiscountPage() {
  const shopTimezone = await getShopTimezone()
  const adminProductBaseUrl = `https://${process.env.SHOPIFY_SHOP}/admin/products/`
  return <NewTimeDiscountForm shopTimezone={shopTimezone} adminProductBaseUrl={adminProductBaseUrl} />
}
