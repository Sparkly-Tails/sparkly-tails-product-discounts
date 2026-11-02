// The only place the homepage metrics tables are read and written. Every function gets the database as a parameter
// (the Prisma client, or a fake with the same methods in a test).

interface ShopDeleter {
  deleteMany: (args: { where: { shop: string } }) => Promise<unknown>
}

export interface MetricsDeleteDb {
  discountDailyStat: ShopDeleter
  visitorSeen: ShopDeleter
  bundleOrder: ShopDeleter
  metricsSync: ShopDeleter
}

/** Removes everything the metrics hold about one shop (used when Shopify asks for the shop's data to be erased). */
export async function deleteShopMetrics({ db, shop }: { db: MetricsDeleteDb; shop: string }): Promise<void> {
  const where = { shop }
  await Promise.all([
    db.discountDailyStat.deleteMany({ where }),
    db.visitorSeen.deleteMany({ where }),
    db.bundleOrder.deleteMany({ where }),
    db.metricsSync.deleteMany({ where }),
  ])
}
