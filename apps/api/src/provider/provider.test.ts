import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp, seedUser } from "../auth/test-helpers";

type TestApp = ReturnType<typeof buildTestApp>["app"];

async function applyAsProvider(app: TestApp, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/provider/apply",
    payload: { email, password: "correct horse battery staple" },
  });
  return {
    token: res.json().accessToken as string,
    auth: { authorization: `Bearer ${res.json().accessToken}` },
    providerId: res.json().provider.id as string,
  };
}

test("applying as a provider creates an account at APPLICATION_STARTED, not customer and not pre-approved", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({
    method: "POST",
    url: "/provider/apply",
    payload: { email: "newprovider@example.com", password: "correct horse battery staple" },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.user.role, "provider");
  assert.equal(body.provider.status, "APPLICATION_STARTED");
});

test("a duplicate provider application email is rejected", async () => {
  const { app } = buildTestApp();
  const payload = { email: "dupprovider@example.com", password: "correct horse battery staple" };
  await app.inject({ method: "POST", url: "/provider/apply", payload });
  const second = await app.inject({ method: "POST", url: "/provider/apply", payload });
  assert.equal(second.statusCode, 409);
});

test("GET /provider/me starts empty and is off-limits to a customer account", async () => {
  const { app, repository, customerRepository } = buildTestApp();
  const { auth } = await applyAsProvider(app, "empty@example.com");

  const me = await app.inject({ method: "GET", url: "/provider/me", headers: auth });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json().capabilities, []);
  assert.deepEqual(me.json().serviceAreas, []);
  assert.deepEqual(me.json().availability, []);

  await seedUser(repository, { email: "cust@example.com", password: "correct horse battery staple", role: "customer" }, customerRepository);
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "cust@example.com", password: "correct horse battery staple" } });
  const customerAttempt = await app.inject({
    method: "GET",
    url: "/provider/me",
    headers: { authorization: `Bearer ${login.json().accessToken}` },
  });
  assert.equal(customerAttempt.statusCode, 403);
});

test("setting capabilities replaces the full set — removing one not resubmitted, keeping ones that are", async () => {
  const { app } = buildTestApp();
  const { auth } = await applyAsProvider(app, "caps@example.com");

  const first = await app.inject({
    method: "PUT",
    url: "/provider/capabilities",
    headers: auth,
    payload: { services: ["EVERYDAY_LAUNDRY", "TRAVEL"] },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().capabilities.length, 2);

  const second = await app.inject({
    method: "PUT",
    url: "/provider/capabilities",
    headers: auth,
    payload: { services: ["EVERYDAY_LAUNDRY"] },
  });
  const services = second.json().capabilities.map((c: { service: string }) => c.service);
  assert.deepEqual(services, ["EVERYDAY_LAUNDRY"]);
});

test("a provider can add and remove their own service area, but not another provider's", async () => {
  const { app } = buildTestApp();
  const providerA = await applyAsProvider(app, "areaA@example.com");
  const providerB = await applyAsProvider(app, "areaB@example.com");

  const created = await app.inject({
    method: "POST",
    url: "/provider/service-areas",
    headers: providerA.auth,
    payload: { postalPrefix: "941", radiusMiles: 15 },
  });
  assert.equal(created.statusCode, 201);
  const areaId = created.json().serviceArea.id as string;

  const bTriesToDelete = await app.inject({
    method: "DELETE",
    url: `/provider/service-areas/${areaId}`,
    headers: providerB.auth,
  });
  assert.equal(bTriesToDelete.statusCode, 404);

  const aDeletes = await app.inject({
    method: "DELETE",
    url: `/provider/service-areas/${areaId}`,
    headers: providerA.auth,
  });
  assert.equal(aDeletes.statusCode, 204);
});

test("an availability window with endsAt before startsAt is rejected", async () => {
  const { app } = buildTestApp();
  const { auth } = await applyAsProvider(app, "badwindow@example.com");
  const res = await app.inject({
    method: "POST",
    url: "/provider/availability",
    headers: auth,
    payload: { startsAt: "2026-01-05T19:00:00.000Z", endsAt: "2026-01-05T17:00:00.000Z" },
  });
  assert.equal(res.statusCode, 400);
});

test("submit-for-review is blocked until the application has at least one capability and one service area", async () => {
  const { app } = buildTestApp();
  const { auth } = await applyAsProvider(app, "incomplete@example.com");

  const tooEarly = await app.inject({ method: "POST", url: "/provider/submit-for-review", headers: auth });
  assert.equal(tooEarly.statusCode, 400);
  assert.equal(tooEarly.json().error, "APPLICATION_INCOMPLETE");

  await app.inject({ method: "PUT", url: "/provider/capabilities", headers: auth, payload: { services: ["EVERYDAY_LAUNDRY"] } });
  await app.inject({ method: "POST", url: "/provider/service-areas", headers: auth, payload: { postalPrefix: "941", radiusMiles: 15 } });

  const ready = await app.inject({ method: "POST", url: "/provider/submit-for-review", headers: auth });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().profile.status, "REVIEW_PENDING");
});

