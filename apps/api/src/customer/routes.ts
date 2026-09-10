import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { addressInputSchema, laandryPreferencesSchema } from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { Env } from "../env";
import type { CustomerRepository } from "./repository";

const addressUpdateSchema = addressInputSchema.partial();

/**
 * Every route here derives the acting customer's profile from
 * request.authUser (the verified token), never from a client-supplied
 * customerId — and every address route re-checks that the fetched address
 * actually belongs to that profile before returning or mutating it. That
 * second check is what stops "change the :id in the URL" from reading or
 * editing someone else's saved address (docs/ARCHITECTURE.md §16).
 */
export function customerRoutes(app: FastifyInstance, deps: { repository: CustomerRepository; env: Env }) {
  const { repository, env } = deps;
  const guard = [requireAuth(env.JWT_SECRET), requireRole("customer")];

  async function currentProfileOrReply(request: FastifyRequest, reply: FastifyReply) {
    const profile = await repository.getProfileByUserId(request.authUser!.id);
    if (!profile) {
      reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });
      return null;
    }
    return profile;
  }

  app.get("/me/profile", { preHandler: guard }, async (request, reply) => {
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const addresses = await repository.listAddresses(profile.id);
    return reply.send({
      preferences: profile.preferences,
      preferredProviderId: profile.preferredProviderId,
      addresses,
    });
  });

  app.put("/me/preferences", { preHandler: guard }, async (request, reply) => {
    const body = laandryPreferencesSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const updated = await repository.updatePreferences(profile.id, body.data);
    return reply.send({ preferences: updated.preferences });
  });

  app.get("/me/addresses", { preHandler: guard }, async (request, reply) => {
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    return reply.send({ addresses: await repository.listAddresses(profile.id) });
  });

  app.post("/me/addresses", { preHandler: guard }, async (request, reply) => {
    const body = addressInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;
    const address = await repository.addAddress({ customerId: profile.id, ...body.data });
    return reply.code(201).send({ address });
  });

  const paramsSchema = z.object({ id: z.string().uuid() });

  app.patch("/me/addresses/:id", { preHandler: guard }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = addressUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;

    const existing = await repository.getAddress(params.data.id);
    if (!existing || existing.customerId !== profile.id) {
      // Same 404 whether the address doesn't exist or belongs to someone
      // else — never confirm another customer's address id is valid.
      return reply.code(404).send({ error: "ADDRESS_NOT_FOUND" });
    }

    const updated = await repository.updateAddress(params.data.id, body.data);
    return reply.send({ address: updated });
  });

  app.delete("/me/addresses/:id", { preHandler: guard }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const profile = await currentProfileOrReply(request, reply);
    if (!profile) return;

    const existing = await repository.getAddress(params.data.id);
    if (!existing || existing.customerId !== profile.id) {
      return reply.code(404).send({ error: "ADDRESS_NOT_FOUND" });
    }

    await repository.deleteAddress(params.data.id);
    return reply.code(204).send();
  });
}
