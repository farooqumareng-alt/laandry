import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PREFERENCES } from "./preferences";
import { requiredProcessingStages, stagesSatisfyRequirement } from "./processing";

test("the default preference set requires wash, dry, and fold — no ironing", () => {
  const stages = requiredProcessingStages(DEFAULT_PREFERENCES);
  assert.deepEqual([...stages].sort(), ["dry", "fold", "wash"]);
});

test("hang-preferring customers require hang, not fold", () => {
  const stages = requiredProcessingStages({ ...DEFAULT_PREFERENCES, foldOrHang: "hang" });
  assert.deepEqual([...stages].sort(), ["dry", "hang", "wash"]);
});

test("ironing adds a fourth required stage on top of fold/hang", () => {
  const stages = requiredProcessingStages({ ...DEFAULT_PREFERENCES, ironingRequested: true });
  assert.deepEqual([...stages].sort(), ["dry", "fold", "iron", "wash"]);
});

test("stagesSatisfyRequirement accepts the same set in any order", () => {
  assert.equal(stagesSatisfyRequirement(["wash", "dry", "fold"], ["fold", "wash", "dry"]), true);
});

test("stagesSatisfyRequirement rejects a missing stage", () => {
  assert.equal(stagesSatisfyRequirement(["wash", "dry", "iron", "fold"], ["wash", "dry", "fold"]), false);
});

test("stagesSatisfyRequirement rejects an extra or wrong stage", () => {
  assert.equal(stagesSatisfyRequirement(["wash", "dry", "fold"], ["wash", "dry", "hang"]), false);
});

test("stagesSatisfyRequirement rejects a duplicate standing in for a missing one", () => {
  assert.equal(stagesSatisfyRequirement(["wash", "dry", "fold"], ["wash", "dry", "dry"]), false);
});
