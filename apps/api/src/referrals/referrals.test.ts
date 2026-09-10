import assert from "node:assert/strict";
import { test } from "node:test";
import { REFERRAL_CREDIT_CENTS } from "@laandry/domain";

import { buildTestApp, seedUser } from "../auth/test-helpers";

type TestApp = ReturnType<typeof buildTestApp>["app"];
type Repos = ReturnType<typeof buildTestApp>;

const PICKUP_WINDOW = {
  pickupWindowStart: "2026-01-05T17:00:00.000Z",
  pickupWindowEnd: "2026-01-05T19:00:00.000Z",
};

async function registerCustomerWithAddress(app: TestApp, email: string, referralCode?: string) {
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct horse battery staple", ...(referralCode ? { referralCode } : {}) },
  });
  assert.equal(register.statusCode, 201, "registration must never fail because of the referral code");
  const auth = { authorization: `Bearer ${register.json().accessToken}` };
  const address = await app.inject({
    method: "POST",
    url: "/me/addresses",
    headers: auth,
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode: "62704" },
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

/** Books, assigns, and delivers an item-based order end to end — the qualifying event for a referral, and a real earning-generating event. */
async function bookToDelivered(
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
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/pickup`, headers: providerAuth, payload: { itemCount: 1, method: "qr" } });
  await app.inject({
    method: "POST",
    url: `/provider/orders/${orderId}/confirm-processing`,
    headers: providerAuth,
    payload: { confirmedStages: ["wash", "dry", "fold"] },
  });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/ready-for-return`, headers: providerAuth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/start-delivery`, headers: providerAuth });
  await app.inject({ method: "POST", url: `/provider/orders/${orderId}/complete-delivery`, headers: providerAuth, payload: { method: "qr" } });
  return orderId;
}

test("a referral code is lazily generated and stable across repeat calls", async () => {
  const { app } = buildTestApp();
  const customer = await registerCustomerWithAddress(app, "refcode1@example.com");
  const first = await app.inject({ method: "GET", url: "/me/referral-code", headers: customer.auth });
  const second = await app.inject({ method: "GET", url: "/me/referral-code", headers: customer.auth });
  assert.equal(first.statusCode, 200);
  assert.ok(first.json().code);
  assert.equal(first.json().code, second.json().code);
});

test("registering with a real referral code links the two customers; an unknown code is silently ignored, not an error", async () => {
  const { app } = buildTestApp();
  const referrer = await registerCustomerWithAddress(app, "referrer1@example.com");
  const codeRes = await app.inject({ method: "GET", url: "/me/referral-code", headers: referrer.auth });
  const code = codeRes.json().code as string;

  // Lowercase on purpose — codes are normalized the same way promo codes are.
  const referee = await registerCustomerWithAddress(app, "referee1@example.com", code.toLowerCase());
  const refereeCredit = await app.inject({ method: "GET", url: "/me/credit", headers: referee.auth });
  assert.equal(refereeCredit.json().balanceCents, 0, "linked, but not yet qualified — no credit until the qualifying event");

  // An unknown code doesn't fail registration or create a phantom link.
  const strayReg = await registerCustomerWithAddress(app, "stray1@example.com", "NOSUCHCODE");
  const strayCredit = await app.inject({ method: "GET", url: "/me/credit", headers: strayReg.auth });
  assert.equal(strayCredit.json().balanceCents, 0);
});

test("the referee's first DELIVERED order qualifies the referral and credits both parties exactly once", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "refprov1@example.com", "FORMAL_SPECIAL_CARE");

  const referrer = await registerCustomerWithAddress(app, "referrer2@example.com");
  const codeRes = await app.inject({ method: "GET", url: "/me/referral-code", headers: referrer.auth });
  const code = codeRes.json().code as string;
  const referee = await registerCustomerWithAddress(app, "referee2@example.com", code);

  await bookToDelivered(app, referee.auth, provider.auth, referee.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });

  const refereeCredit = await app.inject({ method: "GET", url: "/me/credit", headers: referee.auth });
  assert.equal(refereeCredit.json().balanceCents, REFERRAL_CREDIT_CENTS);
  const referrerCredit = await app.inject({ method: "GET", url: "/me/credit", headers: referrer.auth });
  assert.equal(referrerCredit.json().balanceCents, REFERRAL_CREDIT_CENTS);

  // A second delivered order for the same (already-qualified) referee grants nothing further.
  await bookToDelivered(app, referee.auth, provider.auth, referee.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }],
  });
  const refereeCreditAfter = await app.inject({ method: "GET", url: "/me/credit", headers: referee.auth });
  assert.equal(refereeCreditAfter.json().balanceCents, REFERRAL_CREDIT_CENTS, "no second grant — the referral already qualified");
});

test("useAccountCredit spends the real balance at booking, capped at the order total, and never below zero", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const provider = await setupActiveProvider(app, repos, "refprov2@example.com", "FORMAL_SPECIAL_CARE");

  const referrer = await registerCustomerWithAddress(app, "referrer3@example.com");
  const codeRes = await app.inject({ method: "GET", url: "/me/referral-code", headers: referrer.auth });
  const referee = await registerCustomerWithAddress(app, "referee3@example.com", codeRes.json().code);

  await bookToDelivered(app, referee.auth, provider.auth, referee.addressId, {
    service: "FORMAL_SPECIAL_CARE",
    items: [{ description: "Shirt", quantity: 1 }], // qualifies the referral -> referee now has REFERRAL_CREDIT_CENTS available
  });

  const preview = await app.inject({
    method: "POST",
    url: "/quote-preview",
    headers: referee.auth,
    payload: { service: "FORMAL_SPECIAL_CARE", items: [{ description: "Shirt", quantity: 1 }], useAccountCredit: true },
  });
  assert.ok(preview.json().lineItems.some((li: { label: string }) => li.label === "Account credit applied"));

  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: referee.auth,
    payload: { addressId: referee.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", useAccountCredit: true, service: "FORMAL_SPECIAL_CARE", items: [{ description: "Shirt", quantity: 1 }] },
  });
  assert.equal(booked.statusCode, 201);
  assert.equal(booked.json().payment.amountCents, booked.json().quote.totalCents, "charged the post-credit total, not the pre-credit one");

  const balanceAfter = await app.inject({ method: "GET", url: "/me/credit", headers: referee.auth });
  assert.equal(balanceAfter.json().balanceCents, 0, "the full available credit was spent, capped at the order total — never negative");
});

test("GET /admin/referrals is staff-only", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const customer = await registerCustomerWithAddress(app, "refadmin1@example.com");
  const denied = await app.inject({ method: "GET", url: "/admin/referrals", headers: customer.auth });
  assert.equal(denied.statusCode, 403);

  await seedUser(repos.repository, { email: "support3@example.com", password: "correct horse battery staple", role: "support" }, repos.customerRepository);
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "support3@example.com", password: "correct horse battery staple" } });
  const allowed = await app.inject({ method: "GET", url: "/admin/referrals", headers: { authorization: `Bearer ${login.json().accessToken}` } });
  assert.equal(allowed.statusCode, 200);
});

test("referral and credit routes require authentication", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/me/referral-code" });
  assert.equal(res.statusCode, 401);
});
