import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createPromotionSchema, hasPermission } from "@laandry/domain";

import { requireAuth } from "../auth/plugin";
import type { Env } from "../env";
import type { PromotionsRepository } from "./repository";

const idParamSchema = z.object({ id: z.string().uuid() });
const setActiveSchema = z.object({ active: z.boolean() });

export interface PromotionsRoutesDeps {
  promotionsRepository: PromotionsRepository;
  env: Env;
}

/**
 * Admin management of promo codes — docs/ARCHITECTURE.md §31. Reuses the
 * existing `pricing_rule` grant (finance: read-only; ops_manager, admin,
 * super_admin: read + write) rather than adding a new permission
 * resource — a promo code is, functionally, a pricing rule. Applying a
 * code at booking lives in order/routes.ts, not here — see
 * promotions/validate.ts, the shared check both quote-preview and the
 * real booking call.
 */
export function promotionsRoutes(app: FastifyInstance, deps: PromotionsRoutesDeps) {
  const { promotionsRepository, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);

  app.post("/admin/promotions", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "pricing_rule", "write")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const body = createPromotionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });

    const existing = await promotionsRepository.getPromotionByCode(body.data.code);
    if (existing) return reply.code(409).send({ error: "PROMO_CODE_ALREADY_EXISTS" });

    const promotion = await promotionsRepository.createPromotion(body.data);
    return reply.code(201).send({ promotion });
  });

  app.get("/admin/promotions", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "pricing_rule", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const promotions = await promotionsRepository.listAllPromotions();
    return reply.send({ promotions });
  });

  app.patch("/admin/promotions/:id", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "pricing_rule", "write")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const params = idParamSchema.safeParse(request.params);
    const body = setActiveSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const existing = await promotionsRepository.getPromotionById(params.data.id);
    if (!existing) return reply.code(404).send({ error: "PROMOTION_NOT_FOUND" });

    const promotion = await promotionsRepository.setPromotionActive(params.data.id, body.data.active);
    return reply.send({ promotion });
  });
}
