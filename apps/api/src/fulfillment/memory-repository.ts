import { randomUUID } from "node:crypto";

import type {
  FulfillmentRepository,
  PickupVerificationRecord,
  WeightVerificationRecord,
} from "./repository";

export class InMemoryFulfillmentRepository implements FulfillmentRepository {
  private pickupsByOrderId = new Map<string, PickupVerificationRecord>();
  private weightsByOrderId = new Map<string, WeightVerificationRecord>();

  async recordPickup(input: {
    orderId: string;
    bagCount?: number;
    itemCount?: number;
    method: string;
  }): Promise<PickupVerificationRecord> {
    const record: PickupVerificationRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      bagCount: input.bagCount ?? null,
      itemCount: input.itemCount ?? null,
      method: input.method,
      verifiedAt: new Date(),
    };
    this.pickupsByOrderId.set(input.orderId, record);
    return record;
  }

  async getPickupVerification(orderId: string): Promise<PickupVerificationRecord | null> {
    return this.pickupsByOrderId.get(orderId) ?? null;
  }

  async recordWeightVerification(input: {
    orderId: string;
    verifiedWeightLb: number;
    verifiedByUserId: string;
    requiredApproval: boolean;
  }): Promise<WeightVerificationRecord> {
    const record: WeightVerificationRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      verifiedWeightLb: input.verifiedWeightLb,
      verifiedByUserId: input.verifiedByUserId,
      requiredApproval: input.requiredApproval,
      approvedByCustomer: null,
      createdAt: new Date(),
    };
    this.weightsByOrderId.set(input.orderId, record);
    return record;
  }

  async getWeightVerification(orderId: string): Promise<WeightVerificationRecord | null> {
    return this.weightsByOrderId.get(orderId) ?? null;
  }

  async setWeightApproval(orderId: string, approved: boolean): Promise<WeightVerificationRecord> {
    const existing = this.weightsByOrderId.get(orderId);
    if (!existing) throw new Error(`No weight verification for order: ${orderId}`);
    const updated = { ...existing, approvedByCustomer: approved };
    this.weightsByOrderId.set(orderId, updated);
    return updated;
  }
}
