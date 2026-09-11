import { z } from "zod";

/**
 * Gift cards — docs/ARCHITECTURE.md §8/§17 (`GiftCard`), the last of
 * Phase 11's three named pieces. Deliberately the simplest of the three
 * to reason about once built: redeeming a card mints a single
 * `AccountCreditLedger` grant for its face value (see gift-cards/routes.ts)
 * and spending that credit at a later booking is the exact
 * `useAccountCredit` path referral credit (§33) already uses — no
 * separate partial-balance mechanism needed here at all.
 *
 * The denominations are a fixed illustrative set, same "not a real
 * business decision" status as pricing.ts's catalog rates — a real
 * storefront would probably also allow a custom amount; this is the
 * MVP shape.
 */
export const GIFT_CARD_DENOMINATIONS_CENTS = [2500, 5000, 10000, 15000] as const;
export type GiftCardDenominationCents = (typeof GIFT_CARD_DENOMINATIONS_CENTS)[number];

export const GIFT_CARD_STATUSES = ["UNREDEEMED", "REDEEMED"] as const;
export type GiftCardStatus = (typeof GIFT_CARD_STATUSES)[number];

export const purchaseGiftCardSchema = z.object({
  valueCents: z.number().int().refine((v) => (GIFT_CARD_DENOMINATIONS_CENTS as readonly number[]).includes(v), {
    message: `Must be one of: ${GIFT_CARD_DENOMINATIONS_CENTS.join(", ")}`,
  }),
  recipientEmail: z.string().email().optional(),
  paymentMethodToken: z.string().min(1),
});
export type PurchaseGiftCardInput = z.infer<typeof purchaseGiftCardSchema>;

export const redeemGiftCardSchema = z.object({
  code: z.string().min(1).max(20),
});
