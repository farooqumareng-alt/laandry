/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface PickupVerificationRecord {
  id: string;
  orderId: string;
  bagCount: number | null;
  itemCount: number | null;
  method: string;
  verifiedAt: Date;
}

export interface WeightVerificationRecord {
  id: string;
  orderId: string;
  verifiedWeightLb: number;
  verifiedByUserId: string;
  requiredApproval: boolean;
  approvedByCustomer: boolean | null;
  createdAt: Date;
}

export interface FulfillmentRepository {
  recordPickup(input: {
    orderId: string;
    bagCount?: number;
    itemCount?: number;
    method: string;
  }): Promise<PickupVerificationRecord>;
  getPickupVerification(orderId: string): Promise<PickupVerificationRecord | null>;

  recordWeightVerification(input: {
    orderId: string;
    verifiedWeightLb: number;
    verifiedByUserId: string;
    requiredApproval: boolean;
  }): Promise<WeightVerificationRecord>;
  getWeightVerification(orderId: string): Promise<WeightVerificationRecord | null>;
  /** A dumb setter, same discipline as every other repository's status setters — the route handler decides whether approval is legal to record before calling this. */
  setWeightApproval(orderId: string, approved: boolean): Promise<WeightVerificationRecord>;
}
