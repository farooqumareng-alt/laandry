import type { PrismaClient } from "@prisma/client";
import type { ComputedQuote, LaandryPreferences, OrderStatus, ServiceType } from "@laandry/domain";

import type {
  CreateBookingInput,
  OrderRecord,
  OrderRepository,
  PaymentRecord,
  QuoteRecord,
} from "./repository";

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createBooking(
    input: CreateBookingInput,
  ): Promise<{ order: OrderRecord; quote: QuoteRecord; payment: PaymentRecord }> {
    // One nested-write query — Order, its OrderItems, first Quote version,
    // and the (already-authorized) Payment all commit together or not at
    // all. Payment authorization itself happens before this call, in
    // routes.ts — this only persists its result.
    const created = await this.prisma.order.create({
      data: {
        customerId: input.customerId,
        addressId: input.addressId,
        service: input.service,
        status: "SCHEDULED",
        pickupWindowStart: input.pickupWindowStart,
        pickupWindowEnd: input.pickupWindowEnd,
        preferenceSnapshot: input.preferenceSnapshot,
        items: { create: input.items.map((item) => ({ description: item.description, quantity: item.quantity })) },
        quotes: {
          create: {
            version: 1,
            estimatedWeightMinLb: input.quote.estimatedWeightRangeLb?.[0] ?? null,
            estimatedWeightMaxLb: input.quote.estimatedWeightRangeLb?.[1] ?? null,
            lineItems: input.quote.lineItems,
            subtotalCents: input.quote.subtotalCents,
            promoDiscountCents: input.quote.promoDiscountCents,
            totalCents: input.quote.totalCents,
          },
        },
        payments: {
          create: {
            processorRef: input.payment.processorRef,
            amountCents: input.quote.totalCents,
            status: input.payment.status,
          },
        },
      },
      include: { items: true, quotes: true, payments: true },
    });

    const quote = created.quotes[0]!;
    const payment = created.payments[0]!;

    return {
      order: toOrderRecord(created),
      quote: toQuoteRecord(quote),
      payment,
    };
  }

  async getOrderById(id: string): Promise<OrderRecord | null> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    return order ? toOrderRecord(order) : null;
  }

  async listOrdersForCustomer(customerId: string): Promise<OrderRecord[]> {
    const orders = await this.prisma.order.findMany({ where: { customerId }, include: { items: true } });
    return orders.map(toOrderRecord);
  }

  async getLatestQuote(orderId: string): Promise<QuoteRecord | null> {
    const quote = await this.prisma.quote.findFirst({ where: { orderId }, orderBy: { version: "desc" } });
    return quote ? toQuoteRecord(quote) : null;
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderRecord> {
    const order = await this.prisma.order.update({ where: { id: orderId }, data: { status }, include: { items: true } });
    return toOrderRecord(order);
  }

  async addQuoteVersion(orderId: string, quote: ComputedQuote): Promise<QuoteRecord> {
    const latest = await this.prisma.quote.findFirst({ where: { orderId }, orderBy: { version: "desc" } });
    const created = await this.prisma.quote.create({
      data: {
        orderId,
        version: (latest?.version ?? 0) + 1,
        estimatedWeightMinLb: quote.estimatedWeightRangeLb?.[0] ?? null,
        estimatedWeightMaxLb: quote.estimatedWeightRangeLb?.[1] ?? null,
        lineItems: quote.lineItems,
        subtotalCents: quote.subtotalCents,
        promoDiscountCents: quote.promoDiscountCents,
        totalCents: quote.totalCents,
      },
    });
    return toQuoteRecord(created);
  }

  async addPayment(
    orderId: string,
    payment: { processorRef: string; amountCents: number; status: string },
  ): Promise<PaymentRecord> {
    return this.prisma.payment.create({ data: { orderId, ...payment } });
  }
}

// Minimal structural types for what we actually read off Prisma results,
// so this file doesn't need to import Prisma's generated payload types.
interface PrismaOrderShape {
  id: string;
  customerId: string;
  addressId: string;
  service: string;
  status: string;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  preferenceSnapshot: unknown;
  items: { description: string; quantity: number }[];
  createdAt: Date;
}

function toOrderRecord(order: PrismaOrderShape): OrderRecord {
  return {
    id: order.id,
    customerId: order.customerId,
    addressId: order.addressId,
    service: order.service as ServiceType,
    status: order.status as OrderRecord["status"],
    pickupWindowStart: order.pickupWindowStart,
    pickupWindowEnd: order.pickupWindowEnd,
    // Written by this same repository as a validated LaandryPreferences
    // object (see createBooking) — trusted here, not re-validated on read.
    preferenceSnapshot: order.preferenceSnapshot as LaandryPreferences,
    items: order.items,
    createdAt: order.createdAt,
  };
}

interface PrismaQuoteShape {
  id: string;
  orderId: string;
  version: number;
  estimatedWeightMinLb: number | null;
  estimatedWeightMaxLb: number | null;
  lineItems: unknown;
  subtotalCents: number;
  promoDiscountCents: number;
  totalCents: number;
  createdAt: Date;
}

function toQuoteRecord(quote: PrismaQuoteShape): QuoteRecord {
  return {
    id: quote.id,
    orderId: quote.orderId,
    version: quote.version,
    estimatedWeightRangeLb:
      quote.estimatedWeightMinLb !== null && quote.estimatedWeightMaxLb !== null
        ? [quote.estimatedWeightMinLb, quote.estimatedWeightMaxLb]
        : null,
    lineItems: quote.lineItems as QuoteRecord["lineItems"],
    subtotalCents: quote.subtotalCents,
    promoDiscountCents: quote.promoDiscountCents,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt,
  };
}
