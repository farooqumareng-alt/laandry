import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp, seedUser } from "../auth/test-helpers";

type TestApp = ReturnType<typeof buildTestApp>["app"];

async function registerCustomerWithAddress(app: TestApp, email: string) {
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
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode: "62704" },
  });

  return { token, auth, addressId: address.json().address.id as string };
}

const PICKUP_WINDOW = {
  pickupWindowStart: "2026-01-05T17:00:00.000Z",
  pickupWindowEnd: "2026-01-05T19:00:00.000Z",
};

test("booking everyday laundry returns a server-computed quote matching the priced tier", async () => {
  const { app } = buildTestApp();
  const { auth, addressId } = await registerCustomerWithAddress(app, "book1@example.com");

  const res = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth,
    payload: {
      addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      service: "EVERYDAY_LAUNDRY",
      weightTier: "30_40",
    },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.quote.totalCents, 4500);
  assert.equal(body.order.status, "SCHEDULED");
  assert.equal(body.payment.status, "authorized");
});

test("booking garment-care items prices per item and matches the item-based catalog", async () => {
  const { app } = buildTestApp();
  const { auth, addressId } = await registerCustomerWithAddress(app, "book2@example.com");

  const res = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth,
    payload: {
      addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      service: "FORMAL_SPECIAL_CARE",
      items: [
        { description: "Shirt", quantity: 4 },
        { description: "Dress", quantity: 1 },
      ],
    },
  });

  assert.equal(res.statusCode, 201);
  // 4 shirts * 400 + 1 dress * 900 = 2500, exactly the minimum, so no adjustment line.
  assert.equal(res.json().quote.totalCents, 2500);
});

test("a client-supplied price is completely ignored — the server computes its own regardless of what rides along in the request", async () => {
  const { app } = buildTestApp();
  const { auth, addressId } = await registerCustomerWithAddress(app, "tamper@example.com");

  const res = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth,
    payload: {
      addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      service: "EVERYDAY_LAUNDRY",
      weightTier: "60_PLUS",
      // Attempted price tampering — none of this should affect anything.
      totalCents: 1,
      lineItems: [{ label: "hacked", amountCents: 1 }],
      subtotalCents: 1,
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.json().quote.totalCents, 8000, "must equal the real 60_PLUS tier price, not the smuggled value");
});

test("a declined payment method blocks the booking entirely — no order is created", async () => {
  const { app } = buildTestApp();
  const { auth, addressId } = await registerCustomerWithAddress(app, "declined@example.com");

  const res = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth,
    payload: {
      addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_declined",
      service: "EVERYDAY_LAUNDRY",
      weightTier: "20_30",
    },
  });
  assert.equal(res.statusCode, 402);
  assert.equal(res.json().error, "PAYMENT_DECLINED");

  const list = await app.inject({ method: "GET", url: "/orders", headers: auth });
  assert.equal(list.json().orders.length, 0);
});

test("booking against another customer's address id is rejected, not silently reassigned", async () => {
  const { app } = buildTestApp();
  const customerA = await registerCustomerWithAddress(app, "ownerA@example.com");
  const customerB = await registerCustomerWithAddress(app, "ownerB@example.com");

  const res = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customerB.auth,
    payload: {
      addressId: customerA.addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      service: "EVERYDAY_LAUNDRY",
      weightTier: "20_30",
    },
  });
  assert.equal(res.statusCode, 404);
});

test("an unauthenticated request to book is rejected, and a provider account can't book either", async () => {
  const { app, repository, customerRepository } = buildTestApp();

  const unauth = await app.inject({ method: "POST", url: "/orders", payload: {} });
  assert.equal(unauth.statusCode, 401);

  await seedUser(repository, { email: "provider@example.com", password: "correct horse battery staple", role: "provider" }, customerRepository);
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "provider@example.com", password: "correct horse battery staple" },
  });
  const providerAttempt = await app.inject({
    method: "POST",
    url: "/orders",
    headers: { authorization: `Bearer ${login.json().accessToken}` },
    payload: {},
  });
  assert.equal(providerAttempt.statusCode, 403);
});

