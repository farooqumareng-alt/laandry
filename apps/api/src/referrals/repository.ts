import type { ReferralStatus } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface ReferralRecord {
  id: string;
  referrerId: string;
  refereeId: string;
  code: string;
  status: ReferralStatus;
  qualifiedAt: Date | null;
  createdAt: Date;
}

export interface CreditLedgerEntryRecord {
  id: string;
  customerId: string;
  amountCents: number;
  reason: string;
  orderId: string | null;
  createdAt: Date;
}

export interface ReferralsRepository {
  /** @@unique on refereeId at the schema level — a customer can only ever be linked to one referrer. */
  createReferral(input: { referrerId: string; refereeId: string; code: string }): Promise<ReferralRecord>;
  getPendingReferralForReferee(refereeId: string): Promise<ReferralRecord | null>;
  qualifyReferral(id: string): Promise<ReferralRecord>;
  listAllReferrals(): Promise<ReferralRecord[]>;

  addCreditEntry(input: {
    customerId: string;
    amountCents: number;
    reason: string;
    orderId?: string;
  }): Promise<CreditLedgerEntryRecord>;
  listCreditEntriesForCustomer(customerId: string): Promise<CreditLedgerEntryRecord[]>;
}
