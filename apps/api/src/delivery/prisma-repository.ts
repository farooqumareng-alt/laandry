import type { PrismaClient } from "@prisma/client";

import type { DeliveryRepository, DeliveryVerificationRecord, ReviewRecord, TipRecord } from "./repository";

export class PrismaDeliveryRepository implements DeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordDeliveryVerification(input: { orderId: string; method: string }): Promise<DeliveryVerificationRecord> {
    return this.prisma.deliveryVerification.create({ data: input });
  }

  async getDeliveryVerification(orderId: string): Promise<DeliveryVerificationRecord | null> {
    return this.prisma.deliveryVerification.findUnique({ where: { orderId } });
  }

  async addTip(input: { orderId: string; amountCents: number }): Promise<TipRecord> {
    return this.prisma.tip.create({ data: input });
  }

  async listTipsForOrder(orderId: string): Promise<TipRecord[]> {
    return this.prisma.tip.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  }

  async addReview(input: { orderId: string; rating: number; comment: string | null }): Promise<ReviewRecord> {
    return this.prisma.review.create({ data: input });
  }

  async getReviewForOrder(orderId: string): Promise<ReviewRecord | null> {
    return this.prisma.review.findUnique({ where: { orderId } });
  }
}
