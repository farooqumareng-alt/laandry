import { randomUUID } from "node:crypto";
import type { CreatePromotionInput } from "@laandry/domain";

import type { PromotionRecord, PromotionRedemptionRecord, PromotionsRepository } from "./repository";

export class InMemoryPromotionsRepository implements PromotionsRepository {
  private promotionsById = new Map<string, PromotionRecord>();
  private redemptionsById = new Map<string, PromotionRedemptionRecord>();

  async createPromotion(input: CreatePromotionInput): Promise<PromotionRecord> {
    const record: PromotionRecord = {
      id: randomUUID(),
      code: input.code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      active: true,
      maxRedemptions: input.maxRedemptions ?? null,
      perCustomerLimit: input.perCustomerLimit,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdAt: new Date(),
    };
    this.promotionsById.set(record.id, record);
    return record;
  }

  async getPromotionByCode(code: string): Promise<PromotionRecord | null> {
    return [...this.promotionsById.values()].find((p) => p.code === code) ?? null;
  }

  async getPromotionById(id: string): Promise<PromotionRecord | null> {
    return this.promotionsById.get(id) ?? null;
  }

  async listAllPromotions(): Promise<PromotionRecord[]> {
    return [...this.promotionsById.values()];
  }

  async setPromotionActive(id: string, active: boolean): Promise<PromotionRecord> {
    const existing = this.promotionsById.get(id);
    if (!existing) throw new Error(`No such promotion: ${id}`);
    const updated = { ...existing, active };
    this.promotionsById.set(id, updated);
    return updated;
  }

  async recordRedemption(input: {
    promotionId: string;
    customerId: string;
    orderId: string;
    discountCents: number;
  }): Promise<PromotionRedemptionRecord> {
    if ([...this.redemptionsById.values()].some((r) => r.orderId === input.orderId)) {
      throw new Error(`Order already has a promotion redemption: ${input.orderId}`);
    }
    const record: PromotionRedemptionRecord = { id: randomUUID(), createdAt: new Date(), ...input };
    this.redemptionsById.set(record.id, record);
    return record;
  }

  async countRedemptionsForPromotion(promotionId: string): Promise<number> {
    return [...this.redemptionsById.values()].filter((r) => r.promotionId === promotionId).length;
  }

  async countRedemptionsForCustomer(promotionId: string, customerId: string): Promise<number> {
    return [...this.redemptionsById.values()].filter((r) => r.promotionId === promotionId && r.customerId === customerId)
      .length;
  }
}
