/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface ProviderEarningRecord {
  id: string;
  providerId: string;
  orderId: string;
  amountCents: number;
  payoutId: string | null;
  createdAt: Date;
}

export interface PayoutRecord {
  id: string;
  providerId: string;
  amountCents: number;
  status: string;
  processedAt: Date | null;
}

export interface CreatePayoutInput {
  providerId: string;
  amountCents: number;
  /** The specific earning rows this payout settles — claimed atomically alongside creating the Payout row itself, so a concurrent run can't double-pay the same earning. */
  earningIds: string[];
  processorRef: string;
  status: string;
}

export interface PayoutsRepository {
  /** Called at order-delivery (the order's 70% cut) and at tip-add (100% of the tip) — see delivery/routes.ts. */
  recordEarning(input: { providerId: string; orderId: string; amountCents: number }): Promise<ProviderEarningRecord>;
  listEarningsForProvider(providerId: string): Promise<ProviderEarningRecord[]>;
  /** Admin-only — every earning, across every provider. */
  listAllEarnings(): Promise<ProviderEarningRecord[]>;
  /** The input to a payout run: every earning not yet attached to a Payout, across every provider. */
  listUnpaidEarnings(): Promise<ProviderEarningRecord[]>;

  /** Creates the Payout row and attaches the given earnings to it in one step — see CreatePayoutInput. */
  createPayout(input: CreatePayoutInput): Promise<PayoutRecord>;
  listPayoutsForProvider(providerId: string): Promise<PayoutRecord[]>;
  /** Admin-only — every payout, across every provider. */
  listAllPayouts(): Promise<PayoutRecord[]>;
}
