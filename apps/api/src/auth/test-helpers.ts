import type { Role } from "@laandry/domain";

import { buildApp } from "../app";
import type { Env } from "../env";
import { InMemoryCustomerRepository } from "../customer/memory-repository";
import { InMemoryMatchingRepository } from "../matching/memory-repository";
import { InMemoryOrderRepository } from "../order/memory-repository";
import { FakePaymentProvider } from "../payments/fake-provider";
import { InMemoryProviderRepository } from "../provider/memory-repository";
import { hashPassword } from "./password";
import { InMemoryAuthRepository } from "./memory-repository";

/** DATABASE_URL is deliberately not required here — see db.ts getPrisma(). */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_URL: "unused-in-tests",
    JWT_SECRET: "test-only-secret-32-characters-minimum-xxxxxxxx",
    ACCESS_TOKEN_TTL_MIN: 15,
    REFRESH_TOKEN_TTL_DAYS: 30,
    ...overrides,
  };
}

export function buildTestApp(overrides: Partial<Env> = {}) {
  const env = testEnv(overrides);
  const repository = new InMemoryAuthRepository();
  const customerRepository = new InMemoryCustomerRepository();
  const orderRepository = new InMemoryOrderRepository();
  const providerRepository = new InMemoryProviderRepository();
  const matchingRepository = new InMemoryMatchingRepository(providerRepository, orderRepository, customerRepository);
  const paymentProvider = new FakePaymentProvider();
  const app = buildApp(env, {
    authRepository: repository,
    customerRepository,
    orderRepository,
    providerRepository,
    matchingRepository,
    paymentProvider,
  });
  return {
    app,
    repository,
    customerRepository,
    orderRepository,
    providerRepository,
    matchingRepository,
    paymentProvider,
    env,
  };
}

/**
 * Provisions a user directly through the repository, bypassing
 * /auth/register — the only way a non-customer account exists in this
 * system, matching routes.ts's comment that provider/staff accounts are
 * never created through public self-registration. Also provisions the
 * CustomerProfile that /auth/register would have created, since tests for
 * customer-only routes need one to exist.
 */
export async function seedUser(
  repository: InMemoryAuthRepository,
  input: { email: string; password: string; role: Role },
  customerRepository?: InMemoryCustomerRepository,
  providerRepository?: InMemoryProviderRepository,
) {
  const passwordHash = await hashPassword(input.password);
  const user = await repository.createUser({ email: input.email, role: input.role, passwordHash });
  if (input.role === "customer" && customerRepository) {
    await customerRepository.createProfile(user.id);
  }
  if (input.role === "provider" && providerRepository) {
    await providerRepository.createProfile(user.id);
  }
  return user;
}
