import type { PrismaClient } from "@prisma/client";
import type { ReferralStatus } from "@laandry/domain";

import type { CreditLedgerEntryRecord, ReferralRecord, ReferralsRepository } from "./repository";

export class PrismaReferralsRepository implements ReferralsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createReferral(input: { referrerId: string; refereeId: string; code: string }): Promise<ReferralRecord> {
    const created = await this.prisma.referral.create({ data: input });
    return { ...created, status: created.status as ReferralStatus };
  }

  async getPendingReferralForReferee(refereeId: string): Promise<ReferralRecord | null> {
    const found = await this.prisma.referral.findFirst({ where: { refereeId, status: "PENDING" } });
    return found ? { ...found, status: found.status as ReferralStatus } : null;
  }

  async qualifyReferral(id: string): Promise<ReferralRecord> {
    const updated = await this.prisma.referral.update({
      where: { id },
      data: { status: "QUALIFIED", qualifiedAt: new Date() },
    });
    return { ...updated, status: updated.status as ReferralStatus };
  }

  async listAllReferrals(): Promise<ReferralRecord[]> {
    const all = await this.prisma.referral.findMany({ orderBy: { createdAt: "desc" } });
    return all.map((r) => ({ ...r, status: r.status as ReferralStatus }));
  }

  async addCreditEntry(input: {
    customerId: string;
    amountCents: number;
    reason: string;
    orderId?: string;
  }): Promise<CreditLedgerEntryRecord> {
    return this.prisma.accountCreditLedger.create({
      data: { customerId: input.customerId, amountCents: input.amountCents, reason: input.reason, orderId: input.orderId ?? null },
    });
  }

  async listCreditEntriesForCustomer(customerId: string): Promise<CreditLedgerEntryRecord[]> {
    return this.prisma.accountCreditLedger.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  }
}
