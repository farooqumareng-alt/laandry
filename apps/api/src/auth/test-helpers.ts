import type { Role } from "@laandry/domain";

import { buildApp } from "../app";
import type { Env } from "../env";
import { InMemoryCustomerRepository } from "../customer/memory-repository";
import { InMemoryDeliveryRepository } from "../delivery/memory-repository";
import { InMemoryFulfillmentRepository } from "../fulfillment/memory-repository";
import { InMemoryMatchingRepository } from "../matching/memory-repository";
import { InMemoryNotificationProvider } from "../notifications/memory-provider";
import { InMemoryOrderRepository } from "../order/memory-repository";
import { FakePaymentProvider } from "../payments/fake-provider";
import { FakePayoutProvider } from "../payouts/fake-payout-provider";
import { InMemoryPayoutsRepository } from "../payouts/memory-repository";
import { InMemoryProcessingRepository } from "../processing/memory-repository";
import { InMemoryPromotionsRepository } from "../promotions/memory-repository";
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
    CORS_ORIGINS: ["http://localhost:8081"],
    NOTIFICATIONS_FROM_EMAIL: "hello@laandry.com",
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
  const fulfillmentRepository = new InMemoryFulfillmentRepository();
  const processingRepository = new InMemoryProcessingRepository();
  const deliveryRepository = new InMemoryDeliveryRepository();
  const paymentProvider = new FakePaymentProvider();
  const notificationProvider = new InMemoryNotificationProvider();
  const payoutsRepository = new InMemoryPayoutsRepository();
  const payoutProvider = new FakePayoutProvider();
  const promotionsRepository = new InMemoryPromotionsRepository();
  const app = buildApp(env, {
    authRepository: repository,
    customerRepository,
    orderRepository,
    providerRepository,
    matchingRepository,
    fulfillmentRepository,
    processingRepository,
    deliveryRepository,
    paymentProvider,
    notificationProvider,
    payoutsRepository,
    payoutProvider,
    promotionsRepository,
  });
  return {
    app,
    repository,
    customerRepository,
    orderRepository,
    providerRepository,
    matchingRepository,
    fulfillmentRepository,
    processingRepository,
    deliveryRepository,
    paymentProvider,
    notificationProvider,
    payoutsRepository,
    payoutProvider,
    promotionsRepository,
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
