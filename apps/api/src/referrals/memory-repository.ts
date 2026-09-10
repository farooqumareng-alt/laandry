import { randomUUID } from "node:crypto";

import type { CreditLedgerEntryRecord, ReferralRecord, ReferralsRepository } from "./repository";

export class InMemoryReferralsRepository implements ReferralsRepository {
  private referralsById = new Map<string, ReferralRecord>();
  private creditEntriesById = new Map<string, CreditLedgerEntryRecord>();

  async createReferral(input: { referrerId: string; refereeId: string; code: string }): Promise<ReferralRecord> {
    if ([...this.referralsById.values()].some((r) => r.refereeId === input.refereeId)) {
      throw new Error(`Customer already has a referral: ${input.refereeId}`);
    }
    const record: ReferralRecord = {
      id: randomUUID(),
      referrerId: input.referrerId,
      refereeId: input.refereeId,
      code: input.code,
      status: "PENDING",
      qualifiedAt: null,
      createdAt: new Date(),
    };
    this.referralsById.set(record.id, record);
    return record;
  }

  async getPendingReferralForReferee(refereeId: string): Promise<ReferralRecord | null> {
    return (
      [...this.referralsById.values()].find((r) => r.refereeId === refereeId && r.status === "PENDING") ?? null
    );
  }

  async qualifyReferral(id: string): Promise<ReferralRecord> {
    const existing = this.referralsById.get(id);
    if (!existing) throw new Error(`No such referral: ${id}`);
    const updated: ReferralRecord = { ...existing, status: "QUALIFIED", qualifiedAt: new Date() };
    this.referralsById.set(id, updated);
    return updated;
  }

  async listAllReferrals(): Promise<ReferralRecord[]> {
    return [...this.referralsById.values()];
  }

  async addCreditEntry(input: {
    customerId: string;
    amountCents: number;
    reason: string;
    orderId?: string;
  }): Promise<CreditLedgerEntryRecord> {
    const record: CreditLedgerEntryRecord = {
      id: randomUUID(),
      customerId: input.customerId,
      amountCents: input.amountCents,
      reason: input.reason,
      orderId: input.orderId ?? null,
      createdAt: new Date(),
    };
    this.creditEntriesById.set(record.id, record);
    return record;
  }

  async listCreditEntriesForCustomer(customerId: string): Promise<CreditLedgerEntryRecord[]> {
    return [...this.creditEntriesById.values()].filter((e) => e.customerId === customerId);
  }
}
