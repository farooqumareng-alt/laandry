import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Action, type Resource, type Role } from "@laandry/domain";

import { verifyAccessToken } from "./tokens";

export interface AuthUser {
  id: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

/**
 * Verifies the Authorization: Bearer <token> header and attaches
 * request.authUser. Every other guard in this file builds on top of this
 * one — none of them trust anything the client sent except this token.
 */
export function requireAuth(secret: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      return reply.code(401).send({ error: "UNAUTHENTICATED" });
    }
    try {
      const payload = verifyAccessToken(token, secret);
      request.authUser = { id: payload.sub, role: payload.role };
    } catch {
      return reply.code(401).send({ error: "UNAUTHENTICATED" });
    }
  };
}

/** Gate by role alone — for endpoints with no per-resource ownership concept (e.g. admin tooling). */
export function requireRole(...roles: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.authUser) {
      return reply.code(401).send({ error: "UNAUTHENTICATED" });
    }
    if (!roles.includes(request.authUser.role)) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
  };
}

/**
 * Gate by the §5 role/permission matrix. `resolveOwnership` decides
 * whether *this* request's actor owns the specific resource instance being
 * accessed (e.g. "is this order's customerId === request.authUser.id") —
 * only needed for resources with an "own" grant; omit it for admin-only
 * resources where every grant is "any".
 */
export function requirePermission(
  resource: Resource,
  action: Action,
  resolveOwnership?: (request: FastifyRequest) => boolean | Promise<boolean>,
) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.authUser) {
      return reply.code(401).send({ error: "UNAUTHENTICATED" });
    }
    const isOwner = resolveOwnership ? await resolveOwnership(request) : false;
    if (!hasPermission(request.authUser.role, resource, action, { isOwner })) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
  };
}
