/**
 * Provider offer / assignment state machine — mirrors docs/ARCHITECTURE.md §4.
 *
 * The Wave1Offered -> Accepted transition is where the double-accept race
 * lives. This module only defines legality of the transition; the actual
 * concurrency safety comes from the API layer performing it as a single
 * conditional UPDATE (`WHERE status = 'WAVE_1_OFFERED'`), so a second
 * simultaneous accept affects zero rows instead of racing in memory.
 */

export const OFFER_STATUSES = [
  "ELIGIBLE",
  "WAVE_1_OFFERED",
  "WAVE_2_OFFERED",
  "ACCEPTED",
  "UNFULFILLED",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

const OFFER_TRANSITIONS: Readonly<Record<OfferStatus, readonly OfferStatus[]>> = {
  ELIGIBLE: ["WAVE_1_OFFERED"],
  // UNFULFILLED from WAVE_1_OFFERED directly (not just via WAVE_2_OFFERED)
  // is Phase 6's discovery, not Phase 1's: when a sibling offer on the
  // same order gets ACCEPTED, every other still-open offer for that order
  // — wave 1 or wave 2 — becomes moot immediately, not just after a wave
  // escalation timeout.
  WAVE_1_OFFERED: ["ACCEPTED", "WAVE_2_OFFERED", "UNFULFILLED"],
  WAVE_2_OFFERED: ["ACCEPTED", "UNFULFILLED"],
  ACCEPTED: [],
  UNFULFILLED: [],
};

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

export class IllegalOfferTransitionError extends Error {
  constructor(from: OfferStatus, to: OfferStatus) {
    super(`Illegal offer transition: ${from} -> ${to}`);
    this.name = "IllegalOfferTransitionError";
  }
}

export function assertOfferTransition(from: OfferStatus, to: OfferStatus): void {
  if (!canTransitionOffer(from, to)) {
    throw new IllegalOfferTransitionError(from, to);
  }
}
