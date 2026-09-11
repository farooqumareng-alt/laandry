import type { GiftCardStatus } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface GiftCardRecord {
  id: string;
  code: string;
  valueCents: number;
  purchaserId: string;
  recipientEmail: string | null;
  status: GiftCardStatus;
  redeemedByCustomerId: string | null;
  redeemedAt: Date | null;
  createdAt: Date;
}

export interface GiftCardsRepository {
  createGiftCard(input: {
    code: string;
    valueCents: number;
    purchaserId: string;
    recipientEmail?: string;
  }): Promise<GiftCardRecord>;
  getGiftCardByCode(code: string): Promise<GiftCardRecord | null>;
  /** The route decides UNREDEEMED before calling this, same discipline as promotions' setPromotionActive. */
  redeemGiftCard(id: string, redeemedByCustomerId: string): Promise<GiftCardRecord>;
  listPurchasedByCustomer(purchaserId: string): Promise<GiftCardRecord[]>;
  listAllGiftCards(): Promise<GiftCardRecord[]>;
}
