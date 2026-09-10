import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { buildTestApp, seedUser } from "./test-helpers";

test("an unauthenticated request to a protected route is rejected", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/me" });
  assert.equal(res.statusCode, 401);
});

test("a well-formed but garbage bearer token is rejected, not crashed on", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/me", headers: { authorization: "Bearer not-a-real-token" } });
  assert.equal(res.statusCode, 401);
});

test("a customer cannot reach an admin-only route", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "cust@example.com", password: "correct horse battery staple", role: "customer" });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "cust@example.com", password: "correct horse battery staple" },
  });

  const res = await app.inject({
    method: "GET",
    url: "/admin/ping",
    headers: { authorization: `Bearer ${login.json().accessToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test("an admin can reach the admin-only route", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "admin2@example.com", password: "correct horse battery staple", role: "admin" });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin2@example.com", password: "correct horse battery staple" },
  });

  const res = await app.inject({
    method: "GET",
    url: "/admin/ping",
    headers: { authorization: `Bearer ${login.json().accessToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().pong, true);
});

test("a token signed with the wrong secret is rejected outright", async () => {
  const { app } = buildTestApp();
  const forged = jwt.sign({ sub: "someone", role: "customer" }, "not-the-real-secret-at-all", { expiresIn: "15m" });

  const res = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${forged}` } });
  assert.equal(res.statusCode, 401);
});

test("requireRole trusts the role inside a validly-signed token — documenting why JWT_SECRET must never leak", async () => {
  const { app, env } = buildTestApp();
  // A customer forging their own token to claim role: "admin" — possible
  // only if they already had the JWT_SECRET, which they never do in a real
  // deployment. This test documents what requireRole actually checks: the
  // role embedded in a *validly signed* token, nothing about the client.
  const forgedAdminToken = jwt.sign({ sub: "attacker", role: "admin" }, env.JWT_SECRET, { expiresIn: "15m" });

  const res = await app.inject({
    method: "GET",
    url: "/admin/ping",
    headers: { authorization: `Bearer ${forgedAdminToken}` },
  });
  // This succeeds — which is exactly why JWT_SECRET must never leak, and
  // why it's loaded from environment/secret storage, never hardcoded or
  // sent to a client. The real defense against role escalation is that an
  // attacker cannot produce a validly-signed token for a role they don't
  // have; see docs/ARCHITECTURE.md §7.
  assert.equal(res.statusCode, 200);
});

test("an expired access token is rejected", async () => {
  const { app, env } = buildTestApp();
  const expired = jwt.sign({ sub: "someone", role: "customer" }, env.JWT_SECRET, { expiresIn: "-1s" });

  const res = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${expired}` } });
  assert.equal(res.statusCode, 401);
});
