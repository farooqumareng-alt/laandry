import type { OfferStatus, ServiceType } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface ProviderOfferRecord {
  id: string;
  orderId: string;
  providerId: string;
  status: OfferStatus;
  wave: number;
  offeredAt: Date | null;
  respondedAt: Date | null;
}

export interface ProviderAssignmentRecord {
  id: string;
  orderId: string;
  offerId: string;
  providerId: string;
  acceptedAt: Date;
}

export interface ProviderOfferSummary {
  offer: ProviderOfferRecord;
  service: ServiceType;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  /** e.g. "Springfield, IL · 627**" — never the street address. See docs/ARCHITECTURE.md §11: exact pickup info is revealed only after assignment. */
  approximateArea: string;
}

export interface DispatchInput {
  orderId: string;
  service: ServiceType;
  postalCode: string;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
}

export type AcceptOfferResult = { won: true; assignment: ProviderAssignmentRecord } | { won: false };

export interface MatchingRepository {
  /** Finds eligible ACTIVE providers and creates a wave-1 ProviderOffer for each. Wave 2 / escalation needs a job scheduler this phase doesn't build — see routes.ts. */
  dispatchOrder(input: DispatchInput): Promise<ProviderOfferRecord[]>;
  listOffersForProvider(providerId: string): Promise<ProviderOfferSummary[]>;
  getOffer(id: string): Promise<ProviderOfferRecord | null>;
  /**
   * The one method that matters most this phase: a single atomic
   * operation — conditional offer update, assignment creation, order
   * transition, and marking sibling offers moot — that only ever produces
   * exactly one winner for a given order no matter how many providers
   * call it at once. See prisma-repository.ts and memory-repository.ts
   * for how each implementation gets that guarantee.
   */
  tryAcceptOffer(offerId: string, providerId: string): Promise<AcceptOfferResult>;
  getAssignmentForOrder(orderId: string): Promise<ProviderAssignmentRecord | null>;
}
