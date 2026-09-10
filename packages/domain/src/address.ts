import { z } from "zod";

/** Saved customer address — docs/ARCHITECTURE.md §8. Shared between apps/app's address form and apps/api's validation. */
export const addressInputSchema = z.object({
  label: z.string().min(1).max(40),
  line1: z.string().min(1).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  postalCode: z.string().min(1).max(20),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

/** Common labels offered in the UI — free text is still accepted (§: Home, Apartment, Hotel, Airbnb, Dorm, Office, Concierge/lobby). */
export const COMMON_ADDRESS_LABELS = [
  "Home",
  "Apartment",
  "Hotel",
  "Airbnb",
  "Dorm",
  "Office",
] as const;
