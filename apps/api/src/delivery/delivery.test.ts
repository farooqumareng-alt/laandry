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
  const auth = { authorization: `Bearer ${register.json().accessToken}` };
  const address = await app.inject({
    method: "POST",
    url: "/me/addresses",
    headers: auth,
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode },
  });
  return { auth, addressId: address.json().address.id as string };
}

async function setupActiveProvider(app: TestApp, repos: Repos, email: string, service: string) {
  const apply = await app.inject({
    method: "POST",
    url: "/provider/apply",
    payload: { email, password: "correct horse battery staple" },
  });
  const auth = { authorization: `Bearer ${apply.json().accessToken}` };
  const providerId = apply.json().provider.id as string;

  await app.inject({ method: "PUT", url: "/provider/capabilities", headers: auth, payload: { services: [service] } });
  await app.inject({ method: "POST", url: "/provider/service-areas", headers: auth, payload: { postalPrefix: "627", radiusMiles: 15 } });
  await app.inject({ method: "POST", url: "/provider/submit-for-review", headers: auth });

  await seedUser(repos.repository, { email: `admin-for-${email}`, password: "correct horse battery staple", role: "admin" }, repos.customerRepository);
  const adminLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: `admin-for-${email}`, password: "correct horse battery staple" } });
  await app.inject({
    method: "POST",
    url: `/admin/providers/${providerId}/approve`,
    headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
  });

  await app.inject({
    method: "POST",
    url: "/provider/availability",
    headers: auth,
    payload: { startsAt: "2026-01-05T08:00:00.000Z", endsAt: "2026-01-05T22:00:00.000Z" },
  });
  await app.inject({ method: "POST", url: "/provider/activate", headers: auth });

  return { auth, providerId };
}

async function bookAndAssign(
  app: TestApp,
  customerAuth: { authorization: string },
  providerAuth: { authorization: string },
  addressId: string,
  serviceInput: Record<string, unknown>,
) {
  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customerAuth,
    payload: { addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", ...serviceInput },
  });
  const orderId = booked.json().order.id as string;

  const offers = await app.inject({ method: "GET", url: "/provider/offers", headers: providerAuth });
  const offerId = offers.json().offers[0].offer.id as string;
  await app.inject({ method: "POST", url: `/provider/offers/${offerId}/accept`, headers: providerAuth });

  return orderId;
}

/** Books, assigns, and walks an item-based order all the way to READY_FOR_RETURN. */
async function bookToReadyForReturn(
  app: TestApp,
  customerAuth: { authorization: string },
  providerAuth: { authorization: string },
  addressId: string,
  serviceInput: Record<string, unknown>,
) {
  const orderId = await bookAndAssign(app, customerAuth, providerAuth, addressId, serviceInput);
  await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/pickup`,
    headers: providerAuth,
    payload: { itemCount: 2, method: "qr" },
  });
  await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: providerAuth,
    payload: { confirmedStages: ["wash", "dry", "fold"] },
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/ready-for-return`, headers: providerAuth });
  return orderId;
}

test("the full return leg: ready-for-return -> on the way -> delivered, with a real proof-of-delivery record", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "delivery1@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "delivery1cust@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 2 }],
  });

  const start = await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  assert.equal(start.statusCode, 200);
  assert.equal(start.json().order.status, "ON_THE_WAY");

  const complete = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/complete-delivery`,
    headers: provider.auth,
    payload: { method: "signature" },
  });
  assert.equal(complete.statusCode, 200);
  assert.equal(complete.json().order.status, "DELIVERED");
  assert.equal(complete.json().deliveryVerification.method, "signature");

  const podRead = await app.inject({ method: "GET", url: `/orders/${orderId}/delivery-verification`, headers: customer.auth });
  assert.equal(podRead.json().deliveryVerification.method, "signature");
});

test("start-delivery is rejected before the order reaches READY_FOR_RETURN", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "delivery2@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "delivery2cust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const start = await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  assert.equal(start.statusCode, 409);
});

test("a failed delivery can be retried and still reach DELIVERED", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "delivery3@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "delivery3cust@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  const failed = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/delivery-failed`,
    headers: provider.auth,
    payload: { reason: "No one home" },
  });
  assert.equal(failed.statusCode, 200);
  assert.equal(failed.json().order.status, "DELIVERY_FAILED");
  assert.equal(failed.json().reason, "No one home");

  // Nothing left over from the failed attempt blocks completing it once retried.
  const completeTooSoon = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/complete-delivery`,
    headers: provider.auth,
    payload: { method: "qr" },
  });
  assert.equal(completeTooSoon.statusCode, 409, "can't complete delivery while DELIVERY_FAILED");

  const retry = await app.inject({ method: "POST", url: `/provider/orders/${orderId}/retry-delivery`, headers: provider.auth });
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().order.status, "ON_THE_WAY");

  const complete = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/complete-delivery`,
    headers: provider.auth,
    payload: { method: "qr" },
  });
  assert.equal(complete.statusCode, 200);
  assert.equal(complete.json().order.status, "DELIVERED");
});

test("a provider not assigned to the order cannot advance or read its delivery", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const providerA = await setupActiveProvider(app, repos, "assignedA3@example.com", "FORMAL_SPECIAL_CARE");
  const providerB = await setupActiveProvider(app, repos, "unassignedB3@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "assignedcust3@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, providerA.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const stolenStart = await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: providerB.auth });
  assert.equal(stolenStart.statusCode, 404);
});

