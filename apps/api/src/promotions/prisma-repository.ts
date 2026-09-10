import type { PrismaClient } from "@prisma/client";
import type { CreatePromotionInput, PromotionDiscountType } from "@laandry/domain";

import type { PromotionRecord, PromotionRedemptionRecord, PromotionsRepository } from "./repository";

export class PrismaPromotionsRepository implements PromotionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPromotion(input: CreatePromotionInput): Promise<PromotionRecord> {
    const created = await this.prisma.promotion.create({
      data: {
        code: input.code,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxRedemptions: input.maxRedemptions ?? null,
        perCustomerLimit: input.perCustomerLimit,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      },
    });
    return { ...created, discountType: created.discountType as PromotionDiscountType };
  }

  async getPromotionByCode(code: string): Promise<PromotionRecord | null> {
    const found = await this.prisma.promotion.findUnique({ where: { code } });
    return found ? { ...found, discountType: found.discountType as PromotionDiscountType } : null;
  }

  async getPromotionById(id: string): Promise<PromotionRecord | null> {
    const found = await this.prisma.promotion.findUnique({ where: { id } });
    return found ? { ...found, discountType: found.discountType as PromotionDiscountType } : null;
  }

  async listAllPromotions(): Promise<PromotionRecord[]> {
    const all = await this.prisma.promotion.findMany({ orderBy: { createdAt: "desc" } });
    return all.map((p) => ({ ...p, discountType: p.discountType as PromotionDiscountType }));
  }

  async setPromotionActive(id: string, active: boolean): Promise<PromotionRecord> {
    const updated = await this.prisma.promotion.update({ where: { id }, data: { active } });
    return { ...updated, discountType: updated.discountType as PromotionDiscountType };
  }

  async recordRedemption(input: {
    promotionId: string;
    customerId: string;
    orderId: string;
    discountCents: number;
  }): Promise<PromotionRedemptionRecord> {
    return this.prisma.promotionRedemption.create({ data: input });
  }

  async countRedemptionsForPromotion(promotionId: string): Promise<number> {
    return this.prisma.promotionRedemption.count({ where: { promotionId } });
  }

  async countRedemptionsForCustomer(promotionId: string, customerId: string): Promise<number> {
    return this.prisma.promotionRedemption.count({ where: { promotionId, customerId } });
  }
}
