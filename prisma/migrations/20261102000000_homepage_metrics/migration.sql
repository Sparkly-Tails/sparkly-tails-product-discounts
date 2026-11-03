-- CreateTable
CREATE TABLE "DiscountDailyStat" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiscountDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSeen" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,

    CONSTRAINT "VisitorSeen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleOrder" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "orderSubtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "addedRevenue" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BundleOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricsSync" (
    "shop" TEXT NOT NULL,
    "lastOrderSyncAt" TIMESTAMP(3),
    "backfilledUntil" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "liveProducts" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MetricsSync_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountDailyStat_shop_discountId_day_key" ON "DiscountDailyStat"("shop", "discountId", "day");

-- CreateIndex
CREATE INDEX "VisitorSeen_shop_day_idx" ON "VisitorSeen"("shop", "day");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorSeen_shop_discountId_day_visitorKey_key" ON "VisitorSeen"("shop", "discountId", "day", "visitorKey");

-- CreateIndex
CREATE INDEX "BundleOrder_shop_orderedAt_idx" ON "BundleOrder"("shop", "orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BundleOrder_shop_orderId_discountId_key" ON "BundleOrder"("shop", "orderId", "discountId");

-- Supabase exposes tables in the public schema through its REST API. These tables
-- are read and written only by this app through Prisma (the database owner role,
-- which bypasses RLS), so deny every other role: RLS on, no policies.
ALTER TABLE "DiscountDailyStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitorSeen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BundleOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetricsSync" ENABLE ROW LEVEL SECURITY;
