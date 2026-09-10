import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp, seedUser } from "../auth/test-helpers";

type TestApp = ReturnType<typeof buildTestApp>["app"];
type Repos = ReturnType<typeof buildTestApp>;

const PICKUP_WINDOW = {
  pickupWindowStart: "2026-01-05T17:00:00.000Z",
  pickupWindowEnd: "2026-01-05T19:00:00.000Z",
};

async function registerCustomerWithAddress(app: TestApp, email: string, postalCode = "62704") {
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct horse battery staple" },
  });
  const token = register.json().accessToken as string;
  const auth = { authorization: `Bearer ${token}` };

  const address = await app.inject({
    method: "POST",
    url: "/me/addresses",
    headers: auth,
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode },
  });

  return { auth, addressId: address.json().address.id as string };
}

/** Walks a provider all the way to ACTIVE, eligible for the given service/area/window — the full Phase 5 lifecycle, reused here as setup rather than retested. */
async function setupActiveProvider(
  app: TestApp,
  repos: Repos,
  email: string,
  options: { service?: string; postalPrefix?: string; availabilityStart?: string; availabilityEnd?: string } = {},
) {
  const service = options.service ?? "EVERYDAY_LAUNDRY";
  const postalPrefix = options.postalPrefix ?? "627";
  const availabilityStart = options.availabilityStart ?? "2026-01-05T08:00:00.000Z";
  const availabilityEnd = options.availabilityEnd ?? "2026-01-05T22:00:00.000Z";

  const apply = await app.inject({
    method: "POST",
    url: "/provider/apply",
    payload: { email, password: "correct horse battery staple" },
  });
  const auth = { authorization: `Bearer ${apply.json().accessToken}` };
  const providerId = apply.json().provider.id as string;

  await app.inject({ method: "PUT", url: "/provider/capabilities", headers: auth, payload: { services: [service] } });
  await app.inject({ method: "POST", url: "/provider/service-areas", headers: auth, payload: { postalPrefix, radiusMiles: 15 } });
  await app.inject({ method: "POST", url: "/provider/submit-for-review", headers: auth });

  await seedUser(
    repos.repository,
    { email: `admin-for-${email}`, password: "correct horse battery staple", role: "admin" },
    repos.customerRepository,
  );
  const adminLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: `admin-for-${email}`, password: "correct horse battery staple" },
  });
  await app.inject({
    method: "POST",
    url: `/admin/providers/${providerId}/approve`,
    headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
  });

  await app.inject({
    method: "POST",
    url: "/provider/availability",
    headers: auth,
    payload: { startsAt: availabilityStart, endsAt: availabilityEnd },
  });
  await app.inject({ method: "POST", url: "/provider/activate", headers: auth });

  return { auth, providerId };
}

async function bookOrder(app: TestApp, customerAuth: { authorization: string }, addressId: string, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/orders",
    headers: customerAuth,
    payload: {
      addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      service: "EVERYDAY_LAUNDRY",
      weightTier: "30_40",
      ...overrides,
    },
  });
}

test("booking dispatches a wave-1 offer to an eligible ACTIVE provider, showing only an approximate area", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "eligible@example.com");
  const customer = await registerCustomerWithAddress(app, "cust1@example.com");

  const booked = await bookOrder(app, customer.auth, customer.addressId);
  assert.equal(booked.statusCode, 201);

  const offers = await app.inject({ method: "GET", url: "/provider/offers", headers: provider.auth });
  assert.equal(offers.json().offers.length, 1);
  const summary = offers.json().offers[0];
  assert.equal(summary.offer.status, "WAVE_1_OFFERED");
  assert.equal(summary.offer.wave, 1);
  assert.match(summary.approximateArea, /^Springfield, IL · 627\*\*$/);
  assert.equal(summary.approximateArea.includes("Main St"), false, "must never include the street address pre-acceptance");
});

test("a provider with the wrong capability, wrong area, non-overlapping availability, or non-ACTIVE status is never offered the order", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  await setupActiveProvider(app, repos, "wrong-capability@example.com", { service: "TRAVEL" });
  await setupActiveProvider(app, repos, "wrong-area@example.com", { postalPrefix: "900" });
  await setupActiveProvider(app, repos, "wrong-window@example.com", {
    availabilityStart: "2026-02-01T08:00:00.000Z",
    availabilityEnd: "2026-02-01T20:00:00.000Z",
  });
  const customer = await registerCustomerWithAddress(app, "cust2@example.com");

  await bookOrder(app, customer.auth, customer.addressId);

  for (const email of ["wrong-capability@example.com", "wrong-area@example.com", "wrong-window@example.com"]) {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "correct horse battery staple" } });
    const offers = await app.inject({
      method: "GET",
      url: "/provider/offers",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    assert.equal(offers.json().offers.length, 0, `${email} should not have been offered this order`);
  }
});

test("booking with zero eligible providers still succeeds — the order just has no offers yet", async () => {
  const { app } = buildTestApp();
  const customer = await registerCustomerWithAddress(app, "cust3@example.com");
  const booked = await bookOrder(app, customer.auth, customer.addressId);
  assert.equal(booked.statusCode, 201);
  assert.equal(booked.json().order.status, "SCHEDULED");
});

