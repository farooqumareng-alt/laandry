import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestApp } from "./auth/test-helpers";

test("security headers are present on every response (helmet)", async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.ok(res.headers["x-frame-options"], "helmet's frame-options header should be set");
  assert.ok(res.headers["content-security-policy"]?.includes("frame-ancestors 'none'"));
});

test("CORS only echoes back an allowed origin, never an arbitrary one", async () => {
  const { app } = buildTestApp({ CORS_ORIGINS: ["https://laandry.example"] });

  const allowed = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: "https://laandry.example" },
  });
  assert.equal(allowed.headers["access-control-allow-origin"], "https://laandry.example");

  const disallowed = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: "https://evil.example" },
  });
  assert.notEqual(disallowed.headers["access-control-allow-origin"], "https://evil.example");
});

test("login is rate-limited well below the global floor — a credential-stuffing burst gets cut off", async () => {
  const { app } = buildTestApp();

  const attempts = [];
  for (let i = 0; i < 11; i++) {
    attempts.push(
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "nobody@example.com", password: "wrong password entirely" },
      }),
    );
  }
  const results = await Promise.all(attempts);
  const statusCodes = results.map((r) => r.statusCode);

  assert.ok(statusCodes.includes(429), `expected at least one 429 among ${JSON.stringify(statusCodes)}`);
  assert.ok(statusCodes.filter((c) => c === 401).length <= 10, "no more than the configured max should reach the handler");
});

test("an unhandled error never leaks its message or stack to the client", async () => {
  const { app, orderRepository } = buildTestApp();
  // Force a real thrown error from inside a route handler.
  orderRepository.listOrdersForCustomer = async () => {
    throw new Error("super secret internal detail: connection string is ...");
  };

  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "errtest@example.com", password: "correct horse battery staple" },
  });
  const token = register.json().accessToken as string;

  const res = await app.inject({
    method: "GET",
    url: "/orders",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().error, "INTERNAL_SERVER_ERROR");
  assert.ok(!res.body.includes("super secret"), "the real error message must never reach the response body");
});
