import type { FastifyInstance } from "fastify";
import { computeCreditBalanceCents, hasPermission } from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import type { ReferralsRepository } from "./repository";

export interface ReferralsRoutesDeps {
  referralsRepository: ReferralsRepository;
  customerRepository: CustomerRepository;
  env: Env;
}

/**
 * Referral codes and the account-credit ledger they feed —
 * docs/ARCHITECTURE.md §32. The qualifying-event trigger (a referee's
 * first order reaching DELIVERED) lives in delivery/routes.ts, not
 * here — this module owns the code itself and read access to the
 * ledger, same split as promotions/validate.ts owning the "is this
 * usable" check while order/routes.ts owns the moment of actually
 * charging.
 */
export function referralsRoutes(app: FastifyInstance, deps: ReferralsRoutesDeps) {
  const { referralsRepository, customerRepository, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asCustomer = [auth, requireRole("customer")];

  app.get("/me/referral-code", { preHandler: asCustomer }, async (request, reply) => {
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });

    const code = await customerRepository.getOrCreateReferralCode(profile.id);
    return reply.send({ code });
  });

  app.get("/me/credit", { preHandler: asCustomer }, async (request, reply) => {
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });

    const entries = await referralsRepository.listCreditEntriesForCustomer(profile.id);
    return reply.send({ entries, balanceCents: computeCreditBalanceCents(entries) });
  });

  // Admin visibility — reuses the any-scoped order/read grant every
  // other operational-visibility admin list route in this codebase
  // reuses (incidents, reviews), rather than a new permission resource
  // for one read-only list.
  app.get("/admin/referrals", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "order", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const referrals = await referralsRepository.listAllReferrals();
    return reply.send({ referrals });
  });
}
