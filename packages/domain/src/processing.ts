import type { LaandryPreferences } from "./preferences";

/**
 * The "PROCESSING" step of the original spec: "Display customer
 * preferences prominently before processing... Provider confirms required
 * stages." This is the server-side half of that — a pure function deriving
 * *which* stages are actually required for a given order's preference
 * snapshot, so confirming them is a real check apps/api can enforce
 * (`confirmedStages` must equal this set, see processing/routes.ts),
 * not just a checklist the UI happens to render.
 *
 * Every order requires a wash and a dry stage, using whatever
 * temperature/detergent/heat settings are in the snapshot — those aren't
 * separate confirmable stages themselves (no order skips washing), they're
 * *how* the wash/dry stages must be carried out. Ironing and fold-vs-hang
 * are the two things that actually vary per order, so those are the two
 * places the required stage set changes.
 */
export const PROCESSING_STAGES = ["wash", "dry", "fold", "hang", "iron"] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export function requiredProcessingStages(preferences: LaandryPreferences): ProcessingStage[] {
  const stages: ProcessingStage[] = ["wash", "dry"];
  stages.push(preferences.foldOrHang === "hang" ? "hang" : "fold");
  if (preferences.ironingRequested) {
    stages.push("iron");
  }
  return stages;
}

/** Order-independent of array order; a set-equality check, not a sequence check — a provider can confirm stages in any order. */
export function stagesSatisfyRequirement(
  required: readonly ProcessingStage[],
  confirmed: readonly ProcessingStage[],
): boolean {
  if (required.length !== confirmed.length) return false;
  const requiredSet = new Set(required);
  return confirmed.every((stage) => requiredSet.has(stage)) && new Set(confirmed).size === requiredSet.size;
}
