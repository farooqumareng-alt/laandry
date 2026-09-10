import type { PrismaClient } from "@prisma/client";

import type {
  FulfillmentRepository,
  PickupVerificationRecord,
  WeightVerificationRecord,
} from "./repository";

export class PrismaFulfillmentRepository implements FulfillmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordPickup(input: {
    orderId: string;
    bagCount?: number;
    itemCount?: number;
    method: string;
  }): Promise<PickupVerificationRecord> {
    return this.prisma.pickupVerification.create({
      data: {
        orderId: input.orderId,
        bagCount: input.bagCount ?? null,
        itemCount: input.itemCount ?? null,
        method: input.method,
      },
    });
  }

  async getPickupVerification(orderId: string): Promise<PickupVerificationRecord | null> {
    return this.prisma.pickupVerification.findUnique({ where: { orderId } });
  }

  async recordWeightVerification(input: {
    orderId: string;
    verifiedWeightLb: number;
    verifiedByUserId: string;
    requiredApproval: boolean;
  }): Promise<WeightVerificationRecord> {
    return this.prisma.weightVerification.create({
      data: {
        orderId: input.orderId,
        verifiedWeightLb: input.verifiedWeightLb,
        verifiedByUserId: input.verifiedByUserId,
        requiredApproval: input.requiredApproval,
      },
    });
  }

  async getWeightVerification(orderId: string): Promise<WeightVerificationRecord | null> {
    return this.prisma.weightVerification.findUnique({ where: { orderId } });
  }

  async setWeightApproval(orderId: string, approved: boolean): Promise<WeightVerificationRecord> {
    return this.prisma.weightVerification.update({
      where: { orderId },
      data: { approvedByCustomer: approved },
    });
  }
}
