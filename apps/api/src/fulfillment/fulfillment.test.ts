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

/** Books an order and immediately accepts it as the given provider, landing the order at PROVIDER_ASSIGNED. */
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

test("an item-based order moves straight from pickup to BEING_CARED_FOR — no weight step needed", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "itempickup@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "itemcust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 3 }],
  });

  const pickup = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/pickup`,
    headers: provider.auth,
    payload: { itemCount: 3, method: "qr" },
  });
  assert.equal(pickup.statusCode, 200);
  assert.equal(pickup.json().order.status, "BEING_CARED_FOR");
});

test("a weight-based order within tolerance clears immediately on verify-weight", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "withintol@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "withintolcust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30", // estimated max 30lb, tolerance +5 = 35lb
  });

  const pickup = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/pickup`,
    headers: provider.auth,
    payload: { bagCount: 2, method: "signature" },
  });
  assert.equal(pickup.json().order.status, "PICKED_UP", "weight-based orders wait for a separate verify-weight call");

  const verify = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/verify-weight`,
    headers: provider.auth,
    payload: { verifiedWeightLb: 32 }, // within the 35lb tolerance ceiling
  });
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.json().weightVerification.requiredApproval, false);
  assert.equal(verify.json().order.status, "BEING_CARED_FOR");
});

test("a weight overage pauses the order for customer approval, and approving re-prices and adds a payment", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "overage@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "overagecust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30", // $35, estimated max 30lb
  });

  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });

  const verify = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/verify-weight`,
    headers: provider.auth,
    payload: { verifiedWeightLb: 45 }, // well past the 35lb tolerance ceiling -> resolves to the 40_60 tier ($60)
  });
  assert.equal(verify.json().weightVerification.requiredApproval, true);
  assert.equal(verify.json().order.status, "PICKED_UP", "must not silently proceed without approval");

  const pending = await app.inject({ method: "GET", url: `/orders/${orderId}/weight-verification`, headers: customer.auth });
  assert.equal(pending.json().weightVerification.approvedByCustomer, null);

  const approve = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/approve-weight`,
    headers: customer.auth,
    payload: { paymentMethodToken: "tok_visa" },
  });
  assert.equal(approve.statusCode, 200);
  assert.equal(approve.json().order.status, "BEING_CARED_FOR");
  assert.equal(approve.json().quote.totalCents, 6000, "re-priced at the 40_60 tier the verified weight actually falls into");
  assert.equal(approve.json().quote.version, 2);
});

test("declining a weight overage still proceeds the order, but at the original price with no new quote", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "decline@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "declinecust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/verify-weight`, headers: provider.auth, payload: { verifiedWeightLb: 45 } });

  const decline = await app.inject({ method: "POST", url: `/orders/${orderId}/decline-weight`, headers: customer.auth });
  assert.equal(decline.statusCode, 200);
  assert.equal(decline.json().order.status, "BEING_CARED_FOR");

  const check = await app.inject({ method: "GET", url: `/orders/${orderId}/weight-verification`, headers: customer.auth });
  assert.equal(check.json().weightVerification.approvedByCustomer, false);

  const orderView = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: customer.auth });
  assert.equal(orderView.json().quote.totalCents, 3500, "no repricing happened — still the original 20_30 tier price");
});

test("a declined additional payment blocks approval — the order stays PICKED_UP, not silently advanced", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "declinepay@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "declinepaycust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/verify-weight`, headers: provider.auth, payload: { verifiedWeightLb: 45 } });

  const approve = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/approve-weight`,
    headers: customer.auth,
    payload: { paymentMethodToken: "tok_declined" },
  });
  assert.equal(approve.statusCode, 402);

  const orderView = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: customer.auth });
  assert.equal(orderView.json().order.status, "PICKED_UP");
});

test("a provider not assigned to the order cannot verify its pickup or weight", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const providerA = await setupActiveProvider(app, repos, "assignedA@example.com", "EVERYDAY_LAUNDRY");
  const providerB = await setupActiveProvider(app, repos, "unassignedB@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "assignedcust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, providerA.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
  });

  const stolenPickup = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/pickup`,
    headers: providerB.auth,
    payload: { method: "qr" },
  });
  assert.equal(stolenPickup.statusCode, 404);
});

test("verify-weight on an item-based order is rejected outright", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "notweight@example.com", "BEDDING_HOUSEHOLD");
  const customer = await registerCustomerWithAddress(app, "notweightcust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "BEDDING_HOUSEHOLD",
    items: [{ description: "Sheets", quantity: 2 }],
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });

  const res = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/verify-weight`,
    headers: provider.auth,
    payload: { verifiedWeightLb: 10 },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "NOT_A_WEIGHT_BASED_ORDER");
});

test("picking up the same order twice is rejected the second time", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "doublepickup@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "doublepickupcust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
  });

  const first = await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });
  assert.equal(first.statusCode, 200);
  const second = await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });
  assert.equal(second.statusCode, 409);
});

test("a different customer cannot approve or decline someone else's weight overage", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "peerweight@example.com", "EVERYDAY_LAUNDRY");
  const owner = await registerCustomerWithAddress(app, "peerowner@example.com");
  const stranger = await registerCustomerWithAddress(app, "peerstranger@example.com");
  const orderId = await bookAndAssign(app, owner.auth, provider.auth, owner.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: provider.auth, payload: { method: "qr" } });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/verify-weight`, headers: provider.auth, payload: { verifiedWeightLb: 45 } });

  const stolenApprove = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/approve-weight`,
    headers: stranger.auth,
    payload: { paymentMethodToken: "tok_visa" },
  });
  assert.equal(stolenApprove.statusCode, 404);
});

test("approving without a pending weight approval is rejected, not a silent no-op", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "nopending@example.com", "EVERYDAY_LAUNDRY");
  const customer = await registerCustomerWithAddress(app, "nopendingcust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "EVERYDAY_LAUNDRY",
    weightTier: "20_30",
  });

  const res = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/approve-weight`,
    headers: customer.auth,
    payload: { paymentMethodToken: "tok_visa" },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "NO_PENDING_WEIGHT_APPROVAL");
});

test("pickup and weight routes require a provider account, authenticated", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "POST", url: "/provider/orders/00000000-0000-0000-0000-000000000000/pickup", payload: {} });
  assert.equal(res.statusCode, 401);
});
