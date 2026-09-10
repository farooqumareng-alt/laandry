import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assertOrderTransition,
  hasPermission,
  requiredProcessingStages,
  stagesSatisfyRequirement,
  PROCESSING_STAGES,
  INCIDENT_TYPES,
  type OrderStatus,
} from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import type { MatchingRepository } from "../matching/repository";
import type { OrderRecord, OrderRepository } from "../order/repository";
import type { ProviderRepository } from "../provider/repository";
import type { ProcessingRepository } from "./repository";

// Nothing physical has happened to the order yet at these two statuses —
// there's nothing a provider could be reporting an incident about.
const NO_INCIDENT_STATUSES: readonly OrderStatus[] = ["SCHEDULED", "PROVIDER_ASSIGNED", "CANCELLED"];

const confirmProcessingSchema = z.object({
  confirmedStages: z.array(z.enum(PROCESSING_STAGES)).max(PROCESSING_STAGES.length),
});

const reportIncidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  description: z.string().min(1).max(1000),
});

const resolveIncidentSchema = z.object({
  resolutionNote: z.string().min(1).max(1000),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const incidentParamSchema = z.object({ id: z.string().uuid(), incidentId: z.string().uuid() });

export interface ProcessingRoutesDeps {
  processingRepository: ProcessingRepository;
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
  providerRepository: ProviderRepository;
  matchingRepository: MatchingRepository;
  env: Env;
}

/**
 * Processing (BEING_CARED_FOR -> FINISHING -> READY_FOR_RETURN) and
 * incident reporting — docs/ARCHITECTURE.md §26/Phase 8, and the original
 * spec's "Display customer preferences prominently before processing...
 * Provider confirms required stages" / "don't force a false all-clear"
 * requirements. Confirming stages is a real server-side check against
 * requiredProcessingStages(order.preferenceSnapshot), not just a UI
 * checklist; reporting an incident never blocks or gates the order's own
 * transitions (see @laandry/domain incident.ts for why).
 */
export function processingRoutes(app: FastifyInstance, deps: ProcessingRoutesDeps) {
  const { processingRepository, orderRepository, customerRepository, providerRepository, matchingRepository, env } =
    deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asProvider = [auth, requireRole("provider")];

  /** Same "don't confirm existence to someone without access" 404 pattern as fulfillment/routes.ts requireAssignedOrder. */
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

  app.post("/provider/orders/:id/confirm-processing", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = confirmProcessingSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;

    try {
      assertOrderTransition(order.status, "FINISHING");
    } catch {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: order.status });
    }

    const required = requiredProcessingStages(order.preferenceSnapshot);
    if (!stagesSatisfyRequirement(required, body.data.confirmedStages)) {
      return reply.code(400).send({ error: "INCOMPLETE_STAGE_CONFIRMATION", requiredStages: required });
    }

    await processingRepository.recordProcessingConfirmation({
      orderId: order.id,
      confirmedStages: body.data.confirmedStages,
      confirmedByUserId: request.authUser!.id,
    });
    const finalOrder = await orderRepository.updateStatus(order.id, "FINISHING");

    return reply.send({ order: finalOrder });
  });

  app.post("/provider/orders/:id/ready-for-return", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;

    try {
      assertOrderTransition(order.status, "READY_FOR_RETURN");
    } catch {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: order.status });
    }

    // Deliberately not gated on open incidents — see @laandry/domain
    // incident.ts: reporting one never blocks proceeding. Surfaced here
    // instead of hidden, so nothing downstream has to rediscover it.
    const incidents = await processingRepository.listIncidentsForOrder(order.id);
    const openIncidentCount = incidents.filter((incident) => incident.status === "OPEN").length;

    const finalOrder = await orderRepository.updateStatus(order.id, "READY_FOR_RETURN");
    return reply.send({ order: finalOrder, openIncidentCount });
  });

  app.post("/provider/orders/:id/incidents", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = reportIncidentSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const order = await requireAssignedOrder(request, reply, params.data.id);
    if (!order) return;

    if (NO_INCIDENT_STATUSES.includes(order.status)) {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_INCIDENT", currentStatus: order.status });
    }

    const incident = await processingRepository.reportIncident({
      orderId: order.id,
      reportedByUserId: request.authUser!.id,
      type: body.data.type,
      description: body.data.description,
    });
    return reply.code(201).send({ incident });
  });

  // Customer (own order), the assigned provider, or staff with an "any"
  // grant on "order" can read this — same three-way check GET
  // /orders/:id/weight-verification already uses.
  app.get("/orders/:id/incidents", { preHandler: [auth] }, async (request, reply) => {
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

    const incidents = await processingRepository.listIncidentsForOrder(order.id);
    return reply.send({ incidents });
  });

  // Resolving is an ops action — the same "any"-scoped "order"/"write"
  // grant dispatch/ops_manager/admin/super_admin already have, reused
  // rather than adding a whole new permission resource for one action.
  app.post(
    "/orders/:id/incidents/:incidentId/resolve",
    { preHandler: [auth, requirePermissionOrderWriteAny] },
    async (request, reply) => {
      const params = incidentParamSchema.safeParse(request.params);
      const body = resolveIncidentSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }

      const incident = await processingRepository.getIncidentById(params.data.incidentId);
      if (!incident || incident.orderId !== params.data.id) {
        return reply.code(404).send({ error: "INCIDENT_NOT_FOUND" });
      }
      if (incident.status === "RESOLVED") {
        return reply.code(409).send({ error: "INCIDENT_ALREADY_RESOLVED" });
      }

      const resolved = await processingRepository.resolveIncident(incident.id, {
        resolvedByUserId: request.authUser!.id,
        resolutionNote: body.data.resolutionNote,
      });
      return reply.send({ incident: resolved });
    },
  );

  async function requirePermissionOrderWriteAny(request: FastifyRequest, reply: FastifyReply) {
    if (!request.authUser) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    if (!hasPermission(request.authUser.role, "order", "write")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
  }
}
