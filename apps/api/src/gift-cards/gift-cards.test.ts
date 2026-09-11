import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp, seedUser } from "../auth/test-helpers";

const PICKUP_WINDOW = {
  pickupWindowStart: "2026-01-05T17:00:00.000Z",
  pickupWindowEnd: "2026-01-05T19:00:00.000Z",
};

async function registerCustomerWithAddress(app: ReturnType<typeof buildTestApp>["app"], email: string) {
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
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode: "62704" },
  });
  return { auth, addressId: address.json().address.id as string };
}

test("purchasing a gift card charges the buyer and mints a redeemable code", async () => {
  const { app } = buildTestApp();
  const buyer = await registerCustomerWithAddress(app, "giftbuyer1@example.com");

  const purchase = await app.inject({
    method: "POST",
    url: "/gift-cards/purchase",
    headers: buyer.auth,
    payload: { valueCents: 5000, paymentMethodToken: "tok_visa" },
  });
  assert.equal(purchase.statusCode, 201);
  const giftCard = purchase.json().giftCard;
  assert.equal(giftCard.status, "UNREDEEMED");
  assert.equal(giftCard.valueCents, 5000);
  assert.ok(giftCard.code);

  const declined = await app.inject({
    method: "POST",
    url: "/gift-cards/purchase",
    headers: buyer.auth,
    payload: { valueCents: 5000, paymentMethodToken: "tok_declined" },
  });
  assert.equal(declined.statusCode, 402);

  const rejectedAmount = await app.inject({
    method: "POST",
    url: "/gift-cards/purchase",
    headers: buyer.auth,
    payload: { valueCents: 4999, paymentMethodToken: "tok_visa" },
  });
  assert.equal(rejectedAmount.statusCode, 400, "a non-denomination amount is rejected");
});

test("redeeming a gift card mints exactly one account-credit grant for its face value, and can't be redeemed twice", async () => {
  const { app } = buildTestApp();
  const buyer = await registerCustomerWithAddress(app, "giftbuyer2@example.com");
  const redeemer = await registerCustomerWithAddress(app, "giftredeemer2@example.com");

  const purchase = await app.inject({
    method: "POST",
    url: "/gift-cards/purchase",
    headers: buyer.auth,
    payload: { valueCents: 2500, paymentMethodToken: "tok_visa" },
  });
  const code = purchase.json().giftCard.code as string;

  // Lowercase on purpose — same normalization discipline as promo/referral codes.
  const redeem = await app.inject({
    method: "POST",
    url: "/gift-cards/redeem",
    headers: redeemer.auth,
    payload: { code: code.toLowerCase() },
  });
  assert.equal(redeem.statusCode, 200);
  assert.equal(redeem.json().giftCard.status, "REDEEMED");

  const balance = await app.inject({ method: "GET", url: "/me/credit", headers: redeemer.auth });
  assert.equal(balance.json().balanceCents, 2500);

  const secondRedeem = await app.inject({
    method: "POST",
    url: "/gift-cards/redeem",
    headers: redeemer.auth,
    payload: { code },
  });
  assert.equal(secondRedeem.statusCode, 409);

  const balanceAfter = await app.inject({ method: "GET", url: "/me/credit", headers: redeemer.auth });
  assert.equal(balanceAfter.json().balanceCents, 2500, "no second grant from the rejected re-redeem");
});

test("an unknown gift card code 404s", async () => {
  const { app } = buildTestApp();
  const redeemer = await registerCustomerWithAddress(app, "giftredeemer3@example.com");
  const redeem = await app.inject({
    method: "POST",
    url: "/gift-cards/redeem",
    headers: redeemer.auth,
    payload: { code: "NOSUCHCODE" },
  });
  assert.equal(redeem.statusCode, 404);
});

test("redeemed gift-card credit is spendable through the existing useAccountCredit booking path", async () => {
  const { app } = buildTestApp();
  const buyer = await registerCustomerWithAddress(app, "giftbuyer4@example.com");
  const redeemer = await registerCustomerWithAddress(app, "giftredeemer4@example.com");

  const purchase = await app.inject({
    method: "POST",
    url: "/gift-cards/purchase",
    headers: buyer.auth,
    payload: { valueCents: 2500, paymentMethodToken: "tok_visa" },
  });
  const code = purchase.json().giftCard.code as string;
  await app.inject({ method: "POST", url: "/gift-cards/redeem", headers: redeemer.auth, payload: { code } });

  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: redeemer.auth,
    payload: {
      addressId: redeemer.addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      useAccountCredit: true,
      service: "FORMAL_SPECIAL_CARE",
      items: [{ description: "Shirt", quantity: 1 }],
    },
  });
  assert.equal(booked.statusCode, 201);
  assert.equal(booked.json().payment.amountCents, booked.json().quote.totalCents, "charged the post-credit total");

  const balanceAfter = await app.inject({ method: "GET", url: "/me/credit", headers: redeemer.auth });
  assert.ok(balanceAfter.json().balanceCents < 2500, "some or all of the redeemed credit was spent at booking");
});

test("GET /me/gift-cards only lists the caller's own purchases", async () => {
  const { app } = buildTestApp();
  const buyerA = await registerCustomerWithAddress(app, "giftbuyerA@example.com");
  const buyerB = await registerCustomerWithAddress(app, "giftbuyerB@example.com");

  await app.inject({ method: "POST", url: "/gift-cards/purchase", headers: buyerA.auth, payload: { valueCents: 2500, paymentMethodToken: "tok_visa" } });
  await app.inject({ method: "POST", url: "/gift-cards/purchase", headers: buyerB.auth, payload: { valueCents: 5000, paymentMethodToken: "tok_visa" } });

  const listA = await app.inject({ method: "GET", url: "/me/gift-cards", headers: buyerA.auth });
  assert.equal(listA.json().giftCards.length, 1);
  assert.equal(listA.json().giftCards[0].valueCents, 2500);
});

test("GET /admin/gift-cards is staff-only", async () => {
  const repos = buildTestApp();
  const { app } = repos;
  const customer = await registerCustomerWithAddress(app, "giftadmin1@example.com");
  const denied = await app.inject({ method: "GET", url: "/admin/gift-cards", headers: customer.auth });
  assert.equal(denied.statusCode, 403);

  await seedUser(repos.repository, { email: "support4@example.com", password: "correct horse battery staple", role: "support" }, repos.customerRepository);
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "support4@example.com", password: "correct horse battery staple" } });
  const allowed = await app.inject({ method: "GET", url: "/admin/gift-cards", headers: { authorization: `Bearer ${login.json().accessToken}` } });
  assert.equal(allowed.statusCode, 200);
});

test("gift card routes require authentication", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/me/gift-cards" });
  assert.equal(res.statusCode, 401);
});