test("accepting an offer assigns the order and reveals the exact address only afterward", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "accepter@example.com");
  const customer = await registerCustomerWithAddress(app, "cust4@example.com");
  await bookOrder(app, customer.auth, customer.addressId);

  const offers = await app.inject({ method: "GET", url: "/provider/offers", headers: provider.auth });
  const offerId = offers.json().offers[0].offer.id as string;
  const orderId = offers.json().offers[0].offer.orderId as string;

  // Before acceptance: no access to the full order.
  const before = await app.inject({ method: "GET", url: `/provider/orders/${orderId}`, headers: provider.auth });
  assert.equal(before.statusCode, 404);

  const accept = await app.inject({ method: "POST", url: `/provider/offers/${offerId}/accept`, headers: provider.auth });
  assert.equal(accept.statusCode, 200);
  assert.equal(accept.json().assignment.providerId, provider.providerId);

  const custView = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: customer.auth });
  assert.equal(custView.json().order.status, "PROVIDER_ASSIGNED");

  const after = await app.inject({ method: "GET", url: `/provider/orders/${orderId}`, headers: provider.auth });
  assert.equal(after.statusCode, 200);
  assert.equal(after.json().address.line1, "1 Main St");
  assert.equal(after.json().order.preferenceSnapshot.washTemperature, "cold");
});

test("accepting the same offer twice is rejected the second time — no double assignment from a naive retry", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "retry@example.com");
  const customer = await registerCustomerWithAddress(app, "cust5@example.com");
  await bookOrder(app, customer.auth, customer.addressId);

  const offers = await app.inject({ method: "GET", url: "/provider/offers", headers: provider.auth });
  const offerId = offers.json().offers[0].offer.id as string;

  const first = await app.inject({ method: "POST", url: `/provider/offers/${offerId}/accept`, headers: provider.auth });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({ method: "POST", url: `/provider/offers/${offerId}/accept`, headers: provider.auth });
  assert.equal(second.statusCode, 409);
});

test("a provider cannot accept another provider's offer by id", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const providerA = await setupActiveProvider(app, repos, "ownerA@example.com");
  const providerB = await setupActiveProvider(app, repos, "ownerB@example.com");
  const customer = await registerCustomerWithAddress(app, "cust6@example.com");
  await bookOrder(app, customer.auth, customer.addressId);

  const offersA = await app.inject({ method: "GET", url: "/provider/offers", headers: providerA.auth });
  const offerIdForA = offersA.json().offers[0].offer.id as string;

  const bTriesToStealA = await app.inject({
    method: "POST",
    url: `/provider/offers/${offerIdForA}/accept`,
    headers: providerB.auth,
  });
  assert.equal(bTriesToStealA.statusCode, 409);
});

test("THE concurrency gate: two eligible providers racing to accept the same order — exactly one wins, the other gets 409, and the loser's offer is marked unfulfilled", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const providerA = await setupActiveProvider(app, repos, "raceA@example.com");
  const providerB = await setupActiveProvider(app, repos, "raceB@example.com");
  const customer = await registerCustomerWithAddress(app, "cust7@example.com");
  await bookOrder(app, customer.auth, customer.addressId);

  const offersA = await app.inject({ method: "GET", url: "/provider/offers", headers: providerA.auth });
  const offersB = await app.inject({ method: "GET", url: "/provider/offers", headers: providerB.auth });
  const offerIdA = offersA.json().offers[0].offer.id as string;
  const offerIdB = offersB.json().offers[0].offer.id as string;
  const orderId = offersA.json().offers[0].offer.orderId as string;
  assert.notEqual(offerIdA, offerIdB, "each provider must have their own offer row for the same order");

  // Fired together, not sequentially — this is what the atomic conditional
  // update in matching/prisma-repository.ts (and the synchronous
  // check-and-set in memory-repository.ts) has to get right.
  const [resultA, resultB] = await Promise.all([
    app.inject({ method: "POST", url: `/provider/offers/${offerIdA}/accept`, headers: providerA.auth }),
    app.inject({ method: "POST", url: `/provider/offers/${offerIdB}/accept`, headers: providerB.auth }),
  ]);

  const statuses = [resultA.statusCode, resultB.statusCode].sort();
  assert.deepEqual(statuses, [200, 409], "exactly one accept succeeds and exactly one is rejected");

  const winner = resultA.statusCode === 200 ? providerA : providerB;
  const loserOfferId = resultA.statusCode === 200 ? offerIdB : offerIdA;

  // Only the winner can see the full order.
  const winnerView = await app.inject({ method: "GET", url: `/provider/orders/${orderId}`, headers: winner.auth });
  assert.equal(winnerView.statusCode, 200);

  // The loser's own offer row reflects that it's over, not stuck "pending" forever.
  const loserOffers = resultA.statusCode === 200
    ? await app.inject({ method: "GET", url: "/provider/offers", headers: providerB.auth })
    : await app.inject({ method: "GET", url: "/provider/offers", headers: providerA.auth });
  const loserOffer = loserOffers.json().offers.find((o: { offer: { id: string } }) => o.offer.id === loserOfferId);
  assert.equal(loserOffer.offer.status, "UNFULFILLED");

  // And the order itself only ever ended up assigned once.
  const customerView = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: customer.auth });
  assert.equal(customerView.json().order.status, "PROVIDER_ASSIGNED");
});

test("offer routes require a provider account, authenticated", async () => {
  const { app } = buildTestApp();
  const unauth = await app.inject({ method: "GET", url: "/provider/offers" });
  assert.equal(unauth.statusCode, 401);
});
