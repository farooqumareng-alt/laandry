import { randomUUID } from "node:crypto";

import type { PayInput, PayoutProvider, PayResult } from "./payout-provider";

/** Always succeeds — unlike a card authorization, there's no everyday "declined" case worth simulating for a payout to a provider's own account, so this doesn't need a FakePaymentProvider-style decline token. */
export class FakePayoutProvider implements PayoutProvider {
  async pay(_input: PayInput): Promise<PayResult> {
    return { processorRef: `fake_payout_${randomUUID()}`, status: "paid" };
  }
}
