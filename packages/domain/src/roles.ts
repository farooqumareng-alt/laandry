/**
 * Role / permission model — mirrors docs/ARCHITECTURE.md §5.
 *
 * This is the thing the §16 authorization test suite is written against.
 * apps/api must call `hasPermission` on every privileged action; the
 * frontend hiding a button is never sufficient on its own.
 */

export const ROLES = [
  "customer",
  "provider",
  "support",
  "dispatch",
  "finance",
  "ops_manager",
  "admin",
  "super_admin",
] as const;

export type Role = (typeof ROLES)[number];

export type Resource =
  | "order"
  | "pricing_rule"
  | "provider_approval"
  | "payout"
  | "audit_log";

export type Action = "read" | "write";
export type Scope = "own" | "any";

interface Grant {
  role: Role;
  resource: Resource;
  action: Action;
  scope: Scope;
}

const GRANTS: readonly Grant[] = [
  { role: "customer", resource: "order", action: "read", scope: "own" },
  { role: "customer", resource: "order", action: "write", scope: "own" },

  { role: "provider", resource: "order", action: "read", scope: "own" },
  { role: "provider", resource: "order", action: "write", scope: "own" },
  { role: "provider", resource: "payout", action: "read", scope: "own" },

  { role: "support", resource: "order", action: "read", scope: "any" },

  { role: "dispatch", resource: "order", action: "read", scope: "any" },
  { role: "dispatch", resource: "order", action: "write", scope: "any" },

  { role: "finance", resource: "order", action: "read", scope: "any" },
  { role: "finance", resource: "pricing_rule", action: "read", scope: "any" },
  { role: "finance", resource: "payout", action: "read", scope: "any" },
  { role: "finance", resource: "payout", action: "write", scope: "any" },
  { role: "finance", resource: "audit_log", action: "read", scope: "any" },

  { role: "ops_manager", resource: "order", action: "read", scope: "any" },
  { role: "ops_manager", resource: "order", action: "write", scope: "any" },
  { role: "ops_manager", resource: "pricing_rule", action: "read", scope: "any" },
  { role: "ops_manager", resource: "pricing_rule", action: "write", scope: "any" },
  { role: "ops_manager", resource: "provider_approval", action: "read", scope: "any" },
  { role: "ops_manager", resource: "provider_approval", action: "write", scope: "any" },
  { role: "ops_manager", resource: "payout", action: "read", scope: "any" },
  { role: "ops_manager", resource: "audit_log", action: "read", scope: "any" },

  { role: "admin", resource: "order", action: "read", scope: "any" },
  { role: "admin", resource: "order", action: "write", scope: "any" },
  { role: "admin", resource: "pricing_rule", action: "read", scope: "any" },
  { role: "admin", resource: "pricing_rule", action: "write", scope: "any" },
  { role: "admin", resource: "provider_approval", action: "read", scope: "any" },
  { role: "admin", resource: "provider_approval", action: "write", scope: "any" },
  { role: "admin", resource: "payout", action: "read", scope: "any" },
  { role: "admin", resource: "payout", action: "write", scope: "any" },
  { role: "admin", resource: "audit_log", action: "read", scope: "any" },

  ...(["order", "pricing_rule", "provider_approval", "payout", "audit_log"] as const).flatMap(
    (resource) =>
      (["read", "write"] as const).map(
        (action): Grant => ({ role: "super_admin", resource, action, scope: "any" }),
      ),
  ),
];

/**
 * @param isOwner Whether the actor owns (or is assigned to) the specific
 *   resource instance being accessed. Required to satisfy an "own"-scoped
 *   grant; ignored for "any"-scoped grants.
 */
/**
 * Roles required to use MFA — "stronger authentication for providers,
 * staff, and admins" / "Admin and highly privileged roles must use MFA"
 * (docs/ARCHITECTURE.md). Customers are deliberately excluded: MFA on a
 * consumer laundry app is friction without a matching risk, and every role
 * below directly touches other people's data or money.
 */
const MFA_REQUIRED_ROLES: ReadonlySet<Role> = new Set([
  "provider",
  "support",
  "dispatch",
  "finance",
  "ops_manager",
  "admin",
  "super_admin",
]);

export function requiresMfa(role: Role): boolean {
  return MFA_REQUIRED_ROLES.has(role);
}

export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action,
  opts: { isOwner: boolean } = { isOwner: false },
): boolean {
  const grant = GRANTS.find(
    (g) => g.role === role && g.resource === resource && g.action === action,
  );
  if (!grant) return false;
  return grant.scope === "any" || opts.isOwner;
}
