import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError } from "fastify";

import { authRoutes } from "./auth/routes";
import { PrismaAuthRepository } from "./auth/prisma-repository";
import type { AuthRepository } from "./auth/repository";
import { customerRoutes } from "./customer/routes";
import { PrismaCustomerRepository } from "./customer/prisma-repository";
import type { CustomerRepository } from "./customer/repository";
import { deliveryRoutes } from "./delivery/routes";
import { PrismaDeliveryRepository } from "./delivery/prisma-repository";
import type { DeliveryRepository } from "./delivery/repository";
import { getPrisma } from "./db";
import type { Env } from "./env";
import { fulfillmentRoutes } from "./fulfillment/routes";
import { PrismaFulfillmentRepository } from "./fulfillment/prisma-repository";
import type { FulfillmentRepository } from "./fulfillment/repository";
import { matchingRoutes } from "./matching/routes";
import { PrismaMatchingRepository } from "./matching/prisma-repository";
import type { MatchingRepository } from "./matching/repository";
import { orderRoutes } from "./order/routes";
import { PrismaOrderRepository } from "./order/prisma-repository";
import type { OrderRepository } from "./order/repository";
import { FakePaymentProvider } from "./payments/fake-provider";
import type { PaymentProvider } from "./payments/provider";
import { processingRoutes } from "./processing/routes";
import { PrismaProcessingRepository } from "./processing/prisma-repository";
import type { ProcessingRepository } from "./processing/repository";
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
  fulfillmentRepository?: FulfillmentRepository;
  processingRepository?: ProcessingRepository;
  deliveryRepository?: DeliveryRepository;
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
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            // The default request/response serializers log req.headers —
            // which includes the Authorization bearer token and any
            // cookies — straight into whatever log sink is configured.
            // Never let that happen, in dev or prod.
            redact: {
              paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
              censor: "[redacted]",
            },
          },
    // Behind a reverse proxy (Vercel, Fly, etc.) in production, the
    // real client IP is in X-Forwarded-For — rate limiting by IP is
    // meaningless without this.
    trustProxy: env.NODE_ENV === "production",
    bodyLimit: 1_048_576, // 1MB — no file uploads exist yet; revisit when they do.
  });

  // Security headers. CSP is opinionated for an API with no HTML
  // responses of its own — deliberately locked down rather than left at
  // helmet's browser-page-oriented defaults.
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });

  // No wildcard: only the configured web/admin origins may call this API
  // from a browser. See env.ts CORS_ORIGINS.
  app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: false, // auth is Bearer-token, never cookies — no reason to allow credentialed cross-origin requests
  });

  // Global floor against generic abuse; auth.ts/provider.ts routes.ts
  // apply a much stricter per-route override on the specific endpoints a
  // credential-stuffing or account-enumeration attempt would actually hit.
  app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  // Don't let an unexpected error leak a stack trace or internal message
  // to the client — log it in full server-side, return a generic 500.
  // Errors that already set a statusCode (our own reply.code(...).send(...)
  // calls, and validation-shaped errors) pass through unchanged.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR" });
    }
    return reply.code(statusCode).send({ error: error.message });
  });

  const authRepository = options.authRepository ?? new PrismaAuthRepository(getPrisma());
  const customerRepository = options.customerRepository ?? new PrismaCustomerRepository(getPrisma());
  const orderRepository = options.orderRepository ?? new PrismaOrderRepository(getPrisma());
  const providerRepository = options.providerRepository ?? new PrismaProviderRepository(getPrisma());
  const matchingRepository = options.matchingRepository ?? new PrismaMatchingRepository(getPrisma());
  const fulfillmentRepository = options.fulfillmentRepository ?? new PrismaFulfillmentRepository(getPrisma());
  const processingRepository = options.processingRepository ?? new PrismaProcessingRepository(getPrisma());
  const deliveryRepository = options.deliveryRepository ?? new PrismaDeliveryRepository(getPrisma());
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
  app.register(async (instance) =>
    fulfillmentRoutes(instance, {
      fulfillmentRepository,
      orderRepository,
      customerRepository,
      providerRepository,
      matchingRepository,
      paymentProvider,
      env,
    }),
  );
  app.register(async (instance) =>
    processingRoutes(instance, {
      processingRepository,
      orderRepository,
      customerRepository,
      providerRepository,
      matchingRepository,
      env,
    }),
  );
  app.register(async (instance) =>
    deliveryRoutes(instance, {
      deliveryRepository,
      orderRepository,
      customerRepository,
      providerRepository,
      matchingRepository,
      paymentProvider,
      env,
    }),
  );

  return app;
}