test("activate is blocked without an approved status and without an availability window, and only ops/admin can approve", async () => {
  const { app, repository, customerRepository } = buildTestApp();
  const { auth, providerId } = await applyAsProvider(app, "lifecycle@example.com");

  await app.inject({ method: "PUT", url: "/provider/capabilities", headers: auth, payload: { services: ["EVERYDAY_LAUNDRY"] } });
  await app.inject({ method: "POST", url: "/provider/service-areas", headers: auth, payload: { postalPrefix: "941", radiusMiles: 15 } });
  await app.inject({ method: "POST", url: "/provider/submit-for-review", headers: auth });

  // Not yet approved.
  const tooEarly = await app.inject({ method: "POST", url: "/provider/activate", headers: auth });
  assert.equal(tooEarly.statusCode, 400, "no availability window yet either");

  // A customer (no provider_approval grant) cannot approve.
  await seedUser(repository, { email: "cust2@example.com", password: "correct horse battery staple", role: "customer" }, customerRepository);
  const customerLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "cust2@example.com", password: "correct horse battery staple" } });
  const customerApproveAttempt = await app.inject({
    method: "POST",
    url: `/admin/providers/${providerId}/approve`,
    headers: { authorization: `Bearer ${customerLogin.json().accessToken}` },
  });
  assert.equal(customerApproveAttempt.statusCode, 403);

  // ops_manager can.
  await seedUser(repository, { email: "ops@example.com", password: "correct horse battery staple", role: "ops_manager" }, customerRepository);
  const opsLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ops@example.com", password: "correct horse battery staple" } });
  const approve = await app.inject({
    method: "POST",
    url: `/admin/providers/${providerId}/approve`,
    headers: { authorization: `Bearer ${opsLogin.json().accessToken}` },
  });
  assert.equal(approve.statusCode, 200);
  assert.equal(approve.json().profile.status, "APPROVED");

  // Approved but still no availability window.
  const stillNoAvailability = await app.inject({ method: "POST", url: "/provider/activate", headers: auth });
  assert.equal(stillNoAvailability.statusCode, 400);
  assert.equal(stillNoAvailability.json().error, "NO_AVAILABILITY_SET");

  await app.inject({
    method: "POST",
    url: "/provider/availability",
    headers: auth,
    payload: { startsAt: "2026-01-05T09:00:00.000Z", endsAt: "2026-01-05T17:00:00.000Z" },
  });

  const activated = await app.inject({ method: "POST", url: "/provider/activate", headers: auth });
  assert.equal(activated.statusCode, 200);
  assert.equal(activated.json().profile.status, "ACTIVE");
});

test("approving a provider that isn't in REVIEW_PENDING is rejected, not silently accepted", async () => {
  const { app, repository, customerRepository } = buildTestApp();
  const { providerId } = await applyAsProvider(app, "notready@example.com");

  await seedUser(repository, { email: "admin3@example.com", password: "correct horse battery staple", role: "admin" }, customerRepository);
  const adminLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "admin3@example.com", password: "correct horse battery staple" } });

  const res = await app.inject({
    method: "POST",
    url: `/admin/providers/${providerId}/approve`,
    headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().currentStatus, "APPLICATION_STARTED");
});

test("an unauthenticated request to any provider route is rejected", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/provider/me" });
  assert.equal(res.statusCode, 401);
});
