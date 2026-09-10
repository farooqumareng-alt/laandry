import type { PrismaClient } from "@prisma/client";

import type { CreatePayoutInput, PayoutRecord, PayoutsRepository, ProviderEarningRecord } from "./repository";

export class PrismaPayoutsRepository implements PayoutsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordEarning(input: { providerId: string; orderId: string; amountCents: number }): Promise<ProviderEarningRecord> {
    return this.prisma.providerEarning.create({ data: input });
  }

  async listEarningsForProvider(providerId: string): Promise<ProviderEarningRecord[]> {
    return this.prisma.providerEarning.findMany({ where: { providerId }, orderBy: { createdAt: "desc" } });
  }

  async listAllEarnings(): Promise<ProviderEarningRecord[]> {
    return this.prisma.providerEarning.findMany({ orderBy: { createdAt: "desc" } });
  }

  async listUnpaidEarnings(): Promise<ProviderEarningRecord[]> {
    return this.prisma.providerEarning.findMany({ where: { payoutId: null }, orderBy: { createdAt: "asc" } });
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutRecord> {
    // One transaction: the Payout row and the earnings it claims commit
    // together or not at all — never a Payout with no linked earnings, or
    // earnings silently detached from the payout that was supposed to
    // settle them.
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: { providerId: input.providerId, amountCents: input.amountCents, status: input.status, processedAt: new Date() },
      });
      await tx.providerEarning.updateMany({
        where: { id: { in: input.earningIds } },
        data: { payoutId: payout.id },
      });
      return payout;
    });
  }

  async listPayoutsForProvider(providerId: string): Promise<PayoutRecord[]> {
    return this.prisma.payout.findMany({ where: { providerId } });
  }

  async listAllPayouts(): Promise<PayoutRecord[]> {
    return this.prisma.payout.findMany();
  }
}
