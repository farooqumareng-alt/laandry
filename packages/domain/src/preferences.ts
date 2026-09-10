import { z } from "zod";

/**
 * "My Laandry Preferences" — docs/ARCHITECTURE.md §3/§8. Saved on the
 * customer profile; copied verbatim onto an OrderPreferenceSnapshot at
 * booking time (Phase 4) so a later change here never mutates an in-flight
 * order. Every field has a default so a brand-new customer has a complete,
 * sensible preference set before they ever touch this screen.
 */
export const laandryPreferencesSchema = z.object({
  washTemperature: z.enum(["cold", "warm"]).default("cold"),
  detergent: z.enum(["standard", "sensitive", "premium", "own"]).default("standard"),
  fragranceFree: z.boolean().default(false),
  fabricSoftener: z.boolean().default(true),
  dryingPreference: z.enum(["low_heat", "medium_heat", "high_heat", "air_dry"]).default("medium_heat"),
  foldOrHang: z.enum(["fold", "hang"]).default("fold"),
  ironingRequested: z.boolean().default(false),
  specialInstructions: z.string().max(500).optional(),
});

export type LaandryPreferences = z.infer<typeof laandryPreferencesSchema>;

export const DEFAULT_PREFERENCES: LaandryPreferences = laandryPreferencesSchema.parse({});
