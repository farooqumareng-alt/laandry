import assert from "node:assert/strict";
import { test } from "node:test";
import { computeOrderEarningCents } from "@laandry/domain";

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
  const apply = await app.inject({ method: "POST", url: "/provider/apply", payload: { email, password: "correct horse battery staple" } });
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

async function bookThroughDelivery(
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
  const totalCents = booked.json().quote.totalCents as number;

  const offers = await app.inject({ method: "GET", url: "/provider/offers", headers: providerAuth });
  const offerId = offers.json().offers[0].offer.id as string;
  await app.inject({ method: "POST", url: `/provider/offers/${offerId}/accept`, headers: providerAuth });

  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: providerAuth, payload: { itemCount: 1, method: "qr" } });
  await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: providerAuth,
    payload: { confirmedStages: ["wash", "dry", "fold"] },
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/ready-for-return`, headers: providerAuth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: providerAuth });
  await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/complete-delivery`,
    headers: providerAuth,
    payload: { method: "qr" },
  });
  return { orderId, totalCents };
}

test("delivering an order records the provider's 70% cut as a real earning", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "earn1@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "earn1cust@example.com");
  const { totalCents } = await bookThroughDelivery(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 7 }], // well above the minimum-order floor, no adjustment line to account for
  });
  const expectedEarningCents = computeOrderEarningCents(totalCents);

  const earnings = await app.inject({ method: "GET", url: "/provider/earnings", headers: provider.auth });
  assert.equal(earnings.statusCode, 200);
  assert.equal(earnings.json().earnings.length, 1);
  assert.equal(earnings.json().earnings[0].amountCents, expectedEarningCents);
  assert.equal(earnings.json().summary.totalEarnedCents, expectedEarningCents);
  assert.equal(earnings.json().summary.pendingCents, expectedEarningCents);
  assert.equal(earnings.json().summary.paidOutCents, 0);
});

test("a tip is recorded as a full-amount earning — no platform cut", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "earn2@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "earn2cust@example.com");
  const { orderId } = await bookThroughDelivery(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  await app.inject({
    method: "POST",
    url: `/orders/${orderId}/tip`,
    headers: customer.auth,
    payload: { amountCents: 500, paymentMethodToken: "tok_visa" },
  });

  const earnings = await app.inject({ method: "GET", url: "/provider/earnings", headers: provider.auth });
  const tipEarning = earnings.json().earnings.find((e: { amountCents: number }) => e.amountCents === 500);
  assert.ok(tipEarning, "the full $5.00 tip should be its own earning row, not reduced by the take rate");
});

test("running a payout pays out every provider's pending earnings, and a second run pays nothing", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "earn3@example.com", "FORMAL_SPECIAL_CARE");
  const customer = await registerCustomerWithAddress(app, "earn3cust@example.com");
  const { totalCents } = await bookThroughDelivery(app, customer.auth, provider.auth, customer.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 7 }],
  });
  const expectedEarningCents = computeOrderEarningCents(totalCents);

  await seedUser(repos.repository, { email: "finance1@example.com", password: "correct horse battery staple", role: "finance" }, repos.customerRepository);
  const financeLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "finance1@example.com", password: "correct horse battery staple" } });
  const financeAuth = { authorization: `Bearer ${financeLogin.json().accessToken}` };

  const run = await app.inject({ method: "POST", url: "/admin/payouts/run", headers: financeAuth });
  assert.equal(run.statusCode, 200);
  assert.equal(run.json().providersPaid, 1);
  assert.equal(run.json().payouts[0].amountCents, expectedEarningCents);
  assert.equal(run.json().payouts[0].status, "paid");

  const earningsAfter = await app.inject({ method: "GET", url: "/provider/earnings", headers: provider.auth });
  assert.equal(earningsAfter.json().summary.pendingCents, 0);
  assert.equal(earningsAfter.json().summary.paidOutCents, expectedEarningCents);

  const providerPayouts = await app.inject({ method: "GET", url: "/provider/payouts", headers: provider.auth });
  assert.equal(providerPayouts.json().payouts.length, 1);

  const runAgain = await app.inject({ method: "POST", url: "/admin/payouts/run", headers: financeAuth });
  assert.equal(runAgain.json().providersPaid, 0, "nothing pending left to pay");
});

test("only staff with a payout/write grant can run a payout — ops_manager (read-only on payouts) is rejected", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  await seedUser(repos.repository, { email: "opsmgr1@example.com", password: "correct horse battery staple", role: "ops_manager" }, repos.customerRepository);
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "opsmgr1@example.com", password: "correct horse battery staple" } });
  const res = await app.inject({
    method: "POST",
    url: "/admin/payouts/run",
    headers: { authorization: `Bearer ${login.json().accessToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test("a provider cannot list admin-wide earnings or payouts, and admin endpoints require a payout/read grant", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "earn4@example.com", "FORMAL_SPECIAL_CARE");

  const asProviderEarnings = await app.inject({ method: "GET", url: "/admin/earnings", headers: provider.auth });
  assert.equal(asProviderEarnings.statusCode, 403);
  const asProviderPayouts = await app.inject({ method: "GET", url: "/admin/payouts", headers: provider.auth });
  assert.equal(asProviderPayouts.statusCode, 403);

  await seedUser(repos.repository, { email: "admin5@example.com", password: "correct horse battery staple", role: "admin" }, repos.customerRepository);
  const adminLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "admin5@example.com", password: "correct horse battery staple" } });
  const adminAuth = { authorization: `Bearer ${adminLogin.json().accessToken}` };
  const asAdmin = await app.inject({ method: "GET", url: "/admin/earnings", headers: adminAuth });
  assert.equal(asAdmin.statusCode, 200);
});

test("earnings and payouts routes require authentication", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/provider/earnings" });
  assert.equal(res.statusCode, 401);
});
