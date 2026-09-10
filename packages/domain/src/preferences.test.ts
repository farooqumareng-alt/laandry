import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PREFERENCES, laandryPreferencesSchema } from "./preferences";

test("a brand-new customer has a complete preference set with no input at all", () => {
  const parsed = laandryPreferencesSchema.parse({});
  assert.deepEqual(parsed, DEFAULT_PREFERENCES);
  assert.equal(parsed.washTemperature, "cold");
  assert.equal(parsed.detergent, "standard");
});

test("special instructions over 500 characters are rejected", () => {
  const result = laandryPreferencesSchema.safeParse({ specialInstructions: "x".repeat(501) });
  assert.equal(result.success, false);
});

test("an invalid enum value is rejected rather than silently coerced", () => {
  const result = laandryPreferencesSchema.safeParse({ washTemperature: "hot" });
  assert.equal(result.success, false);
});
