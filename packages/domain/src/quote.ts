import { z } from "zod";

/**
 * Pricing / quote types — mirrors docs/ARCHITECTURE.md §9.
 *
 * A Quote is produced server-side from a PricingRule set and is versioned.
 * The client only ever displays a Quote it received from the API; it never
 * constructs or edits one. All money is integer cents to avoid float drift.
 */

export const quoteLineItemSchema = z.object({
  label: z.string().min(1),
  amountCents: z.number().int(),
});
export type QuoteLineItem = z.infer<typeof quoteLineItemSchema>;

export const quoteSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  version: z.number().int().positive(),
  estimatedWeightRangeLb: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).nullable(),
  lineItems: z.array(quoteLineItemSchema).min(1),
  subtotalCents: z.number().int().nonnegative(),
  promoDiscountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type Quote = z.infer<typeof quoteSchema>;

/**
 * Recomputes subtotal/total from line items server-side. Used to verify
 * that a stored/incoming Quote is internally consistent — this is the
 * check that stands between the pricing engine and "price tampering" in
 * docs/ARCHITECTURE.md §7.
 */
export function computeQuoteTotals(
  lineItems: QuoteLineItem[],
  promoDiscountCents = 0,
): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const totalCents = Math.max(0, subtotalCents - promoDiscountCents);
  return { subtotalCents, totalCents };
}

/**
 * Weight-tolerance check for docs/ARCHITECTURE.md §9: if verified weight
 * exceeds the customer's authorized estimate by more than the tolerance,
 * the order must pause for customer approval instead of auto-charging.
 */
export function exceedsWeightTolerance(
  estimatedMaxLb: number,
  verifiedLb: number,
  toleranceLb = 5,
): boolean {
  return verifiedLb > estimatedMaxLb + toleranceLb;
}
