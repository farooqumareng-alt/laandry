import { randomUUID } from "node:crypto";

import type { AuthorizePaymentInput, AuthorizePaymentResult, PaymentProvider } from "./provider";

/**
 * Deterministic fake used in dev and in tests. Mirrors the well-known
 * Stripe test-token convention so the decline path is actually testable:
 * pass paymentMethodToken "tok_declined" to simulate a declined card.
 * Anything else authorizes.
 */
export class FakePaymentProvider implements PaymentProvider {
  async authorize(input: AuthorizePaymentInput): Promise<AuthorizePaymentResult> {
    if (input.paymentMethodToken === "tok_declined") {
      return { processorRef: `fake_declined_${randomUUID()}`, status: "declined" };
    }
    return { processorRef: `fake_auth_${randomUUID()}`, status: "authorized" };
  }
}
