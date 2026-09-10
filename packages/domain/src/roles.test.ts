import assert from "node:assert/strict";
import { test } from "node:test";

import { hasPermission, requiresMfa } from "./roles";

test("customer can read/write their own order but not another customer's", () => {
  assert.equal(hasPermission("customer", "order", "read", { isOwner: true }), true);
  assert.equal(hasPermission("customer", "order", "read", { isOwner: false }), false);
  assert.equal(hasPermission("customer", "order", "write", { isOwner: false }), false);
});

test("customer has no access to any staff-only resource, owned or not", () => {
  assert.equal(hasPermission("customer", "pricing_rule", "read", { isOwner: true }), false);
  assert.equal(hasPermission("customer", "provider_approval", "write", { isOwner: true }), false);
  assert.equal(hasPermission("customer", "payout", "read", { isOwner: true }), false);
  assert.equal(hasPermission("customer", "audit_log", "read", { isOwner: true }), false);
});

test("provider can read their own payout but not another provider's", () => {
  assert.equal(hasPermission("provider", "payout", "read", { isOwner: true }), true);
  assert.equal(hasPermission("provider", "payout", "read", { isOwner: false }), false);
  assert.equal(hasPermission("provider", "payout", "write"), false, "providers never write payouts");
});

test("support can read any order but cannot write one or touch pricing", () => {
  assert.equal(hasPermission("support", "order", "read"), true);
  assert.equal(hasPermission("support", "order", "write"), false);
  assert.equal(hasPermission("support", "pricing_rule", "read"), false);
});

test("support cannot perform a super-admin action (provider approval)", () => {
  assert.equal(hasPermission("support", "provider_approval", "write"), false);
  assert.equal(hasPermission("support", "provider_approval", "read"), false);
});

test("ops_manager and admin can approve providers and manage pricing; finance cannot approve providers", () => {
  assert.equal(hasPermission("ops_manager", "provider_approval", "write"), true);
  assert.equal(hasPermission("admin", "provider_approval", "write"), true);
  assert.equal(hasPermission("finance", "provider_approval", "write"), false);
});

test("finance can read and write payouts and read the audit log", () => {
  assert.equal(hasPermission("finance", "payout", "read"), true);
  assert.equal(hasPermission("finance", "payout", "write"), true);
  assert.equal(hasPermission("finance", "audit_log", "read"), true);
});

test("only super_admin can write the audit log", () => {
  assert.equal(hasPermission("admin", "audit_log", "write"), false);
  assert.equal(hasPermission("ops_manager", "audit_log", "write"), false);
  assert.equal(hasPermission("super_admin", "audit_log", "write"), true);
});

test("a role/resource/action combination with no matching grant is denied, not defaulted to allow", () => {
  assert.equal(hasPermission("customer", "provider_approval", "read"), false);
});

test("requiresMfa covers every role that touches other people's data or money", () => {
  assert.equal(requiresMfa("customer"), false);
  for (const role of ["provider", "support", "dispatch", "finance", "ops_manager", "admin", "super_admin"] as const) {
    assert.equal(requiresMfa(role), true, `${role} should require MFA`);
  }
});
