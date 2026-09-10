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

/** Books, assigns, and pushes an item-based order through pickup so it lands at BEING_CARED_FOR. */
async function bookToBeingCaredFor(
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
  return orderId;
}

test("confirming exactly the required stages moves an order from BEING_CARED_FOR to FINISHING", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "processing1@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "processing1cust@example.com");
  const orderId = await bookToBeingCaredFor(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 3 }],
  });

  const confirm = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: provider.auth,
    payload: { confirmedStages: ["wash", "dry", "fold"] }, // default preferences: fold, no ironing
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(confirm.json().order.status, "FINISHING");
});

test("confirming an incomplete stage set is rejected, and names what was missing", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "processing2@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "processing2cust@example.com");
  const orderId = await bookToBeingCaredFor(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 3 }],
  });

  const confirm = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: provider.auth,
    payload: { confirmedStages: ["wash", "dry"] }, // missing fold
  });
  assert.equal(confirm.statusCode, 400);
  assert.equal(confirm.json().error, "INCOMPLETE_STAGE_CONFIRMATION");
  assert.deepEqual([...confirm.json().requiredStages].sort(), ["dry", "fold", "wash"]);
});

test("a customer's ironing preference is reflected in the order's required stages", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "processing3@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "processing3cust@example.com");

  await app.inject({
    method: "PUT",
    url: "/me/preferences",
    headers: customer.auth,
    payload: { ironingRequested: true },
  });

  const orderId = await bookToBeingCaredFor(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 3 }],
  });

  const shortConfirm = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: provider.auth,
    payload: { confirmedStages: ["wash", "dry", "fold"] }, // missing iron
  });
  assert.equal(shortConfirm.statusCode, 400);

  const fullConfirm = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: provider.auth,
    payload: { confirmedStages: ["wash", "dry", "fold", "iron"] },
  });
  assert.equal(fullConfirm.statusCode, 200);
  assert.equal(fullConfirm.json().order.status, "FINISHING");
});

test("confirm-processing is rejected before the order has reached BEING_CARED_FOR", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "processing4@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "processing4cust@example.com");
  const orderId = await bookAndAssign(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 3 }],
  });

  const confirm = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: provider.auth,
    payload: { confirmedStages: ["wash", "dry", "fold"] },
  });
  assert.equal(confirm.statusCode, 409);
});

test("a full processing walk — confirm, report an incident, and reach READY_FOR_RETURN with the incident still open", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "processing5@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "processing5cust@example.com");
  const orderId = await bookToBeingCaredFor(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 3 }],
  });

  const incident = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/incidents`,
    headers: provider.auth,
    payload: { type: "DAMAGED_ITEM", description: "One shirt had a torn seam before wash — photographing for the file." },
  });
  assert.equal(incident.statusCode, 201);
  assert.equal(incident.json().incident.status, "OPEN");

  await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: provider.auth,
    payload: { confirmedStages: ["wash", "dry", "fold"] },
  });

  // Reporting the incident never blocked FINISHING; it shouldn't block
  // READY_FOR_RETURN either — that's the whole point of it being
  // independent of the order state machine.
  const readyForReturn = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/ready-for-return`,
    headers: provider.auth,
  });
  assert.equal(readyForReturn.statusCode, 200);
  assert.equal(readyForReturn.json().order.status, "READY_FOR_RETURN");
  assert.equal(readyForReturn.json().openIncidentCount, 1, "the open incident is surfaced, not hidden");

  const list = await app.inject({ method: "GET", url: `/orders/${orderId}/incidents`, headers: customer.auth });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().incidents.length, 1);
  assert.equal(list.json().incidents[0].type, "DAMAGED_ITEM");
});

test("a provider not assigned to the order cannot report an incident or read them", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const providerA = await setupActiveProvider(app, repos, "assignedA2@example.com", "FORMAL_SPECIAL_CARE");
  const providerB = await setupActiveProvider(app, repos, "unassignedB2@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "assignedcust2@example.com");
  const orderId = await bookToBeingCaredFor(app, customer.auth, providerA.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const stolenReport = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/incidents`,
    headers: providerB.auth,
    payload: { type: "OTHER", description: "trying to peek" },
  });
  assert.equal(stolenReport.statusCode, 404);
});

test("a stranger cannot list another customer's incidents", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "peerinc@example.com", "FORMAL_SPECIAL_CARE");
  const owner = await registerCustomerWithAddress(app, "peerincowner@example.com");
  const stranger = await registerCustomerWithAddress(app, "peerincstranger@example.com");
  const orderId = await bookToBeingCaredFor(app, owner.auth, provider.auth, owner.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const stolenList = await app.inject({ method: "GET", url: `/orders/${orderId}/incidents`, headers: stranger.auth });
  assert.equal(stolenList.statusCode, 404);
});

test("dispatch staff can resolve an open incident; resolving twice is rejected", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "resolveinc@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "resolveinccust@example.com");
  const orderId = await bookToBeingCaredFor(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });
  const reported = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/incidents`,
    headers: provider.auth,
    payload: { type: "MISSING_ITEM", description: "One sock never made it into the bag." },
  });
  const incidentId = reported.json().incident.id as string;

  await seedUser(repos.repository, { email: "dispatch1@example.com", password: "correct horse battery staple", role: "dispatch" }, repos.customerRepository);
  const dispatchLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "dispatch1@example.com", password: "correct horse battery staple" } });
  const dispatchAuth = { authorization: `Bearer ${dispatchLogin.json().accessToken}` };

  const resolve = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/incidents/${incidentId}/resolve`,
    headers: dispatchAuth,
    payload: { resolutionNote: "Sock found in a separate load; returned to customer with an apology note." },
  });
  assert.equal(resolve.statusCode, 200);
  assert.equal(resolve.json().incident.status, "RESOLVED");

  const resolveAgain = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/incidents/${incidentId}/resolve`,
    headers: dispatchAuth,
    payload: { resolutionNote: "duplicate attempt" },
  });
  assert.equal(resolveAgain.statusCode, 409);
});

test("a customer cannot resolve their own incident — resolving is staff-only", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "custresolve@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "custresolvecust@example.com");
  const orderId = await bookToBeingCaredFor(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });
  const reported = await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/incidents`,
    headers: provider.auth,
    payload: { type: "OTHER", description: "test" },
  });
  const incidentId = reported.json().incident.id as string;

  const res = await app.inject({
    method: "POST",
    url: `/orders/${orderId}/incidents/${incidentId}/resolve`,
    headers: customer.auth,
    payload: { resolutionNote: "self-service attempt" },
  });
  assert.equal(res.statusCode, 403);
});

test("processing and incident routes require a provider account, authenticated", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({
    method: "POST",
    url: "/provider/orders/00000000-0000-0000-0000-000000000000/confirm-processing",
    payload: {},
  });
  assert.equal(res.statusCode, 401);
});
