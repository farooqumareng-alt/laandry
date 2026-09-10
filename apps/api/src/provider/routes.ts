import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assertProviderStatusTransition,
  hasPermission,
  PROVIDER_STATUSES,
  SERVICE_TYPES,
} from "@laandry/domain";

import { EmailAlreadyRegisteredError, type AuthRepository } from "../auth/repository";
import { issueSession } from "../auth/session";
import { hashPassword } from "../auth/password";
import { requireAuth, requireRole } from "../auth/plugin";
import type { Env } from "../env";
import type { ProviderRepository } from "./repository";

const applySchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

const capabilitiesSchema = z.object({ services: z.array(z.enum(SERVICE_TYPES)).min(1).max(SERVICE_TYPES.length) });

const serviceAreaSchema = z.object({
  postalPrefix: z.string().min(1).max(10),
  radiusMiles: z.number().int().min(1).max(500),
});

const availabilitySchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const adminListProvidersQuerySchema = z.object({ status: z.enum(PROVIDER_STATUSES).optional() });

export interface ProviderRoutesDeps {
  authRepository: AuthRepository;
  providerRepository: ProviderRepository;
  env: Env;
}

/**
 * Provider onboarding — docs/ARCHITECTURE.md "PROVIDER QUALIFICATION". A
 * provider applies through here (never through /auth/register, which only
 * ever creates customers — see auth/routes.ts), starts at
 * APPLICATION_STARTED, and cannot be offered work (Phase 6) until they
 * reach ACTIVE. Identity-document verification and training modules
 * aren't built (no file-upload architecture yet), so the review step here
 * runs on structured data only — that gap is real, not hidden; see
 * docs/ARCHITECTURE.md §21.
 */
