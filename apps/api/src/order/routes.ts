import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  bookingServiceInputSchema,
  computeQuote,
  hasPermission,
  laandryPreferencesSchema,
  ORDER_STATUSES,
  type ServiceType,
} from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { AuthRepository } from "../auth/repository";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import { orderScheduledEmail } from "../notifications/templates";
import type { NotificationProvider } from "../notifications/provider";
import type { PaymentProvider } from "../payments/provider";
import type { OrderRepository } from "./repository";

const createOrderSchema = z
  .object({
    addressId: z.string().uuid(),
    pickupWindowStart: z.string().datetime(),
    pickupWindowEnd: z.string().datetime(),
    paymentMethodToken: z.string().min(1),
    preferenceOverrides: laandryPreferencesSchema.partial().optional(),
  })
  .and(bookingServiceInputSchema);

const quotePreviewSchema = z
  .object({ preferenceOverrides: laandryPreferencesSchema.partial().optional() })
  .and(bookingServiceInputSchema);

const idParamSchema = z.object({ id: z.string().uuid() });
const adminListOrdersQuerySchema = z.object({ status: z.enum(ORDER_STATUSES).optional() });

export interface OrderRoutesDeps {
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
  authRepository: AuthRepository;
  paymentProvider: PaymentProvider;
  notificationProvider: NotificationProvider;
  env: Env;
  /** Runs after a booking is created — dispatches wave-1 offers. Best-effort: a dispatch failure doesn't fail the booking, since the order and its payment are already valid; see app.ts. */
  onOrderBooked?: (input: {
    orderId: string;
    service: ServiceType;
    postalCode: string;
    pickupWindowStart: Date;
    pickupWindowEnd: Date;
  }) => Promise<void>;
}

/**
 * The booking flow — docs/ARCHITECTURE.md §4/§9/§10, gated on "the server
 * never trusts a client-supplied price." The client sends only
 * addressId + pickup window + service/weight-or-items + a payment method
 * token; computeQuote() (packages/domain) is the only thing that ever
 * produces a price, and it runs here, server-side, from those inputs —
 * there is no field in the request the client could set to change the
 * result. See order.test.ts for the test that actually proves this.
 */
export function orderRoutes(app: FastifyInstance, deps: OrderRoutesDeps) {
  const { orderRepository, customerRepository, authRepository, paymentProvider, notificationProvider, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);

  // No persistence, no payment — just runs the same computeQuote() the
  // booking submission will, so Review can show a real number before the
  // customer commits to anything.
  app.post("/quote-preview", { preHandler: [auth, requireRole("customer")] }, async (request, reply) => {
    const body = quotePreviewSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) {
      return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });
    }
    const preferenceSnapshot = { ...profile.preferences, ...body.data.preferenceOverrides };
    return reply.send(computeQuote(body.data, preferenceSnapshot));
  });

  app.post("/orders", { preHandler: [auth, requireRole("customer")] }, async (request, reply) => {
    const body = createOrderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }

    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) {
      return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });
    }

    const address = await customerRepository.getAddress(body.data.addressId);
    if (!address || address.customerId !== profile.id) {
      // Same reasoning as customer/routes.ts: don't confirm another
      // customer's address id is even valid.
      return reply.code(404).send({ error: "ADDRESS_NOT_FOUND" });
    }

    const preferenceSnapshot = { ...profile.preferences, ...body.data.preferenceOverrides };
    const quote = computeQuote(body.data, preferenceSnapshot);

    const authorization = await paymentProvider.authorize({
      customerId: profile.id,
      amountCents: quote.totalCents,
      paymentMethodToken: body.data.paymentMethodToken,
    });
    if (authorization.status === "declined") {
      return reply.code(402).send({ error: "PAYMENT_DECLINED" });
    }

    const items = body.data.service === "FORMAL_SPECIAL_CARE" || body.data.service === "BEDDING_HOUSEHOLD" ? body.data.items : [];

    const pickupWindowStart = new Date(body.data.pickupWindowStart);
    const pickupWindowEnd = new Date(body.data.pickupWindowEnd);

    const { order, quote: savedQuote, payment } = await orderRepository.createBooking({
      customerId: profile.id,
      addressId: address.id,
      pickupWindowStart,
      pickupWindowEnd,
      service: body.data.service,
      items,
      preferenceSnapshot,
      quote,
      payment: { processorRef: authorization.processorRef, status: authorization.status },
    });

    // Best-effort: the order and its payment authorization are already
    // valid at this point, so a dispatch failure shouldn't fail the
    // booking response — it means offers didn't go out yet, which is
    // recoverable, not "this order doesn't exist."
    try {
      await deps.onOrderBooked?.({
        orderId: order.id,
        service: order.service,
        postalCode: address.postalCode,
        pickupWindowStart,
        pickupWindowEnd,
      });
    } catch (err) {
      request.log.error({ err, orderId: order.id }, "dispatch failed after booking");
    }

    // Best-effort, same as dispatch above — a failed or skipped email
    // never reverts or fails the booking. Awaited (not fire-and-forget)
    // because this runs on Vercel's serverless functions, where a
    // detached promise left running after the response is sent isn't
    // guaranteed to finish before the function is torn down.
    try {
      const user = await authRepository.findUserById(request.authUser!.id);
      if (user) {
        await notificationProvider.sendEmail({
          to: user.email,
          ...orderScheduledEmail({
            service: order.service,
            pickupWindowStart,
            pickupWindowEnd,
            lineItems: savedQuote.lineItems,
            totalCents: savedQuote.totalCents,
          }),
        });
      }
    } catch (err) {
      request.log.error({ err, orderId: order.id }, "order-scheduled email failed");
    }

    return reply.code(201).send({ order, quote: savedQuote, payment });
  });

  app.get("/orders", { preHandler: [auth, requireRole("customer")] }, async (request, reply) => {
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) {
      return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });
    }
    const orders = await orderRepository.listOrdersForCustomer(profile.id);
    return reply.send({ orders });
  });

  app.get("/orders/:id", { preHandler: [auth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) {
      return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    }

    // "own" for a customer means this order's customerId is *their*
    // CustomerProfile id; every staff role's grant on "order"/"read" is
    // scope "any" (§5), so isOwner is irrelevant for them.
    let isOwner = false;
    if (request.authUser!.role === "customer") {
      const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
      isOwner = !!profile && profile.id === order.customerId;
    }

    if (!hasPermission(request.authUser!.role, "order", "read", { isOwner })) {
      // 404, not 403 — never confirm to an unauthorized peer that this
      // order id exists. See docs/ARCHITECTURE.md §16.
      return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    }

    const quote = await orderRepository.getLatestQuote(order.id);
    return reply.send({ order, quote });
  });

  // Admin/ops console (Phase 10) — the same "any"-scoped order/read grant
  // GET /orders/:id already checks, just without an ownership concept
  // since this isn't scoped to one customer. A customer or provider has
  // only an "own" grant, so hasPermission with no isOwner override
  // correctly returns false for both — this route is staff-only by
  // construction, not by a separate role list to keep in sync.
  app.get("/admin/orders", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "order", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const query = adminListOrdersQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const orders = await orderRepository.listAllOrders({ status: query.data.status });
    return reply.send({ orders });
  });
}
