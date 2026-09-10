import { z } from "zod";

import { computeQuoteTotals, type ComputedQuoteShape } from "./quote";

/**
 * Promo codes — docs/ARCHITECTURE.md §8/§9 (`Promotion`/`PromotionRedemption`,
 * the `promoDiscountCents` field every `Quote` has carried since Phase 1
 * with nothing ever setting it above 0). Discount *amounts* here are a
 * mechanism, not a real marketing decision — same "illustrative, not a
 * real business number" status pricing.ts's catalog rates carry; a real
 * campaign's code/value is created through the admin console, never
 * hardcoded here.
 */

export const PROMOTION_DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export type PromotionDiscountType = (typeof PROMOTION_DISCOUNT_TYPES)[number];

export const createPromotionSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(20)
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z0-9]+$/.test(v), "Code must be letters and numbers only"),
  discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
  // PERCENTAGE: 1-100. FIXED_AMOUNT: cents, capped at a sane $500 ceiling
  // (a typo shouldn't be able to create a $50,000-off code).
  discountValue: z.number().int().positive().max(50_000),
  maxRedemptions: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().max(100).default(1),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export interface PromotionLike {
  discountType: PromotionDiscountType;
  discountValue: number;
}

/** Never discounts past $0 — a fixed-amount code on a smaller order caps at the subtotal, not the code's face value. */
export function computePromotionDiscountCents(promotion: PromotionLike, subtotalCents: number): number {
  const raw =
    promotion.discountType === "PERCENTAGE"
      ? Math.floor((subtotalCents * promotion.discountValue) / 100)
      : promotion.discountValue;
  return Math.max(0, Math.min(raw, subtotalCents));
}

/**
 * Applies an already-validated promotion to an already-computed quote:
 * appends a visible discount line item and recomputes totals through the
 * same `computeQuoteTotals` every other repricing path in this codebase
 * uses (Phase 7's weight-overage re-quote included) — never a total
 * adjusted by hand outside that one function.
 */
export function applyPromotionToQuote<T extends ComputedQuoteShape>(
  quote: T,
  promotion: PromotionLike,
  code: string,
): T {
  const discountCents = computePromotionDiscountCents(promotion, quote.subtotalCents);
  // computeQuoteTotals(lineItems, discount) treats every item in
  // `lineItems` as a pre-discount charge and subtracts `discount`
  // separately — passing the *original* items keeps subtotalCents
  // meaning "before the discount," matching how every other quote
  // display in this codebase reads it. The negative discount line is
  // added to the returned array afterward, for display only; it's
  // never fed back into a totals calculation.
  const totals = computeQuoteTotals(quote.lineItems, discountCents);
  const lineItems = [...quote.lineItems, { label: `Promo: ${code}`, amountCents: -discountCents }];
  return { ...quote, lineItems, promoDiscountCents: discountCents, ...totals };
}
