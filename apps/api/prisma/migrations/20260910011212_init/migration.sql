-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'PROVIDER', 'SUPPORT', 'DISPATCH', 'FINANCE', 'OPS_MANAGER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SCHEDULED', 'PROVIDER_ASSIGNED', 'PICKED_UP', 'BEING_CARED_FOR', 'FINISHING', 'READY_FOR_RETURN', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'DISPUTED', 'DELIVERY_FAILED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ELIGIBLE', 'WAVE_1_OFFERED', 'WAVE_2_OFFERED', 'ACCEPTED', 'UNFULFILLED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('EVERYDAY_LAUNDRY', 'FORMAL_SPECIAL_CARE', 'BEDDING_HOUSEHOLD', 'TRAVEL');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('APPLICATION_STARTED', 'IDENTITY_PENDING', 'REVIEW_PENDING', 'TRAINING_PENDING', 'APPROVED', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferences" JSONB,
    "preferredProviderId" TEXT,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'APPLICATION_STARTED',

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_capabilities" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,

    CONSTRAINT "provider_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_availability" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_service_areas" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "postalPrefix" TEXT NOT NULL,
    "radiusMiles" INTEGER NOT NULL,

    CONSTRAINT "provider_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_providers" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,

    CONSTRAINT "favorite_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "pickupWindowStart" TIMESTAMP(3) NOT NULL,
    "pickupWindowEnd" TIMESTAMP(3) NOT NULL,
    "preferenceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "finishing" JSONB,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_offers" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "wave" INTEGER NOT NULL DEFAULT 1,
    "offeredAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "provider_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estimatedWeightMinLb" DOUBLE PRECISION,
    "estimatedWeightMaxLb" DOUBLE PRECISION,
    "lineItems" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "promoDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_verifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "verifiedWeightLb" DOUBLE PRECISION NOT NULL,
    "verifiedByUserId" TEXT NOT NULL,
    "requiredApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedByCustomer" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_verifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bagCount" INTEGER,
    "itemCount" INTEGER,
    "method" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_verifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_evidence" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "processorRef" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_earnings" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_userId_key" ON "provider_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_capabilities_providerId_service_key" ON "provider_capabilities"("providerId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_providers_customerId_providerId_key" ON "favorite_providers"("customerId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_assignments_orderId_key" ON "provider_assignments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_assignments_offerId_key" ON "provider_assignments"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_orderId_version_key" ON "quotes"("orderId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "weight_verifications_orderId_key" ON "weight_verifications"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_verifications_orderId_key" ON "pickup_verifications"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_verifications_orderId_key" ON "delivery_verifications"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_orderId_key" ON "reviews"("orderId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_capabilities" ADD CONSTRAINT "provider_capabilities_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability" ADD CONSTRAINT "provider_availability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_service_areas" ADD CONSTRAINT "provider_service_areas_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_providers" ADD CONSTRAINT "favorite_providers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_providers" ADD CONSTRAINT "favorite_providers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_offers" ADD CONSTRAINT "provider_offers_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "provider_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_verifications" ADD CONSTRAINT "weight_verifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_verifications" ADD CONSTRAINT "pickup_verifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_verifications" ADD CONSTRAINT "delivery_verifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