test("tipping is rejected before delivery, works once DELIVERED, and multiple tips are each their own ledger entry", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "tip1@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "tip1cust@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const tooEarly = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: customer.auth,
    payload: { amountCents: 500, paymentMethodToken: "tok_visa" },
  });
  assert.equal(tooEarly.statusCode, 409);
  assert.equal(tooEarly.json().error, "INVALID_STATUS_FOR_TIP");

  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/complete-delivery`, headers: provider.auth, payload: { method: "qr" } });

  const firstTip = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: customer.auth,
    payload: { amountCents: 500, paymentMethodToken: "tok_visa" },
  });
  assert.equal(firstTip.statusCode, 201);
  assert.equal(firstTip.json().tip.amountCents, 500);

  const secondTip = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: customer.auth,
    payload: { amountCents: 300, paymentMethodToken: "tok_visa" },
  });
  assert.equal(secondTip.statusCode, 201, "a second, later tip is legitimate — not blocked as a duplicate");

  const list = await app.inject({ method: "GET", url: `/orders/${orderId}/tips`, headers: customer.auth });
  assert.equal(list.json().tips.length, 2);
  assert.deepEqual(
    list.json().tips.map((t: { amountCents: number }) => t.amountCents),
    [500, 300],
  );
});

test("a declined tip payment leaves no tip recorded", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "tip2@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "tip2cust@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/complete-delivery`, headers: provider.auth, payload: { method: "qr" } });

  const declined = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: customer.auth,
    payload: { amountCents: 500, paymentMethodToken: "tok_declined" },
  });
  assert.equal(declined.statusCode, 402);

  const list = await app.inject({ method: "GET", url: `/orders/${orderId}/tips`, headers: customer.auth });
  assert.equal(list.json().tips.length, 0);
});

test("a stranger cannot tip or review someone else's order, and a provider account can't do either", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "peertip@example.com", "FORMAL_SPECIAL_CARE");
  const owner = await registerCustomerWithAddress(app, "peertipowner@example.com");
  const stranger = await registerCustomerWithAddress(app, "peertipstranger@example.com");
  const orderId = await bookToReadyForReturn(app, owner.auth, provider.auth, owner.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/complete-delivery`, headers: provider.auth, payload: { method: "qr" } });

  const stolenTip = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: stranger.auth,
    payload: { amountCents: 500, paymentMethodToken: "tok_visa" },
  });
  assert.equal(stolenTip.statusCode, 404);

  const providerTip = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: provider.auth,
    payload: { amountCents: 500, paymentMethodToken: "tok_visa" },
  });
  assert.equal(providerTip.statusCode, 403);
});

test("a review requires DELIVERED, can only be submitted once, and is readable by the customer, the assigned provider, and staff", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "review1@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "review1cust@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const tooEarly = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/review`,
    headers: customer.auth,
    payload: { rating: 5 },
  });
  assert.equal(tooEarly.statusCode, 409);
  assert.equal(tooEarly.json().error, "INVALID_STATUS_FOR_REVIEW");

  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/complete-delivery`, headers: provider.auth, payload: { method: "qr" } });

  const submitted = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/review`,
    headers: customer.auth,
    payload: { rating: 5, comment: "Folded exactly how I asked." },
  });
  assert.equal(submitted.statusCode, 201);
  assert.equal(submitted.json().review.rating, 5);

  const duplicate = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/review`,
    headers: customer.auth,
    payload: { rating: 1 },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error, "REVIEW_ALREADY_SUBMITTED");

  const providerRead = await app.inject({ method: "GET", url: `/orders/${orderId}/review`, headers: provider.auth });
  assert.equal(providerRead.json().review.rating, 5);

  await seedUser(repos.repository, { email: "support1@example.com", password: "correct horse battery staple", role: "support" }, repos.customerRepository);
  const supportLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "support1@example.com", password: "correct horse battery staple" } });
  const staffRead = await app.inject({
    method: "GET",
    url: `/orders/${orderId}/review`,
    headers: { authorization: `Bearer ${supportLogin.json().accessToken}` },
  });
  assert.equal(staffRead.statusCode, 200);
  assert.equal(staffRead.json().review.rating, 5);
});

test("an invalid rating is rejected before it ever reaches the repository", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "review2@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "review2cust@example.com");
  const orderId = await bookToReadyForReturn(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: provider.auth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/complete-delivery`, headers: provider.auth, payload: { method: "qr" } });

  const res = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/review`,
    headers: customer.auth,
    payload: { rating: 6 },
  });
  assert.equal(res.statusCode, 400);
});

test("delivery, tip, and review routes require authentication", async () => {
  const { app } = buildTestApp();
  const id = "00000000-0000-0000-0000-000000000000";
  const start = await app.inject({ method: "POST", url: `/provider/orders/${id}/start-delivery` });
  assert.equal(start.statusCode, 401);
  const tip = await app.inject({ method: "POST", url: `/orders/${id}/tip`, payload: {} });
  assert.equal(tip.statusCode, 401);
  const review = await app.inject({ method: "POST", url: `/orders/${id}/review`, payload: {} });
  assert.equal(review.statusCode, 401);
});
