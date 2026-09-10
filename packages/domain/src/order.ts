/**
 * Order lifecycle state machine — mirrors docs/ARCHITECTURE.md §4.
 *
 * This is the single source of truth for which order transitions are legal.
 * apps/api enforces every transition through `assertOrderTransition`; no
 * client is ever allowed to set `status` directly.
 */

export const ORDER_STATUSES = [
  "SCHEDULED",
  "PROVIDER_ASSIGNED",
  "PICKED_UP",
  "BEING_CARED_FOR",
  "FINISHING",
  "READY_FOR_RETURN",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
  "DISPUTED",
  "DELIVERY_FAILED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Terminal states — no further transitions are legal from here. */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "DELIVERED",
  "CANCELLED",
]);

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  SCHEDULED: ["PROVIDER_ASSIGNED", "CANCELLED"],
  PROVIDER_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["BEING_CARED_FOR", "DISPUTED"],
  BEING_CARED_FOR: ["FINISHING", "DISPUTED"],
  FINISHING: ["READY_FOR_RETURN"],
  READY_FOR_RETURN: ["ON_THE_WAY"],
  ON_THE_WAY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["ON_THE_WAY"],
  DELIVERED: [],
  CANCELLED: [],
  DISPUTED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export class IllegalOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Illegal order transition: ${from} -> ${to}`);
    this.name = "IllegalOrderTransitionError";
  }
}

/** Throws IllegalOrderTransitionError if the transition is not allowed. Call this from the API layer, never trust a client-supplied status directly. */
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
}

/**
 * Customer-facing milestones. Several internal statuses collapse into one
 * milestone, and exception states (DISPUTED, DELIVERY_FAILED) are
 * deliberately not surfaced as a distinct milestone — the customer sees the
 * milestone they were last confidently in, plus a support-triggered notice.
 */
export const CUSTOMER_MILESTONES = [
  "Scheduled",
  "Provider Assigned",
  "Picked Up",
  "Being Cared For",
  "Finishing",
  "Ready for Return",
  "On the Way",
  "Delivered",
] as const;

export type CustomerMilestone = (typeof CUSTOMER_MILESTONES)[number];

const STATUS_TO_MILESTONE: Record<OrderStatus, CustomerMilestone | null> = {
  SCHEDULED: "Scheduled",
  PROVIDER_ASSIGNED: "Provider Assigned",
  PICKED_UP: "Picked Up",
  BEING_CARED_FOR: "Being Cared For",
  FINISHING: "Finishing",
  READY_FOR_RETURN: "Ready for Return",
  ON_THE_WAY: "On the Way",
  DELIVERED: "Delivered",
  CANCELLED: null,
  DISPUTED: null,
  DELIVERY_FAILED: "On the Way",
};

export function toCustomerMilestone(status: OrderStatus): CustomerMilestone | null {
  return STATUS_TO_MILESTONE[status];
}
