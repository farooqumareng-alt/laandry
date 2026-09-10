import type { FastifyInstance } from "fastify";
import { hasPermission } from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { Env } from "../env";
import type { ProviderRepository } from "../provider/repository";
import type { PayoutProvider } from "./payout-provider";
import type { PayoutsRepository } from "./repository";

export interface PayoutsRoutesDeps {
  payoutsRepository: PayoutsRepository;
  providerRepository: ProviderRepository;
  payoutProvider: PayoutProvider;
  env: Env;
}

/**
 * Provider earnings and payouts — docs/ARCHITECTURE.md §10 and §28's
 * flagged gap ("ProviderEarning/Payout have a schema but no route
 * touching them anywhere"). `recordEarning` is called from
 * delivery/routes.ts at order-delivery (the 70/30 split from
 * @laandry/domain's computeOrderEarningCents) and at tip-add (100% of
 * the tip, no platform cut) — this module owns the ledger and the
 * payout-run action, not the earning trigger points themselves.
 *
 * The payout run is a real, admin-triggered batch action, not a
 * per-provider button: it groups every unpaid earning by provider and
 * pays each provider once. Not fully race-proofed against two
 * concurrent runs (the unpaid-earnings read and the per-provider claim
 * aren't one atomic transaction spanning every provider) — an accepted
 * gap for an infrequent, single-operator admin action, not a
 * customer-facing race like matching's offer-accept.
 */
export function payoutsRoutes(app: FastifyInstance, deps: PayoutsRoutesDeps) {
  const { payoutsRepository, providerRepository, payoutProvider, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asProvider = [auth, requireRole("provider")];

  function summarize(earnings: { amountCents: number; payoutId: string | null }[]) {
    const totalEarnedCents = earnings.reduce((sum, e) => sum + e.amountCents, 0);
    const pendingCents = earnings.filter((e) => e.payoutId === null).reduce((sum, e) => sum + e.amountCents, 0);
    return { totalEarnedCents, pendingCents, paidOutCents: totalEarnedCents - pendingCents };
  }

  app.get("/provider/earnings", { preHandler: asProvider }, async (request, reply) => {
    const profile = await providerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });

    const earnings = await payoutsRepository.listEarningsForProvider(profile.id);
    return reply.send({ earnings, summary: summarize(earnings) });
  });

  app.get("/provider/payouts", { preHandler: asProvider }, async (request, reply) => {
    const profile = await providerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });

    const payouts = await payoutsRepository.listPayoutsForProvider(profile.id);
    return reply.send({ payouts });
  });

  // Admin console — same any-scoped payout/read grant GET /provider/...
  // above reuses in "own" form; this is the staff-wide list.
  app.get("/admin/earnings", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "payout", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const earnings = await payoutsRepository.listAllEarnings();
    return reply.send({ earnings, summary: summarize(earnings) });
  });

  app.get("/admin/payouts", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "payout", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const payouts = await payoutsRepository.listAllPayouts();
    return reply.send({ payouts });
  });

  app.post("/admin/payouts/run", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "payout", "write")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }

    const unpaid = await payoutsRepository.listUnpaidEarnings();
    const byProvider = new Map<string, typeof unpaid>();
    for (const earning of unpaid) {
      const list = byProvider.get(earning.providerId) ?? [];
      list.push(earning);
      byProvider.set(earning.providerId, list);
    }

    const payouts = [];
    for (const [providerId, earnings] of byProvider) {
      const amountCents = earnings.reduce((sum, e) => sum + e.amountCents, 0);
      if (amountCents <= 0) continue; // never a $0 payout for an all-refunded/zeroed batch
      const result = await payoutProvider.pay({ providerId, amountCents });
      const payout = await payoutsRepository.createPayout({
        providerId,
        amountCents,
        earningIds: earnings.map((e) => e.id),
        processorRef: result.processorRef,
        status: result.status,
      });
      payouts.push(payout);
    }

    return reply.send({ payouts, providersPaid: payouts.length });
  });
}
