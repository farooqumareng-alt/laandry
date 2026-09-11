-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('UNREDEEMED', 'REDEEMED');

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "purchaserId" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'UNREDEEMED',
    "redeemedByCustomerId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_code_key" ON "gift_cards"("code");

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_redeemedByCustomerId_fkey" FOREIGN KEY ("redeemedByCustomerId") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
