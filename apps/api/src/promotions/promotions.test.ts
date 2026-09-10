import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp, seedUser } from "../auth/test-helpers";

type TestApp = ReturnType<typeof buildTestApp>["app"];

const PICKUP_WINDOW = {
  pickupWindowStart: "2026-01-05T17:00:00.000Z",
  pickupWindowEnd: "2026-01-05T19:00:00.000Z",
};

async function registerCustomerWithAddress(app: TestApp, email: string) {
  const register = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "correct horse battery staple" } });
  const auth = { authorization: `Bearer ${register.json().accessToken}` };
  const address = await app.inject({
    method: "POST",
    url: "/me/addresses",
    headers: auth,
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode: "62704" },
  });
  return { auth, addressId: address.json().address.id as string };
}

async function opsAuth(repos: ReturnType<typeof buildTestApp>) {
  await seedUser(repos.repository, { email: "ops1@example.com", password: "correct horse battery staple", role: "ops_manager" }, repos.customerRepository);
  const login = await repos.app.inject({ method: "POST", url: "/auth/login", payload: { email: "ops1@example.com", password: "correct horse battery staple" } });
  return { authorization: `Bearer ${login.json().accessToken}` };
}

test("ops_manager can create a promo code; finance (read-only on pricing_rule) cannot", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const auth = await opsAuth(repos);

  const created = await app.inject({
    method: "POST",
    url: "/admin/promotions",
    headers: auth,
    payload: { code: "welcome10", discountType: "PERCENTAGE", discountValue: 10 },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().promotion.code, "WELCOME10", "the code is normalized to uppercase");

  await seedUser(repos.repository, { email: "finance2@example.com", password: "correct horse battery staple", role: "finance" }, repos.customerRepository);
  const financeLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "finance2@example.com", password: "correct horse battery staple" } });
  const financeAttempt = await app.inject({
    method: "POST",
    url: "/admin/promotions",
    headers: { authorization: `Bearer ${financeLogin.json().accessToken}` },
    payload: { code: "OTHER", discountType: "PERCENTAGE", discountValue: 10 },
  });
  assert.equal(financeAttempt.statusCode, 403);

  const list = await app.inject({ method: "GET", url: "/admin/promotions", headers: { authorization: `Bearer ${financeLogin.json().accessToken}` } });
  assert.equal(list.statusCode, 200, "finance can still read");
  assert.equal(list.json().promotions.length, 1);
});

test("a duplicate code is rejected, and toggling active/inactive works, including 404 on a bad id", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const auth = await opsAuth(repos);

  await app.inject({ method: "POST", url: "/admin/promotions", headers: auth, payload: { code: "DUPE", discountType: "FIXED_AMOUNT", discountValue: 500 } });
  const dupe = await app.inject({ method: "POST", url: "/admin/promotions", headers: auth, payload: { code: "DUPE", discountType: "FIXED_AMOUNT", discountValue: 500 } });
  assert.equal(dupe.statusCode, 409);

  const list = await app.inject({ method: "GET", url: "/admin/promotions", headers: auth });
  const id = list.json().promotions[0].id;

  const off = await app.inject({ method: "PATCH", url: `/admin/promotions/${id}`, headers: auth, payload: { active: false } });
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().promotion.active, false);

  const notFound = await app.inject({ method: "PATCH", url: "/admin/promotions/00000000-0000-0000-0000-000000000000", headers: auth, payload: { active: true } });
  assert.equal(notFound.statusCode, 404);
});

test("quote-preview applies a percentage discount as a visible line item and reduces the total", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const auth = await opsAuth(repos);
  await app.inject({ method: "POST", url: "/admin/promotions", headers: auth, payload: { code: "SAVE10", discountType: "PERCENTAGE", discountValue: 10 } });

  const customer = await registerCustomerWithAddress(app, "promocust1@example.com");
  const preview = await app.inject({
    method: "POST",
    url: "/quote-preview",
    headers: customer.auth,
    payload: { service: "EVERYDAY_LAUNDRY", weightTier: "30_40", promoCode: "save10" },
  });
  assert.equal(preview.statusCode, 200);
  const body = preview.json();
  assert.equal(body.promoDiscountCents, Math.floor(body.subtotalCents * 0.1));
  assert.equal(body.totalCents, body.subtotalCents - body.promoDiscountCents);
  assert.ok(body.lineItems.some((li: { label: string; amountCents: number }) => li.label === "Promo: SAVE10" && li.amountCents < 0));
});

