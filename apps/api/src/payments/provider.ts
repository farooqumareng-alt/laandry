/**
 * Payment authorization — docs/ARCHITECTURE.md §10. This is an
 * authorize-only interface (a hold, not a charge): the real amount can
 * still move at weight verification (Phase 7) and capture/refund happen
 * later in the order lifecycle, matching a manual-capture PaymentIntent in
 * a real processor.
 *
 * No live processor is wired up here — that needs real Stripe (or
 * equivalent) credentials this environment doesn't have. `FakePaymentProvider`
 * is the only implementation; a `StripePaymentProvider` satisfying this
 * same interface is what Phase 4 hands off to whoever has those
 * credentials. Never implement a "real-looking" provider that doesn't
 * actually call a processor — that's worse than an honest fake.
 */

export interface AuthorizePaymentInput {
  customerId: string;
  amountCents: number;
  /** A token from the client's payment SDK — never a raw card number. */
  paymentMethodToken: string;
}

export interface AuthorizePaymentResult {
  processorRef: string;
  status: "authorized" | "declined";
}

export interface PaymentProvider {
  authorize(input: AuthorizePaymentInput): Promise<AuthorizePaymentResult>;
}
