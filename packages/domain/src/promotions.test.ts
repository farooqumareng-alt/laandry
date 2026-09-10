import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPromotionToQuote, computePromotionDiscountCents, createPromotionSchema } from "./promotions";

test("a percentage discount is a floor of the subtotal times the rate", () => {
  assert.equal(computePromotionDiscountCents({ discountType: "PERCENTAGE", discountValue: 20 }, 3333), 666); // 20% of 3333 = 666.6
});

test("a fixed-amount discount caps at the subtotal — never a negative total", () => {
  assert.equal(computePromotionDiscountCents({ discountType: "FIXED_AMOUNT", discountValue: 1000 }, 500), 500);
});

test("a fixed-amount discount under the subtotal applies in full", () => {
  assert.equal(computePromotionDiscountCents({ discountType: "FIXED_AMOUNT", discountValue: 500 }, 2000), 500);
});

test("applyPromotionToQuote appends a visible discount line item and recomputes totals through computeQuoteTotals", () => {
  const quote = {
    lineItems: [{ label: "Everyday Laundry (20-30 lb)", amountCents: 3500 }],
    subtotalCents: 3500,
    promoDiscountCents: 0,
    totalCents: 3500,
  };
  const applied = applyPromotionToQuote(quote, { discountType: "PERCENTAGE", discountValue: 10 }, "SAVE10");
  assert.equal(applied.lineItems.length, 2);
  assert.equal(applied.lineItems[1]?.label, "Promo: SAVE10");
  assert.equal(applied.lineItems[1]?.amountCents, -350);
  assert.equal(applied.promoDiscountCents, 350);
  assert.equal(applied.totalCents, 3150);
  assert.equal(applied.subtotalCents, 3500, "subtotal is still the pre-discount sum of positive line items — same convention computeQuoteTotals already uses");
});

test("createPromotionSchema uppercases the code and rejects non-alphanumeric input", () => {
  const parsed = createPromotionSchema.safeParse({
    code: "save10",
    discountType: "PERCENTAGE",
    discountValue: 10,
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.code, "SAVE10");

  const rejected = createPromotionSchema.safeParse({
    code: "save-10!",
    discountType: "PERCENTAGE",
    discountValue: 10,
  });
  assert.equal(rejected.success, false);
});

test("createPromotionSchema rejects a discount value over the sanity ceiling", () => {
  const parsed = createPromotionSchema.safeParse({
    code: "HUGE",
    discountType: "FIXED_AMOUNT",
    discountValue: 100_000,
  });
  assert.equal(parsed.success, false);
});