export function providerRoutes(app: FastifyInstance, deps: ProviderRoutesDeps) {
  const { authRepository, providerRepository, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asProvider = [auth, requireRole("provider")];

  // Same rationale as /auth/register — well below the global rate-limit
  // floor (see app.ts), applied to the one unauthenticated,
  // account-creating endpoint this module exposes.
  app.post("/provider/apply", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = applySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    try {
      const passwordHash = await hashPassword(body.data.password);
      const user = await authRepository.createUser({ email: body.data.email, role: "provider", passwordHash });
      const profile = await providerRepository.createProfile(user.id);
      const session = await issueSession(authRepository, env, user.id, user.role);
      return reply.code(201).send({
        ...session,
        user: { id: user.id, email: user.email, role: user.role },
        provider: { id: profile.id, status: profile.status },
      });
    } catch (err) {
      if (err instanceof EmailAlreadyRegisteredError) {
        return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });
      }
      throw err;
    }
  });

  async function currentProfileOrReply(request: FastifyRequest, reply: FastifyReply) {
    const profile = await providerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) {
      reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });
      return null;
    }
    return profile;
  }

  app.get("/provider/me", { preHandler: asProvider }, async (request, reply) => {
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const [capabilities, serviceAreas, availability] = await Promise.all([
      providerRepository.listCapabilities(profile.id),
      providerRepository.listServiceAreas(profile.id),
      providerRepository.listAvailability(profile.id),
    ]);
    return reply.send({ profile, capabilities, serviceAreas, availability });
  });

  app.put("/provider/capabilities", { preHandler: asProvider }, async (request, reply) => {
    const body = capabilitiesSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;

    const existing = await providerRepository.listCapabilities(profile.id);
    const wanted = new Set(body.data.services);
    await Promise.all([
      ...existing.filter((c) => !wanted.has(c.service)).map((c) => providerRepository.removeCapability(profile.id, c.service)),
      ...[...wanted].map((service) => providerRepository.addCapability(profile.id, service)),
    ]);
    return reply.send({ capabilities: await providerRepository.listCapabilities(profile.id) });
  });

  app.post("/provider/service-areas", { preHandler: asProvider }, async (request, reply) => {
    const body = serviceAreaSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const area = await providerRepository.addServiceArea({ providerId: profile.id, ...body.data });
    return reply.code(201).send({ serviceArea: area });
  });

  app.delete("/provider/service-areas/:id", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const area = await providerRepository.getServiceArea(params.data.id);
    if (!area || area.providerId !== profile.id) {
      return reply.code(404).send({ error: "SERVICE_AREA_NOT_FOUND" });
    }
    await providerRepository.removeServiceArea(params.data.id);
    return reply.code(204).send();
  });

  app.post("/provider/availability", { preHandler: asProvider }, async (request, reply) => {
    const body = availabilitySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    if (new Date(body.data.endsAt) <= new Date(body.data.startsAt)) {
      return reply.code(400).send({ error: "INVALID_WINDOW" });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const availability = await providerRepository.addAvailability({
      providerId: profile.id,
      startsAt: new Date(body.data.startsAt),
      endsAt: new Date(body.data.endsAt),
    });
    return reply.code(201).send({ availability });
  });

  app.delete("/provider/availability/:id", { preHandler: asProvider }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const window = await providerRepository.getAvailability(params.data.id);
    if (!window || window.providerId !== profile.id) {
      return reply.code(404).send({ error: "AVAILABILITY_NOT_FOUND" });
    }
    await providerRepository.removeAvailability(params.data.id);
    return reply.code(204).send();
  });

  app.post("/provider/submit-for-review", { preHandler: asProvider }, async (request, reply) => {
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;

    const capabilities = await providerRepository.listCapabilities(profile.id);
    const serviceAreas = await providerRepository.listServiceAreas(profile.id);
    if (capabilities.length === 0 || serviceAreas.length === 0) {
      return reply.code(400).send({
        error: "APPLICATION_INCOMPLETE",
        details: { needsCapability: capabilities.length === 0, needsServiceArea: serviceAreas.length === 0 },
      });
    }

    try {
      assertProviderStatusTransition(profile.status, "REVIEW_PENDING");
    } catch {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: profile.status });
    }
    const updated = await providerRepository.updateStatus(profile.id, "REVIEW_PENDING");
    return reply.send({ profile: updated });
  });

  app.post("/provider/activate", { preHandler: asProvider }, async (request, reply) => {
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;

    const availability = await providerRepository.listAvailability(profile.id);
    if (availability.length === 0) {
      return reply.code(400).send({ error: "NO_AVAILABILITY_SET" });
    }

    try {
      assertProviderStatusTransition(profile.status, "ACTIVE");
    } catch {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: profile.status });
    }
    const updated = await providerRepository.updateStatus(profile.id, "ACTIVE");
    return reply.send({ profile: updated });
  });

  // Admin console (Phase 10) — every provider profile, optionally narrowed
  // to one status; "Provider Applications" is this same list filtered to
  // REVIEW_PENDING client-side, not a separate query.
  app.get("/admin/providers", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "provider_approval", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const query = adminListProvidersQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const providers = await providerRepository.listAllProviders({ status: query.data.status });
    return reply.send({ providers });
  });

  // The authorized state transition the Phase 10 console's Provider
  // Applications page calls — built back in Phase 5 as a curl-only admin
  // action, ahead of any UI actually calling it.
  app.post("/admin/providers/:id/approve", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "provider_approval", "write")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const profile = await providerRepository.getProfileById(params.data.id);
    if (!profile) return reply.code(404).send({ error: "PROVIDER_PROFILE_NOT_FOUND" });

    try {
      assertProviderStatusTransition(profile.status, "APPROVED");
    } catch {
      return reply.code(409).send({ error: "INVALID_STATUS_FOR_TRANSITION", currentStatus: profile.status });
    }
    const updated = await providerRepository.updateStatus(profile.id, "APPROVED");
    return reply.send({ profile: updated });
  });
}
