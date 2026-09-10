import Fastify from "fastify";

import { authRoutes } from "./auth/routes";
import { PrismaAuthRepository } from "./auth/prisma-repository";
import type { AuthRepository } from "./auth/repository";
import { customerRoutes } from "./customer/routes";
import { PrismaCustomerRepository } from "./customer/prisma-repository";
import type { CustomerRepository } from "./customer/repository";
import { getPrisma } from "./db";
import type { Env } from "./env";
import { matchingRoutes } from "./matching/routes";
import { PrismaMatchingRepository } from "./matching/prisma-repository";
import type { MatchingRepository } from "./matching/repository";
import { orderRoutes } from "./order/routes";
import { PrismaOrderRepository } from "./order/prisma-repository";
import type { OrderRepository } from "./order/repository";
import { FakePaymentProvider } from "./payments/fake-provider";
import type { PaymentProvider } from "./payments/provider";
import { providerRoutes } from "./provider/routes";
import { PrismaProviderRepository } from "./provider/prisma-repository";
import type { ProviderRepository } from "./provider/repository";
import { healthRoutes } from "./routes/health";

export interface BuildAppOptions {
  /** All default to a Prisma-backed (or, for payments, fake) implementation. Tests inject in-memory ones instead — see src/auth/test-helpers.ts. */
  authRepository?: AuthRepository;
  customerRepository?: CustomerRepository;
  orderRepository?: OrderRepository;
  providerRepository?: ProviderRepository;
  matchingRepository?: MatchingRepository;
  /** No real processor is wired up anywhere yet — see payments/provider.ts. Defaults to FakePaymentProvider even outside tests. */
  paymentProvider?: PaymentProvider;
}

/**
 * Builds the Fastify instance without starting it — kept separate from
 * index.ts so tests can import buildApp() and use fastify.inject() instead
 * of binding a real port, and so they can inject in-memory repositories
 * instead of requiring a live Postgres. See src/auth/*.test.ts,
 * src/customer/*.test.ts, src/order/*.test.ts, src/provider/*.test.ts and
 * src/matching/*.test.ts.
 */
export function buildApp(env: Env, options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  const authRepository = options.authRepository ?? new PrismaAuthRepository(getPrisma());
  const customerRepository = options.customerRepository ?? new PrismaCustomerRepository(getPrisma());
  const orderRepository = options.orderRepository ?? new PrismaOrderRepository(getPrisma());
  const providerRepository = options.providerRepository ?? new PrismaProviderRepository(getPrisma());
  const matchingRepository = options.matchingRepository ?? new PrismaMatchingRepository(getPrisma());
  const paymentProvider = options.paymentProvider ?? new FakePaymentProvider();

  app.register(healthRoutes);
  app.register(async (instance) =>
    authRoutes(instance, {
      repository: authRepository,
      env,
      onCustomerRegistered: async (userId) => {
        await customerRepository.createProfile(userId);
      },
    }),
  );
  app.register(async (instance) => customerRoutes(instance, { repository: customerRepository, env }));
  app.register(async (instance) =>
    orderRoutes(instance, {
      orderRepository,
      customerRepository,
      paymentProvider,
      env,
      onOrderBooked: async (input) => {
        await matchingRepository.dispatchOrder(input);
      },
    }),
  );
  app.register(async (instance) => providerRoutes(instance, { authRepository, providerRepository, env }));
  app.register(async (instance) =>
    matchingRoutes(instance, { matchingRepository, providerRepository, orderRepository, customerRepository, env }),
  );

  return app;
}
