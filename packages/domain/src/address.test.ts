import assert from "node:assert/strict";
import { test } from "node:test";

import { addressInputSchema } from "./address";

test("a minimal valid address (no unit, no coordinates) parses", () => {
  const result = addressInputSchema.safeParse({
    label: "Home",
    line1: "221B Baker Street",
    city: "Springfield",
    region: "IL",
    postalCode: "62704",
  });
  assert.equal(result.success, true);
});

test("a missing required field is rejected", () => {
  const result = addressInputSchema.safeParse({
    label: "Home",
    line1: "221B Baker Street",
    city: "Springfield",
    // region missing
    postalCode: "62704",
  });
  assert.equal(result.success, false);
});

test("out-of-range coordinates are rejected", () => {
  const result = addressInputSchema.safeParse({
    label: "Home",
    line1: "1 Main St",
    city: "Nowhere",
    region: "NA",
    postalCode: "00000",
    lat: 200,
    lng: 0,
  });
  assert.equal(result.success, false);
});
