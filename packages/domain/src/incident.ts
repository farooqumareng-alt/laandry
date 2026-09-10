/**
 * Incident reporting — docs/ARCHITECTURE.md "READY FOR RETURN": "If an
 * item is damaged/missing/questionable/unsupported, do not force the
 * provider to mark everything normal. Provide an incident pathway."
 *
 * Deliberately not a state machine with its own transition table like
 * order.ts/offer.ts/provider-status.ts — this is a two-state flag
 * (reported, then resolved), and reporting one never blocks or gates the
 * order's own processing transitions. A provider can mark an order ready
 * for return *and* have an open incident on it at the same time; the two
 * are independent by design, matching the "don't force a false all-clear"
 * requirement above.
 */

export const INCIDENT_TYPES = ["DAMAGED_ITEM", "MISSING_ITEM", "UNSUPPORTED_ITEM", "OTHER"] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_STATUSES = ["OPEN", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
