import type { PrismaClient, Role as PrismaRole, User as PrismaUser } from "@prisma/client";
import type { Role } from "@laandry/domain";

import { EmailAlreadyRegisteredError, type AuthRepository, type CreateSessionInput, type CreateUserInput, type SessionRecord, type UserRecord } from "./repository";

// Prisma's Role enum is UPPER_SNAKE (matches the DB/SQL convention); the
// domain package's Role union is lower_snake (matches the §5 permission
// table as written). This is the one place that translates between them.
const TO_DOMAIN_ROLE: Record<PrismaRole, Role> = {
  CUSTOMER: "customer",
  PROVIDER: "provider",
  SUPPORT: "support",
  DISPATCH: "dispatch",
  FINANCE: "finance",
  OPS_MANAGER: "ops_manager",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

const TO_PRISMA_ROLE: Record<Role, PrismaRole> = {
  customer: "CUSTOMER",
  provider: "PROVIDER",
  support: "SUPPORT",
  dispatch: "DISPATCH",
  finance: "FINANCE",
  ops_manager: "OPS_MANAGER",
  admin: "ADMIN",
  super_admin: "SUPER_ADMIN",
};

function toUserRecord(user: PrismaUser): UserRecord {
  return {
    id: user.id,
    email: user.email,
    role: TO_DOMAIN_ROLE[user.role],
    passwordHash: user.passwordHash,
    mfaSecret: user.mfaSecret,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          role: TO_PRISMA_ROLE[input.role],
          passwordHash: input.passwordHash,
        },
      });
      return toUserRecord(user);
    } catch (err) {
      // Prisma unique-constraint violation on the users.email index.
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
        throw new EmailAlreadyRegisteredError(input.email);
      }
      throw err;
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? toUserRecord(user) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toUserRecord(user) : null;
  }

  async setMfaSecret(userId: string, secret: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
  }

  async enableMfa(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findSessionByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { refreshTokenHash } });
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
