-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('DAMAGED_ITEM', 'MISSING_ITEM', 'UNSUPPORTED_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "processing_confirmations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "confirmedStages" JSONB NOT NULL,
    "confirmedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processing_confirmations_orderId_key" ON "processing_confirmations"("orderId");

-- AddForeignKey
ALTER TABLE "processing_confirmations" ADD CONSTRAINT "processing_confirmations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
