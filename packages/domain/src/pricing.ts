import { z } from "zod";

import type { LaandryPreferences } from "./preferences";
import type { QuoteLineItem } from "./quote";
import { computeQuoteTotals } from "./quote";

/**
 * Pricing engine — docs/ARCHITECTURE.md §9. Pure, server-only, deterministic:
 * same input always produces the same line items. apps/api's booking route
 * is the only caller; the client only ever sees the *output* (a Quote), and
 * only ever sends the *inputs* (service + weight tier or items) — never a
 * price. All rates below are illustrative MVP placeholders, not real
 * business pricing decisions — Phase 10 makes this data-driven (a
 * PricingRule admin UI) without changing this function's shape.
 */

export const SERVICE_TYPES = [
  "EVERYDAY_LAUNDRY",
  "FORMAL_SPECIAL_CARE",
  "BEDDING_HOUSEHOLD",
  "TRAVEL",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const WEIGHT_TIERS = ["20_30", "30_40", "40_60", "60_PLUS", "NOT_SURE"] as const;
export type WeightTier = (typeof WEIGHT_TIERS)[number];

/** Exported so the booking UI's tier picker can show the real range/price instead of hardcoding a second copy. */
export const WEIGHT_TIER_RANGE_LB: Readonly<Record<WeightTier, [number, number]>> = {
  "20_30": [20, 30],
  "30_40": [30, 40],
  "40_60": [40, 60],
  "60_PLUS": [60, 90],
  // "Not sure" is priced at the middle tier pending verification, per
  // §9 — the customer approves any increase once actual weight is verified.
  NOT_SURE: [30, 40],
};

export const WEIGHT_TIER_PRICE_CENTS: Readonly<Record<WeightTier, number>> = {
  "20_30": 3500,
  "30_40": 4500,
  "40_60": 6000,
  "60_PLUS": 8000,
  NOT_SURE: 4500,
};

const MINIMUM_ORDER_CENTS = 2500;
const HANG_ADDON_CENTS = 800;
const PRESSING_ADDON_CENTS = 1200;

/**
 * description -> unit price in cents. "Other" is the fallback for anything
 * not in the catalog. Exported (not just used internally) so the booking UI
 * can list real item choices with real per-item prices instead of
 * duplicating this list — one source of truth for what an item costs.
 */
export const GARMENT_CARE_RATES_CENTS: Readonly<Record<string, number>> = {
  Shirt: 400,
  Blouse: 500,
  Pants: 600,
  Dress: 900,
  Skirt: 600,
  Other: 500,
};

export const HOUSEHOLD_RATES_CENTS: Readonly<Record<string, number>> = {
  Sheets: 800,
  Towels: 300,
  Blanket: 1500,
  Comforter: 2000,
  Other: 1000,
};

const itemLineSchema = z.object({
  description: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(200),
});
export type BookingItemLine = z.infer<typeof itemLineSchema>;

/** What the client actually sends — a discriminated union so a weight tier can never be paired with the wrong service and vice versa. */
export const bookingServiceInputSchema = z.discriminatedUnion("service", [
  z.object({ service: z.literal("EVERYDAY_LAUNDRY"), weightTier: z.enum(WEIGHT_TIERS) }),
  z.object({ service: z.literal("TRAVEL"), weightTier: z.enum(WEIGHT_TIERS) }),
  z.object({ service: z.literal("FORMAL_SPECIAL_CARE"), items: z.array(itemLineSchema).min(1).max(50) }),
  z.object({ service: z.literal("BEDDING_HOUSEHOLD"), items: z.array(itemLineSchema).min(1).max(50) }),
]);
export type BookingServiceInput = z.infer<typeof bookingServiceInputSchema>;

export interface ComputedQuote {
  lineItems: QuoteLineItem[];
  subtotalCents: number;
  promoDiscountCents: number;
  totalCents: number;
  estimatedWeightRangeLb: [number, number] | null;
}

function rateFor(catalog: Record<string, number>, description: string): number {
  return catalog[description] ?? catalog.Other!;
}

/**
 * Phase 7: when a provider's verified weight exceeds the customer's
 * authorized tolerance (see quote.ts exceedsWeightTolerance) and the
 * customer approves the difference, the order is re-priced at whichever
 * tier the *actual* weight falls into — not a continuous per-pound rate,
 * since the pricing model is flat-rate-per-tier by design (see the module
 * comment above). NOT_SURE is never returned — it's an input-only tier;
 * a verified weight always resolves to a real range.
 */
export function resolveWeightTierForPounds(lb: number): WeightTier {
  if (lb <= WEIGHT_TIER_RANGE_LB["20_30"][1]) return "20_30";
  if (lb <= WEIGHT_TIER_RANGE_LB["30_40"][1]) return "30_40";
  if (lb <= WEIGHT_TIER_RANGE_LB["40_60"][1]) return "40_60";
  return "60_PLUS";
}

export function computeQuote(input: BookingServiceInput, preferences: LaandryPreferences): ComputedQuote {
  const lineItems: QuoteLineItem[] = [];
  let estimatedWeightRangeLb: [number, number] | null = null;

  if (input.service === "EVERYDAY_LAUNDRY" || input.service === "TRAVEL") {
    const range = WEIGHT_TIER_RANGE_LB[input.weightTier];
    estimatedWeightRangeLb = range;
    lineItems.push({
      label: `${input.service === "TRAVEL" ? "Travel laundry" : "Everyday laundry"} (${range[0]}–${range[1]} lb, estimated)`,
      amountCents: WEIGHT_TIER_PRICE_CENTS[input.weightTier],
    });
  } else {
    const catalog = input.service === "FORMAL_SPECIAL_CARE" ? GARMENT_CARE_RATES_CENTS : HOUSEHOLD_RATES_CENTS;
    for (const item of input.items) {
      lineItems.push({
        label: `${item.description} ×${item.quantity}`,
        amountCents: rateFor(catalog, item.description) * item.quantity,
      });
    }
  }

  if (preferences.foldOrHang === "hang") {
    lineItems.push({ label: "Hang selected items", amountCents: HANG_ADDON_CENTS });
  }
  if (preferences.ironingRequested) {
    lineItems.push({ label: "Pressing", amountCents: PRESSING_ADDON_CENTS });
  }

  const { subtotalCents } = computeQuoteTotals(lineItems);
  if (subtotalCents < MINIMUM_ORDER_CENTS) {
    lineItems.push({ label: "Minimum order adjustment", amountCents: MINIMUM_ORDER_CENTS - subtotalCents });
  }

  const totals = computeQuoteTotals(lineItems);
  return { lineItems, ...totals, promoDiscountCents: 0, estimatedWeightRangeLb };
}
