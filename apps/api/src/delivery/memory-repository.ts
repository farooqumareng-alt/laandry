import { randomUUID } from "node:crypto";

import type { DeliveryRepository, DeliveryVerificationRecord, ReviewRecord, TipRecord } from "./repository";

export class InMemoryDeliveryRepository implements DeliveryRepository {
  private deliveriesByOrderId = new Map<string, DeliveryVerificationRecord>();
  private tipsByOrderId = new Map<string, TipRecord[]>();
  private reviewsByOrderId = new Map<string, ReviewRecord>();

  async recordDeliveryVerification(input: { orderId: string; method: string }): Promise<DeliveryVerificationRecord> {
    const record: DeliveryVerificationRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      method: input.method,
      verifiedAt: new Date(),
    };
    this.deliveriesByOrderId.set(input.orderId, record);
    return record;
  }

  async getDeliveryVerification(orderId: string): Promise<DeliveryVerificationRecord | null> {
    return this.deliveriesByOrderId.get(orderId) ?? null;
  }

  async addTip(input: { orderId: string; amountCents: number }): Promise<TipRecord> {
    const record: TipRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      amountCents: input.amountCents,
      createdAt: new Date(),
    };
    const existing = this.tipsByOrderId.get(input.orderId) ?? [];
    existing.push(record);
    this.tipsByOrderId.set(input.orderId, existing);
    return record;
  }

  async listTipsForOrder(orderId: string): Promise<TipRecord[]> {
    return this.tipsByOrderId.get(orderId) ?? [];
  }

  async addReview(input: { orderId: string; rating: number; comment: string | null }): Promise<ReviewRecord> {
    const record: ReviewRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      rating: input.rating,
      comment: input.comment,
      createdAt: new Date(),
    };
    this.reviewsByOrderId.set(input.orderId, record);
    return record;
  }

  async getReviewForOrder(orderId: string): Promise<ReviewRecord | null> {
    return this.reviewsByOrderId.get(orderId) ?? null;
  }

  async listAllReviews(): Promise<ReviewRecord[]> {
    return [...this.reviewsByOrderId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
