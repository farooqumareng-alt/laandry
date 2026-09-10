/**
 * Provider earnings — docs/ARCHITECTURE.md §10 ("every financial event —
 * ... provider earning, platform fee, payout — is an immutable ledger
 * entry"). This is the one real, user-confirmed business number in the
 * whole pricing/payouts surface (everything in pricing.ts is explicitly
 * an illustrative placeholder) — 30% platform / 70% provider, tips
 * excluded from the split and paid through at 100%.
 *
 * Rounds down (Math.floor) rather than to nearest: never let a rounding
 * rule hand the provider a cent more than the take-rate actually owes
 * them — the platform absorbs the fractional remainder, not the other
 * way around.
 */

export const PLATFORM_TAKE_RATE = 0.3;
export const PROVIDER_EARNING_RATE = 1 - PLATFORM_TAKE_RATE;

/** The provider's cut of a completed order's total — tips are a separate, full-amount earning; see payouts/routes.ts. */
export function computeOrderEarningCents(orderTotalCents: number): number {
  return Math.floor(orderTotalCents * PROVIDER_EARNING_RATE);
}
