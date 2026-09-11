import type { PrismaClient } from "@prisma/client";
import type { GiftCardStatus } from "@laandry/domain";

import type { GiftCardRecord, GiftCardsRepository } from "./repository";

export class PrismaGiftCardsRepository implements GiftCardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createGiftCard(input: {
    code: string;
    valueCents: number;
    purchaserId: string;
    recipientEmail?: string;
  }): Promise<GiftCardRecord> {
    const created = await this.prisma.giftCard.create({
      data: {
        code: input.code,
        valueCents: input.valueCents,
        purchaserId: input.purchaserId,
        recipientEmail: input.recipientEmail ?? null,
      },
    });
    return { ...created, status: created.status as GiftCardStatus };
  }

  async getGiftCardByCode(code: string): Promise<GiftCardRecord | null> {
    const found = await this.prisma.giftCard.findUnique({ where: { code } });
    return found ? { ...found, status: found.status as GiftCardStatus } : null;
  }

  async redeemGiftCard(id: string, redeemedByCustomerId: string): Promise<GiftCardRecord> {
    const updated = await this.prisma.giftCard.update({
      where: { id },
      data: { status: "REDEEMED", redeemedByCustomerId, redeemedAt: new Date() },
    });
    return { ...updated, status: updated.status as GiftCardStatus };
  }

  async listPurchasedByCustomer(purchaserId: string): Promise<GiftCardRecord[]> {
    const all = await this.prisma.giftCard.findMany({ where: { purchaserId }, orderBy: { createdAt: "desc" } });
    return all.map((g) => ({ ...g, status: g.status as GiftCardStatus }));
  }

  async listAllGiftCards(): Promise<GiftCardRecord[]> {
    const all = await this.prisma.giftCard.findMany({ orderBy: { createdAt: "desc" } });
    return all.map((g) => ({ ...g, status: g.status as GiftCardStatus }));
  }
}
