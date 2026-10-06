import { getShopTimezone } from '@/lib/shop'
import NewDiscountForm from '@/timeDiscounts/components/NewDiscountForm'

export default async function NewTimeDiscountPage() {
  const shopTimezone = await getShopTimezone()
  const adminProductBaseUrl = `https://${process.env.SHOPIFY_SHOP}/admin/products/`
  return <NewDiscountForm shopTimezone={shopTimezone} adminProductBaseUrl={adminProductBaseUrl} />
}
