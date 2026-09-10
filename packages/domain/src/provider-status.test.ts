import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertProviderStatusTransition,
  canTransitionProviderStatus,
  IllegalProviderStatusTransitionError,
  isProviderEligibleForWork,
  PROVIDER_STATUSES,
  TERMINAL_PROVIDER_STATUSES,
} from "./provider-status";

test("a brand-new application can reach REVIEW_PENDING and APPROVED without a skipped step", () => {
  assert.equal(canTransitionProviderStatus("APPLICATION_STARTED", "REVIEW_PENDING"), true);
  assert.equal(canTransitionProviderStatus("REVIEW_PENDING", "APPROVED"), true);
  assert.equal(canTransitionProviderStatus("APPROVED", "ACTIVE"), true);
});

test("a provider cannot go straight from application to active — approval is mandatory", () => {
  assert.equal(canTransitionProviderStatus("APPLICATION_STARTED", "ACTIVE"), false);
  assert.equal(canTransitionProviderStatus("REVIEW_PENDING", "ACTIVE"), false);
});

test("only ACTIVE is eligible for work — every other status, including APPROVED, is not", () => {
  for (const status of PROVIDER_STATUSES) {
    assert.equal(isProviderEligibleForWork(status), status === "ACTIVE");
  }
});

test("a paused or suspended provider can come back to ACTIVE, but a deactivated one cannot", () => {
  assert.equal(canTransitionProviderStatus("PAUSED", "ACTIVE"), true);
  assert.equal(canTransitionProviderStatus("SUSPENDED", "ACTIVE"), true);
  assert.equal(canTransitionProviderStatus("DEACTIVATED", "ACTIVE"), false);
});

test("DEACTIVATED is terminal — no transition out of it is legal", () => {
  assert.deepEqual([...TERMINAL_PROVIDER_STATUSES], ["DEACTIVATED"]);
  for (const status of PROVIDER_STATUSES) {
    assert.equal(canTransitionProviderStatus("DEACTIVATED", status), false);
  }
});

test("assertProviderStatusTransition throws on an illegal move and is silent on a legal one", () => {
  assert.throws(
    () => assertProviderStatusTransition("APPLICATION_STARTED", "ACTIVE"),
    IllegalProviderStatusTransitionError,
  );
  assert.doesNotThrow(() => assertProviderStatusTransition("APPROVED", "ACTIVE"));
});
