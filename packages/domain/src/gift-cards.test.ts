import assert from "node:assert/strict";
import { test } from "node:test";

import { purchaseGiftCardSchema } from "./gift-cards";

test("purchaseGiftCardSchema accepts a real denomination", () => {
  const parsed = purchaseGiftCardSchema.safeParse({ valueCents: 5000, paymentMethodToken: "tok_visa" });
  assert.equal(parsed.success, true);
});

test("purchaseGiftCardSchema rejects an amount that isn't one of the fixed denominations", () => {
  const parsed = purchaseGiftCardSchema.safeParse({ valueCents: 4999, paymentMethodToken: "tok_visa" });
  assert.equal(parsed.success, false);
});

test("purchaseGiftCardSchema accepts an optional recipient email and rejects a malformed one", () => {
  const withRecipient = purchaseGiftCardSchema.safeParse({ valueCents: 2500, recipientEmail: "friend@example.com", paymentMethodToken: "tok_visa" });
  assert.equal(withRecipient.success, true);

  const badEmail = purchaseGiftCardSchema.safeParse({ valueCents: 2500, recipientEmail: "not-an-email", paymentMethodToken: "tok_visa" });
  assert.equal(badEmail.success, false);
});
