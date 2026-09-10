import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requiresMfa } from "@laandry/domain";

import type { Env } from "../env";
import { buildOtpauthUri, generateMfaSecret, verifyTotp } from "./mfa";
import { hashPassword, verifyPassword } from "./password";
import { requireAuth, requireRole } from "./plugin";
import { EmailAlreadyRegisteredError, type AuthRepository } from "./repository";
import { issueSession } from "./session";
import { hashRefreshToken } from "./tokens";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().length(6).optional(),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const mfaVerifySchema = z.object({ code: z.string().length(6) });

/**
 * Well below the global 300/min floor (see app.ts) — these are exactly
 * the endpoints a credential-stuffing, account-enumeration, or TOTP
 * brute-force attempt would hit. A 6-digit MFA code is only 1,000,000
 * possibilities; without a tight per-route cap here, rate limiting alone
 * wouldn't meaningfully slow that down.
 */
const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export interface AuthRoutesDeps {
  repository: AuthRepository;
  env: Env;
  /** Runs after a new CUSTOMER account is created — provisions the CustomerProfile. Kept as a callback so this module doesn't need to know about ../customer. */
  onCustomerRegistered?: (userId: string) => Promise<void>;
}

export function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps) {
  const { repository, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);

  // Public self-registration only ever creates CUSTOMER accounts. Provider,
  // support, dispatch, finance, ops_manager, admin and super_admin accounts
  // are provisioned out-of-band (provider application review in Phase 5;
  // staff accounts created by an existing admin) — never via this endpoint.
  app.post("/auth/register", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = registerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }
    try {
      const passwordHash = await hashPassword(body.data.password);
      const user = await repository.createUser({ email: body.data.email, role: "customer", passwordHash });
      await deps.onCustomerRegistered?.(user.id);
      const session = await issueSession(repository, env, user.id, user.role);
      return reply.code(201).send({
        ...session,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      if (err instanceof EmailAlreadyRegisteredError) {
        return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });
      }
      throw err;
    }
  });

  app.post("/auth/login", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });
    }

    const user = await repository.findUserByEmail(body.data.email);
    // Same generic error whether the email doesn't exist or the password
    // is wrong — never let login responses reveal which one it was.
    const invalidCredentials = () => reply.code(401).send({ error: "INVALID_CREDENTIALS" });

    if (!user) return invalidCredentials();
    const passwordOk = await verifyPassword(body.data.password, user.passwordHash);
    if (!passwordOk) return invalidCredentials();

    let mfaSetupRequired = false;
    if (requiresMfa(user.role)) {
      if (user.mfaEnabled) {
        if (!body.data.mfaCode) {
          return reply.code(401).send({ error: "MFA_REQUIRED" });
        }
        if (!user.mfaSecret || !verifyTotp(user.mfaSecret, body.data.mfaCode)) {
          return invalidCredentials();
        }
      } else {
        mfaSetupRequired = true;
      }
    }

    const session = await issueSession(repository, env, user.id, user.role);
    return reply.send({
      ...session,
      user: { id: user.id, email: user.email, role: user.role },
      ...(mfaSetupRequired ? { mfaSetupRequired: true } : {}),
    });
  });

  app.post("/auth/refresh", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const hash = hashRefreshToken(body.data.refreshToken);
    const session = await repository.findSessionByRefreshHash(hash);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ error: "INVALID_REFRESH_TOKEN" });
    }

    const user = await repository.findUserById(session.userId);
    if (!user) {
      return reply.code(401).send({ error: "INVALID_REFRESH_TOKEN" });
    }

    // Rotate on every use: the old refresh token is revoked immediately,
    // so a stolen-but-already-used token can't be replayed.
    await repository.revokeSession(session.id);
    const next = await issueSession(repository, env, user.id, user.role);
    return reply.send({ ...next, user: { id: user.id, email: user.email, role: user.role } });
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const hash = hashRefreshToken(body.data.refreshToken);
    const session = await repository.findSessionByRefreshHash(hash);
    if (session) await repository.revokeSession(session.id);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: auth }, async (request, reply) => {
    const user = await repository.findUserById(request.authUser!.id);
    if (!user) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    return reply.send({ id: user.id, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled });
  });

  app.post("/auth/mfa/enroll", { preHandler: auth }, async (request, reply) => {
    const user = await repository.findUserById(request.authUser!.id);
    if (!user) return reply.code(401).send({ error: "UNAUTHENTICATED" });

    const secret = generateMfaSecret();
    await repository.setMfaSecret(user.id, secret);
    return reply.send({ secret, otpauthUri: buildOtpauthUri({ secret, email: user.email }) });
  });

  app.post(
    "/auth/mfa/verify",
    { preHandler: auth, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = mfaVerifySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      const user = await repository.findUserById(request.authUser!.id);
      if (!user?.mfaSecret) {
        return reply.code(400).send({ error: "MFA_NOT_ENROLLED" });
      }
      if (!verifyTotp(user.mfaSecret, body.data.code)) {
        return reply.code(401).send({ error: "INVALID_MFA_CODE" });
      }
      await repository.enableMfa(user.id);
      return reply.send({ mfaEnabled: true });
    },
  );

  // Representative role-gated route proving requireAuth + requireRole end
  // to end; resource-scoped ("own") routes arrive with their resources in
  // Phase 4+ and reuse requirePermission from ./plugin against this same
  // harness.
  app.get(
    "/admin/ping",
    { preHandler: [auth, requireRole("admin", "super_admin")] },
    async (_request, reply) => reply.send({ pong: true }),
  );
}
