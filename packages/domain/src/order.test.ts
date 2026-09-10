import assert from "node:assert/strict";
import { test } from "node:test";

import { assertOrderTransition, canTransitionOrder, IllegalOrderTransitionError, TERMINAL_ORDER_STATUSES, toCustomerMilestone } from "./order";

test("the full happy path is legal end to end", () => {
  const path = [
    "SCHEDULED",
    "PROVIDER_ASSIGNED",
    "PICKED_UP",
    "BEING_CARED_FOR",
    "FINISHING",
    "READY_FOR_RETURN",
    "ON_THE_WAY",
    "DELIVERED",
  ] as const;
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]!;
    const to = path[i + 1]!;
    assert.equal(canTransitionOrder(from, to), true, `${from} -> ${to}`);
  }
});

test("a status can never be skipped", () => {
  assert.equal(canTransitionOrder("SCHEDULED", "PICKED_UP"), false);
  assert.equal(canTransitionOrder("SCHEDULED", "DELIVERED"), false);
});

test("terminal statuses have no legal outgoing transition", () => {
  for (const status of TERMINAL_ORDER_STATUSES) {
    assert.equal(canTransitionOrder(status, "SCHEDULED"), false);
  }
});

test("assertOrderTransition throws IllegalOrderTransitionError on an illegal move, and never for a legal one", () => {
  assert.throws(() => assertOrderTransition("DELIVERED", "SCHEDULED"), IllegalOrderTransitionError);
  assert.doesNotThrow(() => assertOrderTransition("SCHEDULED", "PROVIDER_ASSIGNED"));
});

test("a failed delivery can be retried back onto the same milestone", () => {
  assert.equal(canTransitionOrder("ON_THE_WAY", "DELIVERY_FAILED"), true);
  assert.equal(canTransitionOrder("DELIVERY_FAILED", "ON_THE_WAY"), true);
  assert.equal(toCustomerMilestone("DELIVERY_FAILED"), "On the Way", "customer never sees a raw failure state");
});

test("cancellation and disputes never surface as their own customer milestone", () => {
  assert.equal(toCustomerMilestone("CANCELLED"), null);
  assert.equal(toCustomerMilestone("DISPUTED"), null);
});
