/**
 * Provider onboarding state machine — docs/ARCHITECTURE.md "PROVIDER
 * QUALIFICATION". Mirrors the Order/Offer state machines in order.ts and
 * offer.ts: this is the single source of truth for which transitions are
 * legal, enforced server-side in apps/api/src/provider — never settable
 * directly by a client. A brand-new provider starts at
 * APPLICATION_STARTED and cannot process a customer's laundry (i.e. accept
 * an offer, Phase 6) until they reach ACTIVE.
 */

export const PROVIDER_STATUSES = [
  "APPLICATION_STARTED",
  "IDENTITY_PENDING",
  "REVIEW_PENDING",
  "TRAINING_PENDING",
  "APPROVED",
  "ACTIVE",
  "PAUSED",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const TERMINAL_PROVIDER_STATUSES: ReadonlySet<ProviderStatus> = new Set(["DEACTIVATED"]);

const PROVIDER_STATUS_TRANSITIONS: Readonly<Record<ProviderStatus, readonly ProviderStatus[]>> = {
  // Identity-document verification and training modules aren't built yet
  // (no file-upload/photo architecture until a later phase) — a Phase 5
  // application can go straight to REVIEW_PENDING once it has the
  // structured data (capabilities + service area) a human reviewer needs.
  APPLICATION_STARTED: ["IDENTITY_PENDING", "REVIEW_PENDING", "DEACTIVATED"],
  IDENTITY_PENDING: ["REVIEW_PENDING", "DEACTIVATED"],
  REVIEW_PENDING: ["TRAINING_PENDING", "APPROVED", "DEACTIVATED"],
  TRAINING_PENDING: ["APPROVED", "DEACTIVATED"],
  APPROVED: ["ACTIVE", "DEACTIVATED"],
  ACTIVE: ["PAUSED", "SUSPENDED", "DEACTIVATED"],
  PAUSED: ["ACTIVE", "DEACTIVATED"],
  SUSPENDED: ["ACTIVE", "DEACTIVATED"],
  DEACTIVATED: [],
};

export function canTransitionProviderStatus(from: ProviderStatus, to: ProviderStatus): boolean {
  return PROVIDER_STATUS_TRANSITIONS[from].includes(to);
}

export class IllegalProviderStatusTransitionError extends Error {
  constructor(from: ProviderStatus, to: ProviderStatus) {
    super(`Illegal provider status transition: ${from} -> ${to}`);
    this.name = "IllegalProviderStatusTransitionError";
  }
}

export function assertProviderStatusTransition(from: ProviderStatus, to: ProviderStatus): void {
  if (!canTransitionProviderStatus(from, to)) {
    throw new IllegalProviderStatusTransitionError(from, to);
  }
}

/** A provider can be offered/accept work (Phase 6) only in this status. */
export function isProviderEligibleForWork(status: ProviderStatus): boolean {
  return status === "ACTIVE";
}
