import type { ComputedQuoteShape } from "./quote";

/**
 * Referral credit — docs/ARCHITECTURE.md §8/§17 (`Referral`,
 * `AccountCreditLedger`) and §7's threat-model row on promo/referral
 * abuse ("qualifying-event-based referral credit — first completed paid
 * order, not signup"). Unlike promo codes (admin-managed, many different
 * values), this is a single global give-$X/get-$X policy — an
 * illustrative MVP placeholder amount, same status as pricing.ts's
 * catalog rates, not a real marketing decision.
 */
export const REFERRAL_CREDIT_CENTS = 1000;

export const REFERRAL_STATUSES = ["PENDING", "QUALIFIED"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export interface CreditLedgerEntryLike {
  amountCents: number;
}

/** Sums a customer's ledger into their spendable balance. Positive entries are grants, negative are spends — the sum is the true balance, never a separately-stored number that could drift from it. */
export function computeCreditBalanceCents(entries: CreditLedgerEntryLike[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountCents, 0);
}

/**
 * Applies up to the customer's full available credit to an
 * already-computed (and possibly already promo-discounted) quote —
 * capped so it never exceeds either the available balance or the
 * quote's current total, and never pushes the total negative. Appends
 * its own visible line item; deliberately doesn't touch
 * `subtotalCents`/`promoDiscountCents` at all, so it composes cleanly
 * on top of `applyPromotionToQuote` without double-adjusting anything
 * that function already computed.
 */
export function applyAccountCreditToQuote<T extends ComputedQuoteShape>(quote: T, availableCreditCents: number): T {
  const applied = Math.max(0, Math.min(availableCreditCents, quote.totalCents));
  if (applied === 0) return quote;
  const lineItems = [...quote.lineItems, { label: "Account credit applied", amountCents: -applied }];
  return { ...quote, lineItems, totalCents: quote.totalCents - applied };
}
