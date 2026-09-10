import { randomUUID } from "node:crypto";

import type { CreatePayoutInput, PayoutRecord, PayoutsRepository, ProviderEarningRecord } from "./repository";

export class InMemoryPayoutsRepository implements PayoutsRepository {
  private earningsById = new Map<string, ProviderEarningRecord>();
  private payoutsById = new Map<string, PayoutRecord>();

  async recordEarning(input: { providerId: string; orderId: string; amountCents: number }): Promise<ProviderEarningRecord> {
    const record: ProviderEarningRecord = {
      id: randomUUID(),
      providerId: input.providerId,
      orderId: input.orderId,
      amountCents: input.amountCents,
      payoutId: null,
      createdAt: new Date(),
    };
    this.earningsById.set(record.id, record);
    return record;
  }

  async listEarningsForProvider(providerId: string): Promise<ProviderEarningRecord[]> {
    return [...this.earningsById.values()].filter((e) => e.providerId === providerId);
  }

  async listAllEarnings(): Promise<ProviderEarningRecord[]> {
    return [...this.earningsById.values()];
  }

  async listUnpaidEarnings(): Promise<ProviderEarningRecord[]> {
    return [...this.earningsById.values()].filter((e) => e.payoutId === null);
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutRecord> {
    const payout: PayoutRecord = {
      id: randomUUID(),
      providerId: input.providerId,
      amountCents: input.amountCents,
      status: input.status,
      processedAt: new Date(),
    };
    this.payoutsById.set(payout.id, payout);
    for (const earningId of input.earningIds) {
      const earning = this.earningsById.get(earningId);
      if (earning) this.earningsById.set(earningId, { ...earning, payoutId: payout.id });
    }
    return payout;
  }

  async listPayoutsForProvider(providerId: string): Promise<PayoutRecord[]> {
    return [...this.payoutsById.values()].filter((p) => p.providerId === providerId);
  }

  async listAllPayouts(): Promise<PayoutRecord[]> {
    return [...this.payoutsById.values()];
  }
}
