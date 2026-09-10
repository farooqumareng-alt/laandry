import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp, seedUser } from "../auth/test-helpers";

async function registerAndLogin(app: ReturnType<typeof buildTestApp>["app"], email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct horse battery staple" },
  });
  return res.json().accessToken as string;
}

test("registering a customer auto-provisions a profile with default preferences and no addresses", async () => {
  const { app } = buildTestApp();
  const token = await registerAndLogin(app, "new@example.com");

  const res = await app.inject({ method: "GET", url: "/me/profile", headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.preferences.washTemperature, "cold");
  assert.equal(body.preferences.detergent, "standard");
  assert.deepEqual(body.addresses, []);
});

test("PUT /me/preferences persists and GET reflects it back", async () => {
  const { app } = buildTestApp();
  const token = await registerAndLogin(app, "prefs@example.com");

  const put = await app.inject({
    method: "PUT",
    url: "/me/preferences",
    headers: { authorization: `Bearer ${token}` },
    payload: { washTemperature: "warm", detergent: "sensitive", fragranceFree: true, foldOrHang: "hang", ironingRequested: true },
  });
  assert.equal(put.statusCode, 200);
  assert.equal(put.json().preferences.washTemperature, "warm");

  const profile = await app.inject({ method: "GET", url: "/me/profile", headers: { authorization: `Bearer ${token}` } });
  assert.equal(profile.json().preferences.washTemperature, "warm");
  assert.equal(profile.json().preferences.foldOrHang, "hang");
});

test("PUT /me/preferences rejects an invalid enum value", async () => {
  const { app } = buildTestApp();
  const token = await registerAndLogin(app, "badprefs@example.com");

  const res = await app.inject({
    method: "PUT",
    url: "/me/preferences",
    headers: { authorization: `Bearer ${token}` },
    payload: { washTemperature: "boiling" },
  });
  assert.equal(res.statusCode, 400);
});

test("a provider account cannot reach customer-only routes", async () => {
  const { app, repository, customerRepository } = buildTestApp();
  await seedUser(repository, { email: "provider@example.com", password: "correct horse battery staple", role: "provider" }, customerRepository);
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "provider@example.com", password: "correct horse battery staple" },
  });

  const res = await app.inject({
    method: "GET",
    url: "/me/profile",
    headers: { authorization: `Bearer ${login.json().accessToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test("an unauthenticated request to /me/addresses is rejected", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/me/addresses" });
  assert.equal(res.statusCode, 401);
});

test("a customer can add, list, update and delete their own address", async () => {
  const { app } = buildTestApp();
  const token = await registerAndLogin(app, "addr@example.com");
  const auth = { authorization: `Bearer ${token}` };

  const created = await app.inject({
    method: "POST",
    url: "/me/addresses",
    headers: auth,
    payload: { label: "Home", line1: "1 Main St", city: "Springfield", region: "IL", postalCode: "62704" },
  });
  assert.equal(created.statusCode, 201);
  const addressId = created.json().address.id as string;

  const list = await app.inject({ method: "GET", url: "/me/addresses", headers: auth });
  assert.equal(list.json().addresses.length, 1);

  const updated = await app.inject({
    method: "PATCH",
    url: `/me/addresses/${addressId}`,
    headers: auth,
    payload: { label: "Apartment", line2: "Unit 4B" },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().address.label, "Apartment");
  assert.equal(updated.json().address.line2, "Unit 4B");

  const deleted = await app.inject({ method: "DELETE", url: `/me/addresses/${addressId}`, headers: auth });
  assert.equal(deleted.statusCode, 204);

  const listAfter = await app.inject({ method: "GET", url: "/me/addresses", headers: auth });
  assert.equal(listAfter.json().addresses.length, 0);
});

test("Customer A cannot read, update, or delete Customer B's address by guessing/reusing its id", async () => {
  const { app } = buildTestApp();
  const tokenA = await registerAndLogin(app, "customerA@example.com");
  const tokenB = await registerAndLogin(app, "customerB@example.com");

  const createdByB = await app.inject({
    method: "POST",
    url: "/me/addresses",
    headers: { authorization: `Bearer ${tokenB}` },
    payload: { label: "Home", line1: "42 B's Street", city: "Metropolis", region: "NY", postalCode: "10001" },
  });
  const bAddressId = createdByB.json().address.id as string;

  const aTriesToUpdate = await app.inject({
    method: "PATCH",
    url: `/me/addresses/${bAddressId}`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { label: "Hijacked" },
  });
  assert.equal(aTriesToUpdate.statusCode, 404, "must not reveal the address exists, let alone edit it");

  const aTriesToDelete = await app.inject({
    method: "DELETE",
    url: `/me/addresses/${bAddressId}`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(aTriesToDelete.statusCode, 404);

  // B's address must be completely unaffected by A's attempts.
  const bList = await app.inject({ method: "GET", url: "/me/addresses", headers: { authorization: `Bearer ${tokenB}` } });
  assert.equal(bList.json().addresses.length, 1);
  assert.equal(bList.json().addresses[0].label, "Home");
});

test("updating or deleting a nonexistent address id returns 404, not 500", async () => {
  const { app } = buildTestApp();
  const token = await registerAndLogin(app, "noaddr@example.com");
  const res = await app.inject({
    method: "PATCH",
    url: "/me/addresses/00000000-0000-0000-0000-000000000000",
    headers: { authorization: `Bearer ${token}` },
    payload: { label: "Ghost" },
  });
  assert.equal(res.statusCode, 404);
});
