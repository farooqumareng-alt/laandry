import assert from "node:assert/strict";
import { test } from "node:test";

import { computeOrderEarningCents, PLATFORM_TAKE_RATE, PROVIDER_EARNING_RATE } from "./payouts";

test("the take rate and earning rate sum to exactly 1", () => {
  assert.equal(PLATFORM_TAKE_RATE + PROVIDER_EARNING_RATE, 1);
});

test("computeOrderEarningCents pays the provider 70% of the order total", () => {
  assert.equal(computeOrderEarningCents(10000), 7000);
});

test("computeOrderEarningCents rounds down, never in the provider's favor", () => {
  // $35.00 * 0.7 = 2450.0000000000005 in floating point — floor(2450.000...5) is still 2450,
  // so pick a total where the true cents value actually lands on a fraction.
  assert.equal(computeOrderEarningCents(3333), 2333); // 3333 * 0.7 = 2333.1
});
