import type { Role } from "@laandry/domain";

import type { Env } from "../env";
import type { AuthRepository } from "./repository";
import { generateRefreshToken, signAccessToken } from "./tokens";

/**
 * Shared by every place that mints a session after creating or
 * re-authenticating a user — auth/routes.ts (register/login/refresh) and
 * provider/routes.ts (provider application, which also creates a User).
 * Kept here rather than duplicated so a future change to token TTLs or
 * session fields only happens in one place.
 */
export async function issueSession(
  repository: AuthRepository,
  env: Env,
  userId: string,
  role: Role,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: userId, role }, env.JWT_SECRET, env.ACCESS_TOKEN_TTL_MIN);
  const { token: refreshToken, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await repository.createSession({ userId, refreshTokenHash: hash, userAgent: null, expiresAt });
  return { accessToken, refreshToken };
}