test("Customer A cannot read Customer B's order — the exact §16 case", async () => {
  const { app } = buildTestApp();
  const customerA = await registerCustomerWithAddress(app, "peerA@example.com");
  const customerB = await registerCustomerWithAddress(app, "peerB@example.com");

  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: customerB.auth,
    payload: {
      addressId: customerB.addressId,
      ...PICKUP_WINDOW,
      paymentMethodToken: "tok_visa",
      service: "EVERYDAY_LAUNDRY",
      weightTier: "20_30",
    },
  });
  const orderId = booked.json().order.id as string;

  const aTriesToRead = await app.inject({
    method: "GET",
    url: `/orders/${orderId}`,
    headers: customerA.auth,
  });
  assert.equal(aTriesToRead.statusCode, 404, "must not reveal that this order id exists to a different customer");

  const bReadsOwn = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: customerB.auth });
  assert.equal(bReadsOwn.statusCode, 200);
  assert.equal(bReadsOwn.json().order.id, orderId);
});

test("GET /orders never returns another customer's orders", async () => {
  const { app } = buildTestApp();
  const customerA = await registerCustomerWithAddress(app, "listA@example.com");
  const customerB = await registerCustomerWithAddress(app, "listB@example.com");

  await app.inject({
    method: "POST",
    url: "/orders",
    headers: customerB.auth,
    payload: { addressId: customerB.addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", service: "EVERYDAY_LAUNDRY", weightTier: "20_30" },
  });

  const aList = await app.inject({ method: "GET", url: "/orders", headers: customerA.auth });
  assert.equal(aList.json().orders.length, 0);
});

test("the order's preference snapshot is frozen at booking time — a later preference change doesn't retroactively edit it", async () => {
  const { app } = buildTestApp();
  const { auth, addressId } = await registerCustomerWithAddress(app, "snapshot@example.com");

  await app.inject({
    method: "PUT",
    url: "/me/preferences",
    headers: auth,
    payload: { foldOrHang: "hang", ironingRequested: true },
  });

  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth,
    payload: { addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", service: "EVERYDAY_LAUNDRY", weightTier: "20_30" },
  });
  const orderId = booked.json().order.id as string;
  assert.equal(booked.json().order.preferenceSnapshot.foldOrHang, "hang");
  assert.ok(booked.json().quote.lineItems.some((li: { label: string }) => li.label === "Hang selected items"));

  await app.inject({
    method: "PUT",
    url: "/me/preferences",
    headers: auth,
    payload: { foldOrHang: "fold", ironingRequested: false },
  });

  const reread = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: auth });
  assert.equal(reread.json().order.preferenceSnapshot.foldOrHang, "hang", "the order's own snapshot must not change");
});

test("quote-preview returns the exact price booking will later charge, without creating an order or touching payment", async () => {
  const { app } = buildTestApp();
  const { auth, addressId } = await registerCustomerWithAddress(app, "preview@example.com");

  const preview = await app.inject({
    method: "POST",
    url: "/quote-preview",
    headers: auth,
    payload: { service: "EVERYDAY_LAUNDRY", weightTier: "40_60" },
  });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().totalCents, 6000);

  const listBefore = await app.inject({ method: "GET", url: "/orders", headers: auth });
  assert.equal(listBefore.json().orders.length, 0, "quote-preview must not create an order");

  const booked = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth,
    payload: { addressId, ...PICKUP_WINDOW, paymentMethodToken: "tok_visa", service: "EVERYDAY_LAUNDRY", weightTier: "40_60" },
  });
  assert.equal(booked.json().quote.totalCents, preview.json().totalCents);
});

test("a nonexistent order id returns 404, not 500", async () => {
  const { app } = buildTestApp();
  const { auth } = await registerCustomerWithAddress(app, "noorder@example.com");
  const res = await app.inject({
    method: "GET",
    url: "/orders/00000000-0000-0000-0000-000000000000",
    headers: auth,
  });
  assert.equal(res.statusCode, 404);
});
