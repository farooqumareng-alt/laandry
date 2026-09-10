import type { ComputedQuote, LaandryPreferences, OrderStatus, ServiceType } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as auth and customer. */

export interface OrderItemRecord {
  description: string;
  quantity: number;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  addressId: string;
  service: ServiceType;
  status: OrderStatus;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  preferenceSnapshot: LaandryPreferences;
  items: OrderItemRecord[];
  createdAt: Date;
}

export interface QuoteRecord {
  id: string;
  orderId: string;
  version: number;
  estimatedWeightRangeLb: [number, number] | null;
  lineItems: ComputedQuote["lineItems"];
  subtotalCents: number;
  promoDiscountCents: number;
  totalCents: number;
  createdAt: Date;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  processorRef: string;
  amountCents: number;
  status: string;
  createdAt: Date;
}

export interface CreateBookingInput {
  customerId: string;
  addressId: string;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  service: ServiceType;
  items: OrderItemRecord[];
  preferenceSnapshot: LaandryPreferences;
  quote: ComputedQuote;
  payment: { processorRef: string; status: string };
}

export interface OrderRepository {
  /** Creates the Order, its OrderItems, the first Quote version, and the Payment record together. */
  createBooking(
    input: CreateBookingInput,
  ): Promise<{ order: OrderRecord; quote: QuoteRecord; payment: PaymentRecord }>;
  getOrderById(id: string): Promise<OrderRecord | null>;
  listOrdersForCustomer(customerId: string): Promise<OrderRecord[]>;
  /** Admin/ops-only — every order, optionally narrowed to one status. Newest first. */
  listAllOrders(filter?: { status?: OrderStatus }): Promise<OrderRecord[]>;
  getLatestQuote(orderId: string): Promise<QuoteRecord | null>;
  /** A dumb setter — the caller asserts the transition is legal (see @laandry/domain assertOrderTransition) before calling this, same discipline as ProviderRepository.updateStatus. */
  updateStatus(orderId: string, status: OrderStatus): Promise<OrderRecord>;

  /** Phase 7: re-pricing after a verified-weight overage. Version auto-increments from the current latest. */
  addQuoteVersion(orderId: string, quote: ComputedQuote): Promise<QuoteRecord>;
  /** Phase 7: the additional authorization for a weight-overage difference — a new ledger entry, never an edit to the original Payment row. */
  addPayment(orderId: string, payment: { processorRef: string; amountCents: number; status: string }): Promise<PaymentRecord>;
}
