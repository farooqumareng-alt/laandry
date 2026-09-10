import type { CreatePromotionInput, PromotionDiscountType } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface PromotionRecord {
  id: string;
  code: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  active: boolean;
  maxRedemptions: number | null;
  perCustomerLimit: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
}

export interface PromotionRedemptionRecord {
  id: string;
  promotionId: string;
  customerId: string;
  orderId: string;
  discountCents: number;
  createdAt: Date;
}

export interface PromotionsRepository {
  createPromotion(input: CreatePromotionInput): Promise<PromotionRecord>;
  getPromotionByCode(code: string): Promise<PromotionRecord | null>;
  getPromotionById(id: string): Promise<PromotionRecord | null>;
  listAllPromotions(): Promise<PromotionRecord[]>;
  /** A dumb setter, same discipline as every other repository's status setters — the route decides whether toggling is legal before calling this. */
  setPromotionActive(id: string, active: boolean): Promise<PromotionRecord>;

  /** @@unique on orderId at the schema level — a second call for the same order fails at the DB, never a double discount. */
  recordRedemption(input: {
    promotionId: string;
    customerId: string;
    orderId: string;
    discountCents: number;
  }): Promise<PromotionRedemptionRecord>;
  countRedemptionsForPromotion(promotionId: string): Promise<number>;
  countRedemptionsForCustomer(promotionId: string, customerId: string): Promise<number>;
}