test("an unknown promo code is rejected at preview, not silently ignored", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const customer = await registerCustomerWithAddress(app, "promocust2@example.com");
  const preview = await app.inject({
    method: "POST",
    url: "/quote-preview",
    headers: customer.auth,
    payload: { service: "EVERYDAY_LAUNDRY", weightTier: "30_40", promoCode: "NOPE" },
  });
  assert.equal(preview.statusCode, 400);
  assert.equal(preview.json().error, "PROMO_NOT_FOUND");
});

test("booking with a valid promo charges the discounted total, and the code can't be reused past its per-customer limit", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const auth = await opsAuth(repos);
  await app.inject({ method: "POST", url: "/admin/promotions", headers: auth, payload: { code: "ONCE", discountType: "FIXED_AMOUNT", discountValue: 1000 } });

  const customer = await registerCustomerWithAddress(app, "promocust3@example.com");
  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customer.auth,
    payload: { addressId: customer.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", promoCode: "once", service: "EVERYDAY_LAUNDRY", weightTier: "30_40" },
  });
  assert.equal(booked.statusCode, 201);
  const quote = booked.json().quote;
  assert.equal(quote.promoDiscountCents, 1000);
  assert.equal(booked.json().payment.amountCents, quote.totalCents, "the real charge is for the discounted total, not the pre-discount subtotal");

  // A second order, same customer, same code — perCustomerLimit defaults to 1.
  const secondBooking = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customer.auth,
    payload: { addressId: customer.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", promoCode: "ONCE", service: "EVERYDAY_LAUNDRY", weightTier: "30_40" },
  });
  assert.equal(secondBooking.statusCode, 400);
  assert.equal(secondBooking.json().error, "PROMO_ALREADY_USED_BY_CUSTOMER");
});

test("a maxRedemptions ceiling blocks a second customer once it's reached, even though each is within their own per-customer limit", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const auth = await opsAuth(repos);
  await app.inject({
    method: "POST",
    url: "/admin/promotions",
    headers: auth,
    payload: { code: "LIMITED", discountType: "FIXED_AMOUNT", discountValue: 500, maxRedemptions: 1 },
  });

  const customerA = await registerCustomerWithAddress(app, "promocustA@example.com");
  const bookedA = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customerA.auth,
    payload: { addressId: customerA.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", promoCode: "LIMITED", service: "EVERYDAY_LAUNDRY", weightTier: "30_40" },
  });
  assert.equal(bookedA.statusCode, 201);

  const customerB = await registerCustomerWithAddress(app, "promocustB@example.com");
  const bookedB = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customerB.auth,
    payload: { addressId: customerB.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", promoCode: "LIMITED", service: "EVERYDAY_LAUNDRY", weightTier: "30_40" },
  });
  assert.equal(bookedB.statusCode, 400);
  assert.equal(bookedB.json().error, "PROMO_MAX_REDEMPTIONS_REACHED");
});

test("an inactive promo is rejected even if the code is otherwise correct", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const auth = await opsAuth(repos);
  const created = await app.inject({ method: "POST", url: "/admin/promotions", headers: auth, payload: { code: "OFFCODE", discountType: "PERCENTAGE", discountValue: 15 } });
  await app.inject({ method: "PATCH", url: `/admin/promotions/${created.json().promotion.id}`, headers: auth, payload: { active: false } });

  const customer = await registerCustomerWithAddress(app, "promocust4@example.com");
  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customer.auth,
    payload: { addressId: customer.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", promoCode: "OFFCODE", service: "EVERYDAY_LAUNDRY", weightTier: "30_40" },
  });
  assert.equal(booked.statusCode, 400);
  assert.equal(booked.json().error, "PROMO_INACTIVE");
});

test("promotions admin routes require authentication", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/admin/promotions" });
  assert.equal(res.statusCode, 401);
});
