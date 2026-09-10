import type { ProviderStatus, ServiceType } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as auth, customer and order. */

export interface ProviderProfileRecord {
  id: string;
  userId: string;
  status: ProviderStatus;
}

export interface ProviderCapabilityRecord {
  id: string;
  providerId: string;
  service: ServiceType;
}

export interface ProviderServiceAreaRecord {
  id: string;
  providerId: string;
  postalPrefix: string;
  radiusMiles: number;
}

export interface ProviderAvailabilityRecord {
  id: string;
  providerId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ProviderRepository {
  createProfile(userId: string): Promise<ProviderProfileRecord>;
  getProfileByUserId(userId: string): Promise<ProviderProfileRecord | null>;
  getProfileById(id: string): Promise<ProviderProfileRecord | null>;
  updateStatus(profileId: string, status: ProviderStatus): Promise<ProviderProfileRecord>;

  addCapability(providerId: string, service: ServiceType): Promise<ProviderCapabilityRecord>;
  listCapabilities(providerId: string): Promise<ProviderCapabilityRecord[]>;
  removeCapability(providerId: string, service: ServiceType): Promise<void>;

  addServiceArea(input: { providerId: string; postalPrefix: string; radiusMiles: number }): Promise<ProviderServiceAreaRecord>;
  listServiceAreas(providerId: string): Promise<ProviderServiceAreaRecord[]>;
  getServiceArea(id: string): Promise<ProviderServiceAreaRecord | null>;
  removeServiceArea(id: string): Promise<void>;

  addAvailability(input: { providerId: string; startsAt: Date; endsAt: Date }): Promise<ProviderAvailabilityRecord>;
  listAvailability(providerId: string): Promise<ProviderAvailabilityRecord[]>;
  getAvailability(id: string): Promise<ProviderAvailabilityRecord | null>;
  removeAvailability(id: string): Promise<void>;

  /**
   * Matching's core query — docs/ARCHITECTURE.md §"SERVICE PROVIDER
   * MATCHING": ACTIVE status, has the requested capability, a service area
   * whose postal prefix covers the pickup address, and an availability
   * window overlapping the pickup window. Lives on the provider module
   * (not matching's own repository) because it's read access into
   * provider-owned tables — matching just asks the question.
   */
  findEligibleProviders(criteria: {
    service: ServiceType;
    postalCode: string;
    pickupWindowStart: Date;
    pickupWindowEnd: Date;
  }): Promise<ProviderProfileRecord[]>;
}
