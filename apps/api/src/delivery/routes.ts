import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertOrderTransition, computeOrderEarningCents, hasPermission, REFERRAL_CREDIT_CENTS } from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { AuthRepository } from "../auth/repository";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import type { MatchingRepository } from "../matching/repository";
import { deliveryCompleteEmail } from "../notifications/templates";
import type { NotificationProvider } from "../notifications/provider";
import type { OrderRecord, OrderRepository } from "../order/repository";
import type { PaymentProvider } from "../payments/provider";
import type { PayoutsRepository } from "../payouts/repository";
import type { ProviderRepository } from "../provider/repository";
import type { ReferralsRepository } from "../referrals/repository";
import type { DeliveryRepository } from "./repository";

const completeDeliverySchema = z.object({ method: z.enum(["qr", "pin", "signature"]) });

// Not persisted anywhere — see the route's own comment. Accepted and
// echoed back only so the provider's own client can display what it sent.
const deliveryFailedSchema = z.object({ reason: z.string().max(500).optional() });

// A sanity ceiling, not a business rule from anywhere — same spirit as the
// bagCount/itemCount caps in fulfillment/routes.ts.
const tipSchema = z.object({
  amountCents: z.number().int().positive().max(50_000),
  paymentMethodToken: z.string().min(1),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export interface DeliveryRoutesDeps {
  deliveryRepository: DeliveryRepository;
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
  authRepository: AuthRepository;
  providerRepository: ProviderRepository;
  matchingRepository: MatchingRepository;
  paymentProvider: PaymentProvider;
  notificationProvider: NotificationProvider;
  payoutsRepository: PayoutsRepository;
  referralsRepository: ReferralsRepository;
  env: Env;
}

/**
 * Return delivery (READY_FOR_RETURN -> ON_THE_WAY -> DELIVERED, with a
 * DELIVERY_FAILED/retry detour), proof of delivery, tips, and the
 * post-delivery review — docs/ARCHITECTURE.md §4/§9 Phase 9, and the
 * original spec's customer journey: "... delivered -> tip/rate."
 * `DeliveryVerification`, `Tip`, and `Review` were all in the schema since
 * Phase 1 and unused until now, same as PickupVerification/
 * WeightVerification were before Phase 7.
 */
export function deliveryRoutes(app: FastifyInstance, deps: DeliveryRoutesDeps) {
  const {
    deliveryRepository,
    orderRepository,
    customerRepository,
    authRepository,
    providerRepository,
    matchingRepository,
    paymentProvider,
    notificationProvider,
    payoutsRepository,
    referralsRepository,
    env,
  } = deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asProvider = [auth, requireRole("provider")];
  const asCustomer = [auth, requireRole("customer")];

  /** Same "don't confirm existence to someone without access" 404 pattern as fulfillment/routes.ts and processing/routes.ts. */
  async function requireAssignedOrder(
    request: FastifyRequest,
    reply: FastifyReply,
    orderId: string,
  ): Promise<OrderRecord | null> {
    const order = await orderRepository.getOrderById(orderId);
    if (!order) {
      reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      return null;
    }
    const myProfile = await providerRepository.getProfileByUserId(request.authUser!.id);
    const assignment = await matchingRepository.getAssignmentForOrder(orderId);
    if (!myProfile || !assignment || assignment.providerId !== myProfile.id) {
      reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      return null;
    }
    return order;
  }

  /** Same pattern, for the customer side — only this order's own customer, never another one by guessing the id. */
  async function requireOwnedOrder(
    request: FastifyRequest,
    reply: FastifyReply,
    orderId: string,
  ): Promise<OrderRecord | null> {
    const order = await orderRepository.getOrderById(orderId);
    if (!order) {
      reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      return null;
    }
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile || profile.id !== order.customerId) {
      reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      return null;
    }
    return order;
  }

  /** The customer-own / assigned-provider / staff-any three-way read check every GET in this codebase since Phase 7 uses. */
  async function canReadOrder(request: FastifyRequest, order: OrderRecord): Promise<boolean> {
    const role = request.authUser!.role;
    if (role === "customer") {
      const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
      return hasPermission(role, "order", "read", { isOwner: !!profile && profile.id === order.customerId });
    }
    if (role === "provider") {
      const myProfile = await providerRepository.getProfileByUserId(request.authUser!.id);
      const assignment = await matchingRepository.getAssignmentForOrder(order.id);
      return !!myProfile && !!assignment && assignment.providerId === myProfile.id;
    }
    return hasPermission(role, "order", "read");
  }

  function transitionOrError(reply: FastifyReply, order: OrderRecord, to: Parameters<typeof assertOrderTransition>[1]) {
    try {
      assertOrderTransition(order.status, to);
      return true;
    } catch {
      reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: order.status });
      return false;
    }
  }

  app.post("/provider/orders/:id/start-delivery", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;
    if (!transitionOrError(reply, order, "ON_THE_WAY")) return;

    const finalOrder = await orderRepository.updateStatus(order.id, "ON_THE_WAY");
    return reply.send({ order: finalOrder });
  });

  app.post("/provider/orders/:id/complete-delivery", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = completeDeliverySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;
    if (!transitionOrError(reply, order, "DELIVERED")) return;

    const deliveryVerification = await deliveryRepository.recordDeliveryVerification({
      orderId: order.id,
      method: body.data.method,
    });
    const finalOrder = await orderRepository.updateStatus(order.id, "DELIVERED");

    const quote = await orderRepository.getLatestQuote(order.id);

    // The provider's earning for this order — best-effort in the sense
    // that a failure here doesn't revert a delivery that already
    // happened, but logged distinctly from the email below since a
    // missing ledger entry is a real financial-record gap, not just a
    // missed notification.
    try {
      const assignment = await matchingRepository.getAssignmentForOrder(order.id);
      if (assignment && quote) {
        await payoutsRepository.recordEarning({
          providerId: assignment.providerId,
          orderId: order.id,
          amountCents: computeOrderEarningCents(quote.totalCents),
        });
      }
    } catch (err) {
      request.log.error({ err, orderId: order.id }, "recording provider earning failed");
    }

    // The referral qualifying event — docs/ARCHITECTURE.md §7's
    // threat-model row on promo/referral abuse: credit is granted on
    // the referee's first order reaching DELIVERED, never at signup.
    // "First" isn't tracked as a separate counter — a PENDING referral
    // only ever exists once per referee (created at registration,
    // moved straight to QUALIFIED here), so its mere presence already
    // means "not yet qualified."
    try {
      const pendingReferral = await referralsRepository.getPendingReferralForReferee(order.customerId);
      if (pendingReferral) {
        await referralsRepository.qualifyReferral(pendingReferral.id);
        await referralsRepository.addCreditEntry({
          customerId: pendingReferral.referrerId,
          amountCents: REFERRAL_CREDIT_CENTS,
          reason: "referral_referrer",
          orderId: order.id,
        });
        await referralsRepository.addCreditEntry({
          customerId: pendingReferral.refereeId,
          amountCents: REFERRAL_CREDIT_CENTS,
          reason: "referral_referee",
          orderId: order.id,
        });
      }
    } catch (err) {
      request.log.error({ err, orderId: order.id }, "qualifying referral failed");
    }

    // Best-effort, same discipline as every other notification call site.
    try {
      const customerProfile = await customerRepository.getProfileById(order.customerId);
      const user = customerProfile ? await authRepository.findUserById(customerProfile.userId) : null;
      if (user && quote) {
        await notificationProvider.sendEmail({
          to: user.email,
          ...deliveryCompleteEmail({ totalCents: quote.totalCents, deliveryMethod: body.data.method }),
        });
      }
    } catch (err) {
      request.log.error({ err, orderId: order.id }, "delivery-complete email failed");
    }

    return reply.send({ order: finalOrder, deliveryVerification });
  });

  app.post("/provider/orders/:id/delivery-failed", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = deliveryFailedSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;
    if (!transitionOrError(reply, order, "DELIVERY_FAILED")) return;

    const finalOrder = await orderRepository.updateStatus(order.id, "DELIVERY_FAILED");
    // Deliberate MVP simplification: the reason is returned to the caller
    // but not persisted anywhere — there's no events/audit table wired up
    // in this codebase yet to hang it on (see docs/ARCHITECTURE.md §27's
    // note on AuditEvent/OrderStatusEvent being schema-only so far).
    return reply.send({ order: finalOrder, reason: body.data.reason ?? null });
  });

  app.post("/provider/orders/:id/retry-delivery", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;
    if (!transitionOrError(reply, order, "ON_THE_WAY")) return;

    const finalOrder = await orderRepository.updateStatus(order.id, "ON_THE_WAY");
    return reply.send({ order: finalOrder });
  });

  app.get("/orders/:id/delivery-verification", { preHandler: [auth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    if (!(await canReadOrder(request, order))) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });

    const deliveryVerification = await deliveryRepository.getDeliveryVerification(order.id);
    return reply.send({ deliveryVerification });
  });

  app.post("/orders/:id/tip", { preHandler: asCustomer }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = tipSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireOwnedOrder(request, reply, params.data.id);
    if (!order) return;
    if (order.status !== "DELIVERED") {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TIP", currentStatus: order.status });
    }

    const authorization = await paymentProvider.authorize({
      customerId: order.customerId,
      amountCents: body.data.amountCents,
      paymentMethodToken: body.data.paymentMethodToken,
    });
    if (authorization.status === "declined") {
      return reply.code(402).send({ error: "PAYMENT_DECLINED" });
    }
    await orderRepository.addPayment(order.id, {
      processorRef: authorization.processorRef,
      amountCents: body.data.amountCents,
      status: authorization.status,
    });
    const tip = await deliveryRepository.addTip({ orderId: order.id, amountCents: body.data.amountCents });

    // 100% of the tip — no platform cut, unlike the order-total split in
    // computeOrderEarningCents. Same "don't revert a real charge over a
    // ledger-recording failure" discipline as the earning recorded at
    // delivery-complete above.
    try {
      const assignment = await matchingRepository.getAssignmentForOrder(order.id);
      if (assignment) {
        await payoutsRepository.recordEarning({
          providerId: assignment.providerId,
          orderId: order.id,
          amountCents: body.data.amountCents,
        });
      }
    } catch (err) {
      request.log.error({ err, orderId: order.id }, "recording tip earning failed");
    }

    return reply.code(201).send({ tip });
  });

  app.get("/orders/:id/tips", { preHandler: [auth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    if (!(await canReadOrder(request, order))) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });

    const tips = await deliveryRepository.listTipsForOrder(order.id);
    return reply.send({ tips });
  });

  app.post("/orders/:id/review", { preHandler: asCustomer }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = reviewSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireOwnedOrder(request, reply, params.data.id);
    if (!order) return;
    if (order.status !== "DELIVERED") {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_REVIEW", currentStatus: order.status });
    }

    const existing = await deliveryRepository.getReviewForOrder(order.id);
    if (existing) {
      return reply.code(409).send({ error: "REVIEW_ALREADY_SUBMITTED" });
    }

    const review = await deliveryRepository.addReview({
      orderId: order.id,
      rating: body.data.rating,
      comment: body.data.comment ?? null,
    });
    return reply.code(201).send({ review });
  });

  app.get("/orders/:id/review", { preHandler: [auth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    if (!(await canReadOrder(request, order))) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });

    const review = await deliveryRepository.getReviewForOrder(order.id);
    return reply.send({ review });
  });

  // Admin console (Phase 10) — every review across every order, same
  // "any"-scoped order/read grant every other admin list route reuses.
  app.get("/admin/reviews", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "order", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const reviews = await deliveryRepository.listAllReviews();
    return reply.send({ reviews });
  });
}
