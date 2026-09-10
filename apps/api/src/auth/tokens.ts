import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@laandry/domain";

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

/**
 * Short-lived, self-contained JWT. Deliberately not re-checked against the
 * database on every request — the tradeoff is that a role change or
 * suspension takes up to ACCESS_TOKEN_TTL_MIN to fully propagate, in
 * exchange for not hitting Postgres on every authenticated request. Refresh
 * (which happens far more often than that TTL) always re-reads the current
 * role from the database, and revoking a session blocks refresh
 * immediately — see revokeSession in repository.ts.
 */
export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlMinutes: number,
): string {
  return jwt.sign(payload, secret, { expiresIn: `${ttlMinutes}m` });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof decoded !== "object" || decoded === null || typeof decoded.sub !== "string") {
    throw new Error("Malformed access token payload");
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}

/** Opaque refresh token: a random value the client holds, only its hash is stored server-side (so a DB read never reveals a usable token). */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
