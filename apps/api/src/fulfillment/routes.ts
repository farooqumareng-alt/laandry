import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assertOrderTransition,
  computeQuote,
  exceedsWeightTolerance,
  hasPermission,
  resolveWeightTierForPounds,
  type ServiceType,
} from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import type { MatchingRepository } from "../matching/repository";
import type { OrderRecord, OrderRepository } from "../order/repository";
import type { PaymentProvider } from "../payments/provider";
import type { ProviderRepository } from "../provider/repository";
import type { FulfillmentRepository } from "./repository";

const WEIGHT_BASED_SERVICES: readonly ServiceType[] = ["EVERYDAY_LAUNDRY", "TRAVEL"];

const pickupSchema = z.object({
  bagCount: z.number().int().min(0).max(200).optional(),
  itemCount: z.number().int().min(0).max(500).optional(),
  method: z.enum(["qr", "pin", "signature"]),
});

const verifyWeightSchema = z.object({
  verifiedWeightLb: z.number().positive().max(1000),
});

const approveWeightSchema = z.object({
  paymentMethodToken: z.string().min(1),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export interface FulfillmentRoutesDeps {
  fulfillmentRepository: FulfillmentRepository;
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
  providerRepository: ProviderRepository;
  matchingRepository: MatchingRepository;
  paymentProvider: PaymentProvider;
  env: Env;
}

/**
 * Pickup and weight verification — docs/ARCHITECTURE.md §4/§9 and the
 * "PICKUP VERIFICATION" section of the original spec. Item-based orders
 * (garment-care, household) verify by item count at pickup and move
 * straight to BEING_CARED_FOR; weight-based orders (everyday laundry,
 * travel) stop at PICKED_UP until a separate verify-weight call resolves
 * — either immediately (within tolerance) or after the customer approves
 * a re-priced overage. Real PIN/signature capture and photo evidence
 * aren't built (no file-upload architecture yet, same gap as every prior
 * phase) — `method` here just records which approach the provider used,
 * not a cryptographic check against a stored secret.
 */
export function fulfillmentRoutes(app: FastifyInstance, deps: FulfillmentRoutesDeps) {
  const {
    fulfillmentRepository,
    orderRepository,
    customerRepository,
    providerRepository,
    matchingRepository,
    paymentProvider,
    env,
  } = deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asProvider = [auth, requireRole("provider")];

  /**
   * Resolves the order and confirms the *calling* provider (not just any
   * provider) is the one actually assigned to it — the same "don't
   * confirm existence to someone without access" 404 every other module
   * in this codebase uses, not a 403 that would tell an unassigned
   * provider the order exists at all.
   */
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

  app.post("/provider/orders/:id/pickup", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = pickupSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;

    try {
      assertOrderTransition(order.status, "PICKED_UP");
    } catch {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: order.status });
    }

    await fulfillmentRepository.recordPickup({ orderId: order.id, ...body.data });
    let finalOrder = await orderRepository.updateStatus(order.id, "PICKED_UP");

    // Item-based orders have nothing left to verify at pickup — their
    // items were already itemized at booking — so they move straight
    // through to BEING_CARED_FOR. Weight-based orders wait for a
    // separate verify-weight call.
    if (!WEIGHT_BASED_SERVICES.includes(order.service)) {
      assertOrderTransition("PICKED_UP", "BEING_CARED_FOR");
      finalOrder = await orderRepository.updateStatus(order.id, "BEING_CARED_FOR");
    }

    return reply.send({ order: finalOrder });
  });

  app.post("/provider/orders/:id/verify-weight", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = verifyWeightSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;

    if (!WEIGHT_BASED_SERVICES.includes(order.service)) {
      return reply.code(400).send({ error: "NOT_A_WEIGHT_BASED_ORDER" });
    }
    if (order.status !== "PICKED_UP") {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: order.status });
    }

    const latestQuote = await orderRepository.getLatestQuote(order.id);
    const estimatedMaxLb = latestQuote?.estimatedWeightRangeLb?.[1] ?? 0;
    const requiredApproval = exceedsWeightTolerance(estimatedMaxLb, body.data.verifiedWeightLb);

    const weightVerification = await fulfillmentRepository.recordWeightVerification({
      orderId: order.id,
      verifiedWeightLb: body.data.verifiedWeightLb,
      verifiedByUserId: request.authUser!.id,
      requiredApproval,
    });

    let finalOrder = order;
    if (!requiredApproval) {
      assertOrderTransition("PICKED_UP", "BEING_CARED_FOR");
      finalOrder = await orderRepository.updateStatus(order.id, "BEING_CARED_FOR");
    }

    return reply.send({ order: finalOrder, weightVerification });
  });

  // Customer (own order), the assigned provider, or staff with an "any"
  // grant on "order" can read this — same hasPermission check GET
  // /orders/:id already uses, reused here rather than duplicated.
  app.get("/orders/:id/weight-verification", { preHandler: auth }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });

    const role = request.authUser!.role;
    let authorized: boolean;
    if (role === "customer") {
      const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
      authorized = hasPermission(role, "order", "read", { isOwner: !!profile && profile.id === order.customerId });
    } else if (role === "provider") {
      const myProfile = await providerRepository.getProfileByUserId(request.authUser!.id);
      const assignment = await matchingRepository.getAssignmentForOrder(order.id);
      authorized = !!myProfile && !!assignment && assignment.providerId === myProfile.id;
    } else {
      authorized = hasPermission(role, "order", "read");
    }
    if (!authorized) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });

    const weightVerification = await fulfillmentRepository.getWeightVerification(order.id);
    return reply.send({ weightVerification });
  });

  async function resolveWeightOverage(request: FastifyRequest, reply: FastifyReply) {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "INVALID_INPUT" });
      return null;
    }
    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) {
      reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      return null;
    }
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile || profile.id !== order.customerId) {
      reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      return null;
    }
    const weightVerification = await fulfillmentRepository.getWeightVerification(order.id);
    if (!weightVerification || !weightVerification.requiredApproval || weightVerification.approvedByCustomer !== null) {
      reply.code(409).send({ error: "NO_PENDING_WEIGHT_APPROVAL" });
      return null;
    }
    return { order, weightVerification };
  }

  app.post("/orders/:id/approve-weight", { preHandler: [auth, requireRole("customer")] }, async (request, reply) => {
    const body = approveWeightSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const resolved = await resolveWeightOverage(request, reply);
    if (!resolved) return;
    const { order, weightVerification } = resolved;

    const newTier = resolveWeightTierForPounds(weightVerification.verifiedWeightLb);
    const newQuoteComputed = computeQuote(
      { service: order.service, weightTier: newTier } as Parameters<typeof computeQuote>[0],
      order.preferenceSnapshot,
    );
    const previousQuote = await orderRepository.getLatestQuote(order.id);
    const differenceCents = newQuoteComputed.totalCents - (previousQuote?.totalCents ?? 0);

    if (differenceCents > 0) {
      // No saved payment method exists yet (no card-on-file storage — see
      // docs/ARCHITECTURE.md §10), so the customer reconfirms one here,
      // same as at booking — never a hardcoded/assumed token.
      const authorization = await paymentProvider.authorize({
        customerId: order.customerId,
        amountCents: differenceCents,
        paymentMethodToken: body.data.paymentMethodToken,
      });
      if (authorization.status === "declined") {
        return reply.code(402).send({ error: "PAYMENT_DECLINED" });
      }
      await orderRepository.addPayment(order.id, {
        processorRef: authorization.processorRef,
        amountCents: differenceCents,
        status: authorization.status,
      });
    }

    const newQuote = await orderRepository.addQuoteVersion(order.id, newQuoteComputed);
    await fulfillmentRepository.setWeightApproval(order.id, true);
    assertOrderTransition("PICKED_UP", "BEING_CARED_FOR");
    const finalOrder = await orderRepository.updateStatus(order.id, "BEING_CARED_FOR");

    return reply.send({ order: finalOrder, quote: newQuote });
  });

  app.post("/orders/:id/decline-weight", { preHandler: [auth, requireRole("customer")] }, async (request, reply) => {
    const resolved = await resolveWeightOverage(request, reply);
    if (!resolved) return;

    // Deliberate MVP simplification: declining means the customer won't
    // be charged the difference, but the order still proceeds at the
    // original price — refusing laundry already in a provider's hands is
    // an operationally complex partial-fulfillment flow this phase
    // doesn't build. Documented here, not hidden.
    await fulfillmentRepository.setWeightApproval(resolved.order.id, false);
    assertOrderTransition("PICKED_UP", "BEING_CARED_FOR");
    const finalOrder = await orderRepository.updateStatus(resolved.order.id, "BEING_CARED_FOR");

    return reply.send({ order: finalOrder });
  });
}
