import assert from "node:assert/strict";
import { test } from "node:test";

import { bookingServiceInputSchema, computeQuote, resolveWeightTierForPounds } from "./pricing";
import { DEFAULT_PREFERENCES } from "./preferences";

test("everyday laundry prices by weight tier and reports the estimated range", () => {
  const quote = computeQuote({ service: "EVERYDAY_LAUNDRY", weightTier: "20_30" }, DEFAULT_PREFERENCES);
  assert.equal(quote.totalCents, 3500);
  assert.deepEqual(quote.estimatedWeightRangeLb, [20, 30]);
});

test("a 'not sure' weight tier is priced as the middle tier, not zero and not the top tier", () => {
  const notSure = computeQuote({ service: "EVERYDAY_LAUNDRY", weightTier: "NOT_SURE" }, DEFAULT_PREFERENCES);
  const midTier = computeQuote({ service: "EVERYDAY_LAUNDRY", weightTier: "30_40" }, DEFAULT_PREFERENCES);
  assert.equal(notSure.totalCents, midTier.totalCents);
});

test("garment-care items are priced per catalog rate × quantity", () => {
  const quote = computeQuote(
    { service: "FORMAL_SPECIAL_CARE", items: [{ description: "Shirt", quantity: 3 }] },
    DEFAULT_PREFERENCES,
  );
  // 3 shirts * $4.00 = $12.00, below the $25 minimum, so a minimum-order
  // adjustment line item brings it up to exactly $25.
  assert.equal(quote.totalCents, 2500);
  assert.ok(quote.lineItems.some((li) => li.label === "Minimum order adjustment"));
});

test("an unrecognized item description falls back to the 'Other' rate instead of pricing at zero", () => {
  const known = computeQuote(
    { service: "FORMAL_SPECIAL_CARE", items: [{ description: "Other", quantity: 1 }] },
    DEFAULT_PREFERENCES,
  );
  const unknown = computeQuote(
    { service: "FORMAL_SPECIAL_CARE", items: [{ description: "Kimono", quantity: 1 }] },
    DEFAULT_PREFERENCES,
  );
  assert.equal(unknown.lineItems[0]!.amountCents, known.lineItems[0]!.amountCents);
});

test("hang and pressing preferences each add their own line item to the total", () => {
  const base = computeQuote({ service: "EVERYDAY_LAUNDRY", weightTier: "40_60" }, DEFAULT_PREFERENCES);
  const withAddOns = computeQuote(
    { service: "EVERYDAY_LAUNDRY", weightTier: "40_60" },
    { ...DEFAULT_PREFERENCES, foldOrHang: "hang", ironingRequested: true },
  );
  assert.equal(withAddOns.totalCents, base.totalCents + 800 + 1200);
  assert.ok(withAddOns.lineItems.some((li) => li.label === "Hang selected items"));
  assert.ok(withAddOns.lineItems.some((li) => li.label === "Pressing"));
});

test("a weight tier can never be paired with an item-based service — the schema rejects it before pricing runs", () => {
  const result = bookingServiceInputSchema.safeParse({ service: "FORMAL_SPECIAL_CARE", weightTier: "20_30" });
  assert.equal(result.success, false);
});

test("parsing a booking input strips any extraneous client-supplied field — a price can never ride along with the request", () => {
  const parsed = bookingServiceInputSchema.parse({
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
    totalCents: 1, // an attempted price-tampering field
  });
  assert.ok(!("totalCents" in parsed));
});

test("resolveWeightTierForPounds maps a verified weight to the tier that actually covers it", () => {
  assert.equal(resolveWeightTierForPounds(15), "20_30", "below the lowest tier still bills at the lowest tier");
  assert.equal(resolveWeightTierForPounds(25), "20_30");
  assert.equal(resolveWeightTierForPounds(30), "20_30", "tier boundaries are inclusive on the top end");
  assert.equal(resolveWeightTierForPounds(35), "30_40");
  assert.equal(resolveWeightTierForPounds(55), "40_60");
  assert.equal(resolveWeightTierForPounds(90), "60_PLUS");
  assert.equal(resolveWeightTierForPounds(150), "60_PLUS", "there's no tier above 60_PLUS in the MVP catalog — it caps there");
});
