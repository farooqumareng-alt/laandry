import { randomUUID } from "node:crypto";

import {
  EmailAlreadyRegisteredError,
  type AuthRepository,
  type CreateSessionInput,
  type CreateUserInput,
  type SessionRecord,
  type UserRecord,
} from "./repository";

/** In-memory AuthRepository — used only by tests. See repository.ts. */
export class InMemoryAuthRepository implements AuthRepository {
  private usersById = new Map<string, UserRecord>();
  private sessionsById = new Map<string, SessionRecord>();

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const existing = [...this.usersById.values()].find((u) => u.email === input.email);
    if (existing) throw new EmailAlreadyRegisteredError(input.email);

    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      role: input.role,
      passwordHash: input.passwordHash,
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: new Date(),
    };
    this.usersById.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return [...this.usersById.values()].find((u) => u.email === email) ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.usersById.get(id) ?? null;
  }

  async setMfaSecret(userId: string, secret: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (!user) return;
    this.usersById.set(userId, { ...user, mfaSecret: secret });
  }

  async enableMfa(userId: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (!user) return;
    this.usersById.set(userId, { ...user, mfaEnabled: true });
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      userAgent: input.userAgent,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessionsById.set(session.id, session);
    return session;
  }

  async findSessionByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    return [...this.sessionsById.values()].find((s) => s.refreshTokenHash === refreshTokenHash) ?? null;
  }

  async revokeSession(id: string): Promise<void> {
    const session = this.sessionsById.get(id);
    if (!session) return;
    this.sessionsById.set(id, { ...session, revokedAt: new Date() });
  }

  async revokeAllSessionsForUser(userId: string): Promise<void> {
    for (const [id, session] of this.sessionsById) {
      if (session.userId === userId && !session.revokedAt) {
        this.sessionsById.set(id, { ...session, revokedAt: new Date() });
      }
    }
  }
}
