import { randomUUID } from "node:crypto";

import type { GiftCardRecord, GiftCardsRepository } from "./repository";

export class InMemoryGiftCardsRepository implements GiftCardsRepository {
  private giftCardsById = new Map<string, GiftCardRecord>();

  async createGiftCard(input: {
    code: string;
    valueCents: number;
    purchaserId: string;
    recipientEmail?: string;
  }): Promise<GiftCardRecord> {
    if ([...this.giftCardsById.values()].some((g) => g.code === input.code)) {
      throw new Error(`Gift card code already exists: ${input.code}`);
    }
    const record: GiftCardRecord = {
      id: randomUUID(),
      code: input.code,
      valueCents: input.valueCents,
      purchaserId: input.purchaserId,
      recipientEmail: input.recipientEmail ?? null,
      status: "UNREDEEMED",
      redeemedByCustomerId: null,
      redeemedAt: null,
      createdAt: new Date(),
    };
    this.giftCardsById.set(record.id, record);
    return record;
  }

  async getGiftCardByCode(code: string): Promise<GiftCardRecord | null> {
    return [...this.giftCardsById.values()].find((g) => g.code === code) ?? null;
  }

  async redeemGiftCard(id: string, redeemedByCustomerId: string): Promise<GiftCardRecord> {
    const existing = this.giftCardsById.get(id);
    if (!existing) throw new Error(`No such gift card: ${id}`);
    const updated: GiftCardRecord = {
      ...existing,
      status: "REDEEMED",
      redeemedByCustomerId,
      redeemedAt: new Date(),
    };
    this.giftCardsById.set(id, updated);
    return updated;
  }

  async listPurchasedByCustomer(purchaserId: string): Promise<GiftCardRecord[]> {
    return [...this.giftCardsById.values()].filter((g) => g.purchaserId === purchaserId);
  }

  async listAllGiftCards(): Promise<GiftCardRecord[]> {
    return [...this.giftCardsById.values()];
  }
}
