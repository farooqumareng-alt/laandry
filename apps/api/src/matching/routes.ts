import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth/plugin";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import type { OrderRepository } from "../order/repository";
import type { ProviderRepository } from "../provider/repository";
import type { MatchingRepository } from "./repository";

const idParamSchema = z.object({ id: z.string().uuid() });

export interface MatchingRoutesDeps {
  matchingRepository: MatchingRepository;
  providerRepository: ProviderRepository;
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
  env: Env;
}

/**
 * Offers and acceptance — docs/ARCHITECTURE.md §4/§7/§11, gated on the
 * concurrency test in matching.test.ts. Dispatch itself (creating the
 * wave-1 offers) is triggered from order/routes.ts's booking flow via the
 * onOrderBooked callback in app.ts — nothing here creates an offer, this
 * module only lists and resolves them.
 */
export function matchingRoutes(app: FastifyInstance, deps: MatchingRoutesDeps) {
  const { matchingRepository, providerRepository, orderRepository, customerRepository, env } = deps;
  const asProvider = [requireAuth(env.JWT_SECRET), requireRole("provider")];

  app.get("/provider/offers", { preHandler: asProvider }, async (request, reply) => {
    const profile = await providerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });
    const offers = await matchingRepository.listOffersForProvider(profile.id);
    return reply.send({ offers });
  });

  app.post("/provider/offers/:id/accept", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const profile = await providerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });

    const result = await matchingRepository.tryAcceptOffer(params.data.id, profile.id);
    if (!result.won) {
      // Covers three distinct reasons — offer doesn't exist, belongs to
      // someone else, or someone already won it — deliberately collapsed
      // into one response so a provider probing offer ids learns nothing
      // beyond "not available to you."
      return reply.code(409).send({ error: "OFFER_NO_LONGER_AVAILABLE" });
    }
    return reply.send({ assignment: result.assignment });
  });

  // Full order detail, including the exact address — only once this
  // provider is the assigned provider for the order. See docs/ARCHITECTURE.md
  // §11: exact pickup info is withheld until assignment, never before.
  app.get("/provider/orders/:id", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const profile = await providerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });

    const order = await orderRepository.getOrderById(params.data.id);
    if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });

    const assignment = await matchingRepository.getAssignmentForOrder(order.id);
    if (!assignment || assignment.providerId !== profile.id) {
      // Same "don't confirm existence" reasoning as every other
      // ownership check in this codebase — a provider who was never
      // assigned this order gets the same 404 as a nonexistent order id.
      return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    }

    const address = await customerRepository.getAddress(order.addressId);
    return reply.send({ order, address });
  });
}
