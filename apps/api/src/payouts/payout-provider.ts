/**
 * Moving money *to* a provider — docs/ARCHITECTURE.md §10 ("provider
 * payouts are a separate accounting flow, e.g. Stripe Connect"). No live
 * payout-processor credentials exist for this project (the Resend key
 * that made real email possible in §30 doesn't cover this), so this
 * stays honestly fake, same as payments/provider.ts: never implement a
 * real-looking payout provider that doesn't actually move money.
 */

export interface PayInput {
  providerId: string;
  amountCents: number;
}

export interface PayResult {
  processorRef: string;
  status: string;
}

export interface PayoutProvider {
  pay(input: PayInput): Promise<PayResult>;
}
