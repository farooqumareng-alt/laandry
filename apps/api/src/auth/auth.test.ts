import assert from "node:assert/strict";
import { test } from "node:test";
import * as OTPAuth from "otpauth";

import { buildTestApp, seedUser } from "./test-helpers";

function currentTotpCode(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();
}

test("register creates a CUSTOMER account and returns a usable session", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "amina@example.com", password: "correct horse battery staple" },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.user.role, "customer");
  assert.ok(body.accessToken);
  assert.ok(body.refreshToken);

  const me = await app.inject({
    method: "GET",
    url: "/me",
    headers: { authorization: `Bearer ${body.accessToken}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().email, "amina@example.com");
});

test("register rejects a duplicate email", async () => {
  const { app } = buildTestApp();
  const payload = { email: "dup@example.com", password: "correct horse battery staple" };
  await app.inject({ method: "POST", url: "/auth/register", payload });
  const second = await app.inject({ method: "POST", url: "/auth/register", payload });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error, "EMAIL_ALREADY_REGISTERED");
});

test("register rejects a short password before it ever reaches hashing", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "short@example.com", password: "tooshort" },
  });
  assert.equal(res.statusCode, 400);
});

test("login fails with the same generic error for a wrong password and for a nonexistent email", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "real@example.com", password: "correct horse battery staple", role: "customer" });

  const wrongPassword = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "real@example.com", password: "definitely wrong" },
  });
  const noSuchUser = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "nobody@example.com", password: "whatever it is" },
  });

  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(noSuchUser.statusCode, 401);
  assert.deepEqual(wrongPassword.json(), noSuchUser.json());
});

test("login succeeds with the right password and issues a session", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "ok@example.com", password: "correct horse battery staple", role: "customer" });

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "ok@example.com", password: "correct horse battery staple" },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().accessToken);
});

test("a privileged role without MFA enrolled yet can still log in, flagged mfaSetupRequired", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "newadmin@example.com", password: "correct horse battery staple", role: "admin" });

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "newadmin@example.com", password: "correct horse battery staple" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().mfaSetupRequired, true);
});

test("once MFA is enrolled and enabled, login without a code is blocked and a valid code is required", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "admin@example.com", password: "correct horse battery staple", role: "admin" });

  const firstLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@example.com", password: "correct horse battery staple" },
  });
  const accessToken = firstLogin.json().accessToken as string;

  const enroll = await app.inject({
    method: "POST",
    url: "/auth/mfa/enroll",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const { secret } = enroll.json();

  const verify = await app.inject({
    method: "POST",
    url: "/auth/mfa/verify",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { code: currentTotpCode(secret) },
  });
  assert.equal(verify.statusCode, 200);

  const loginWithoutCode = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@example.com", password: "correct horse battery staple" },
  });
  assert.equal(loginWithoutCode.statusCode, 401);
  assert.equal(loginWithoutCode.json().error, "MFA_REQUIRED");

  const loginWithBadCode = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@example.com", password: "correct horse battery staple", mfaCode: "000000" },
  });
  assert.equal(loginWithBadCode.statusCode, 401);

  const loginWithGoodCode = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@example.com", password: "correct horse battery staple", mfaCode: currentTotpCode(secret) },
  });
  assert.equal(loginWithGoodCode.statusCode, 200);
  assert.ok(loginWithGoodCode.json().accessToken);
});

test("refresh rotates the token and the old refresh token can't be replayed", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "rotate@example.com", password: "correct horse battery staple", role: "customer" });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "rotate@example.com", password: "correct horse battery staple" },
  });
  const firstRefreshToken = login.json().refreshToken as string;

  const refreshed = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: firstRefreshToken } });
  assert.equal(refreshed.statusCode, 200);
  assert.notEqual(refreshed.json().refreshToken, firstRefreshToken);

  const replay = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: firstRefreshToken } });
  assert.equal(replay.statusCode, 401);
});

test("logout revokes the session so its refresh token stops working", async () => {
  const { app, repository } = buildTestApp();
  await seedUser(repository, { email: "logout@example.com", password: "correct horse battery staple", role: "customer" });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "logout@example.com", password: "correct horse battery staple" },
  });
  const refreshToken = login.json().refreshToken as string;

  const logout = await app.inject({ method: "POST", url: "/auth/logout", payload: { refreshToken } });
  assert.equal(logout.statusCode, 204);

  const refreshAfterLogout = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } });
  assert.equal(refreshAfterLogout.statusCode, 401);
});
