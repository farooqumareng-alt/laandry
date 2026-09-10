import type { Role } from "@laandry/domain";

/**
 * Persistence is behind an interface so the authorization test harness
 * (§16) can run against an in-memory implementation instead of a live
 * Postgres instance — auth logic and its tests stay decoupled from
 * infrastructure. `PrismaAuthRepository` is what apps/api actually runs in
 * dev/prod; `InMemoryAuthRepository` is what src/auth/*.test.ts runs.
 */

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  passwordHash: string;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateUserInput {
  email: string;
  role: Role;
  passwordHash: string;
}

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
}

export interface AuthRepository {
  createUser(input: CreateUserInput): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  setMfaSecret(userId: string, secret: string): Promise<void>;
  enableMfa(userId: string): Promise<void>;

  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  findSessionByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null>;
  revokeSession(id: string): Promise<void>;
  revokeAllSessionsForUser(userId: string): Promise<void>;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = "EmailAlreadyRegisteredError";
  }
}
