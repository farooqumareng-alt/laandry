/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface DeliveryVerificationRecord {
  id: string;
  orderId: string;
  method: string; // qr, pin, signature — same convention as PickupVerification, not a cryptographic check
  verifiedAt: Date;
}

export interface TipRecord {
  id: string;
  orderId: string;
  amountCents: number;
  createdAt: Date;
}

export interface ReviewRecord {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface DeliveryRepository {
  recordDeliveryVerification(input: { orderId: string; method: string }): Promise<DeliveryVerificationRecord>;
  getDeliveryVerification(orderId: string): Promise<DeliveryVerificationRecord | null>;

  /** Every tip is its own ledger entry — deliberately not one row updated in place, matching docs/ARCHITECTURE.md §10 ("immutable ledger entry, not an overwritten balance"). The schema allows more than one per order (a second thank-you tip later is legitimate), so there's no uniqueness check here. */
  addTip(input: { orderId: string; amountCents: number }): Promise<TipRecord>;
  listTipsForOrder(orderId: string): Promise<TipRecord[]>;

  addReview(input: { orderId: string; rating: number; comment: string | null }): Promise<ReviewRecord>;
  getReviewForOrder(orderId: string): Promise<ReviewRecord | null>;
}
