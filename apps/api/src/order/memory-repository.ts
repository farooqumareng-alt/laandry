import { randomUUID } from "node:crypto";
import type { OrderStatus } from "@laandry/domain";

import type {
  CreateBookingInput,
  OrderRecord,
  OrderRepository,
  PaymentRecord,
  QuoteRecord,
} from "./repository";

export class InMemoryOrderRepository implements OrderRepository {
  private ordersById = new Map<string, OrderRecord>();
  private quotesByOrderId = new Map<string, QuoteRecord[]>();
  private paymentsByOrderId = new Map<string, PaymentRecord>();

  async createBooking(
    input: CreateBookingInput,
  ): Promise<{ order: OrderRecord; quote: QuoteRecord; payment: PaymentRecord }> {
    const order: OrderRecord = {
      id: randomUUID(),
      customerId: input.customerId,
      addressId: input.addressId,
      service: input.service,
      status: "SCHEDULED",
      pickupWindowStart: input.pickupWindowStart,
      pickupWindowEnd: input.pickupWindowEnd,
      preferenceSnapshot: input.preferenceSnapshot,
      items: input.items,
      createdAt: new Date(),
    };
    const quote: QuoteRecord = {
      id: randomUUID(),
      orderId: order.id,
      version: 1,
      estimatedWeightRangeLb: input.quote.estimatedWeightRangeLb,
      lineItems: input.quote.lineItems,
      subtotalCents: input.quote.subtotalCents,
      promoDiscountCents: input.quote.promoDiscountCents,
      totalCents: input.quote.totalCents,
      createdAt: new Date(),
    };
    const payment: PaymentRecord = {
      id: randomUUID(),
      orderId: order.id,
      processorRef: input.payment.processorRef,
      amountCents: input.quote.totalCents,
      status: input.payment.status,
      createdAt: new Date(),
    };

    this.ordersById.set(order.id, order);
    this.quotesByOrderId.set(order.id, [quote]);
    this.paymentsByOrderId.set(order.id, payment);

    return { order, quote, payment };
  }

  async getOrderById(id: string): Promise<OrderRecord | null> {
    return this.ordersById.get(id) ?? null;
  }

  async listOrdersForCustomer(customerId: string): Promise<OrderRecord[]> {
    return [...this.ordersById.values()].filter((o) => o.customerId === customerId);
  }

  async getLatestQuote(orderId: string): Promise<QuoteRecord | null> {
    const quotes = this.quotesByOrderId.get(orderId);
    if (!quotes || quotes.length === 0) return null;
    return quotes.reduce((latest, q) => (q.version > latest.version ? q : latest));
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderRecord> {
    const order = this.ordersById.get(orderId);
    if (!order) throw new Error(`No such order: ${orderId}`);
    const updated = { ...order, status };
    this.ordersById.set(orderId, updated);
    return updated;
  }
}
