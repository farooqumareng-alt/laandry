import assert from "node:assert/strict";
import { test } from "node:test";

import { assertOfferTransition, canTransitionOffer, IllegalOfferTransitionError } from "./offer";

test("an eligible offer can only move to wave 1 — never straight to accepted", () => {
  assert.equal(canTransitionOffer("ELIGIBLE", "WAVE_1_OFFERED"), true);
  assert.equal(canTransitionOffer("ELIGIBLE", "ACCEPTED"), false);
});

test("once accepted, no further transition is legal — this is the state a conditional UPDATE lands on for exactly one accepter", () => {
  assert.equal(canTransitionOffer("ACCEPTED", "WAVE_1_OFFERED"), false);
  assert.equal(canTransitionOffer("ACCEPTED", "UNFULFILLED"), false);
  assert.throws(() => assertOfferTransition("ACCEPTED", "WAVE_2_OFFERED"), IllegalOfferTransitionError);
});

test("wave 1 can escalate to wave 2 or resolve to accepted", () => {
  assert.equal(canTransitionOffer("WAVE_1_OFFERED", "WAVE_2_OFFERED"), true);
  assert.equal(canTransitionOffer("WAVE_1_OFFERED", "ACCEPTED"), true);
});

test("wave 2 can end unfulfilled", () => {
  assert.equal(canTransitionOffer("WAVE_2_OFFERED", "UNFULFILLED"), true);
});

test("a wave-1 offer can also go straight to unfulfilled — a sibling offer being accepted makes it moot immediately, not just after a wave-2 timeout", () => {
  assert.equal(canTransitionOffer("WAVE_1_OFFERED", "UNFULFILLED"), true);
});
