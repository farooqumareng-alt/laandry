import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAccountCreditToQuote, computeCreditBalanceCents } from "./referrals";

test("computeCreditBalanceCents sums grants and spends into the true balance", () => {
  assert.equal(computeCreditBalanceCents([{ amountCents: 1000 }, { amountCents: 1000 }, { amountCents: -600 }]), 1400);
});

test("an empty ledger has a zero balance", () => {
  assert.equal(computeCreditBalanceCents([]), 0);
});

test("applyAccountCreditToQuote applies the full balance when it's less than the total", () => {
  const quote = { lineItems: [{ label: "Everyday Laundry", amountCents: 3500 }], subtotalCents: 3500, promoDiscountCents: 0, totalCents: 3500 };
  const applied = applyAccountCreditToQuote(quote, 1000);
  assert.equal(applied.totalCents, 2500);
  assert.equal(applied.lineItems.at(-1)?.label, "Account credit applied");
  assert.equal(applied.lineItems.at(-1)?.amountCents, -1000);
  assert.equal(applied.subtotalCents, 3500, "subtotal and promoDiscountCents are untouched — this only ever adjusts totalCents");
  assert.equal(applied.promoDiscountCents, 0);
});

test("applyAccountCreditToQuote caps at the total — never a negative charge", () => {
  const quote = { lineItems: [{ label: "Everyday Laundry", amountCents: 1200 }], subtotalCents: 1200, promoDiscountCents: 0, totalCents: 1200 };
  const applied = applyAccountCreditToQuote(quote, 5000);
  assert.equal(applied.totalCents, 0);
  assert.equal(applied.lineItems.at(-1)?.amountCents, -1200, "only the amount actually needed to zero out the order, not the full balance");
});

test("applyAccountCreditToQuote composes on top of an already promo-discounted quote without touching promoDiscountCents", () => {
  const promoDiscounted = { lineItems: [{ label: "Everyday Laundry", amountCents: 3500 }, { label: "Promo: SAVE10", amountCents: -350 }], subtotalCents: 3500, promoDiscountCents: 350, totalCents: 3150 };
  const applied = applyAccountCreditToQuote(promoDiscounted, 1000);
  assert.equal(applied.totalCents, 2150);
  assert.equal(applied.promoDiscountCents, 350, "the promo discount recorded on the quote is unaffected by credit stacking on top of it");
  assert.equal(applied.lineItems.length, 3);
});

test("zero available credit is a no-op — no phantom $0 line item", () => {
  const quote = { lineItems: [{ label: "Everyday Laundry", amountCents: 3500 }], subtotalCents: 3500, promoDiscountCents: 0, totalCents: 3500 };
  const applied = applyAccountCreditToQuote(quote, 0);
  assert.equal(applied.lineItems.length, 1);
  assert.equal(applied.totalCents, 3500);
});
