import { randomUUID } from "node:crypto";
import type { ServiceType } from "@laandry/domain";

import type {
  AdminProviderSummary,
  ProviderAvailabilityRecord,
  ProviderCapabilityRecord,
  ProviderProfileRecord,
  ProviderRepository,
  ProviderServiceAreaRecord,
} from "./repository";

export class InMemoryProviderRepository implements ProviderRepository {
  private profilesById = new Map<string, ProviderProfileRecord>();
  private capabilitiesById = new Map<string, ProviderCapabilityRecord>();
  private serviceAreasById = new Map<string, ProviderServiceAreaRecord>();
  private availabilityById = new Map<string, ProviderAvailabilityRecord>();

  async createProfile(userId: string): Promise<ProviderProfileRecord> {
    const profile: ProviderProfileRecord = { id: randomUUID(), userId, status: "APPLICATION_STARTED" };
    this.profilesById.set(profile.id, profile);
    return profile;
  }

  async getProfileByUserId(userId: string): Promise<ProviderProfileRecord | null> {
    return [...this.profilesById.values()].find((p) => p.userId === userId) ?? null;
  }

  async getProfileById(id: string): Promise<ProviderProfileRecord | null> {
    return this.profilesById.get(id) ?? null;
  }

  async updateStatus(profileId: string, status: ProviderProfileRecord["status"]): Promise<ProviderProfileRecord> {
    const profile = this.profilesById.get(profileId);
    if (!profile) throw new Error(`No such provider profile: ${profileId}`);
    const updated = { ...profile, status };
    this.profilesById.set(profileId, updated);
    return updated;
  }

  async listAllProviders(filter?: { status?: ProviderProfileRecord["status"] }): Promise<AdminProviderSummary[]> {
    return [...this.profilesById.values()]
      .filter((p) => !filter?.status || p.status === filter.status)
      .map((p) => ({
        ...p,
        services: [...this.capabilitiesById.values()].filter((c) => c.providerId === p.id).map((c) => c.service),
      }));
  }

  async addCapability(providerId: string, service: ProviderCapabilityRecord["service"]): Promise<ProviderCapabilityRecord> {
    const existing = [...this.capabilitiesById.values()].find((c) => c.providerId === providerId && c.service === service);
    if (existing) return existing;
    const capability: ProviderCapabilityRecord = { id: randomUUID(), providerId, service };
    this.capabilitiesById.set(capability.id, capability);
    return capability;
  }

  async listCapabilities(providerId: string): Promise<ProviderCapabilityRecord[]> {
    return [...this.capabilitiesById.values()].filter((c) => c.providerId === providerId);
  }

  async removeCapability(providerId: string, service: ProviderCapabilityRecord["service"]): Promise<void> {
    const found = [...this.capabilitiesById.values()].find((c) => c.providerId === providerId && c.service === service);
    if (found) this.capabilitiesById.delete(found.id);
  }

  async addServiceArea(input: {
    providerId: string;
    postalPrefix: string;
    radiusMiles: number;
  }): Promise<ProviderServiceAreaRecord> {
    const area: ProviderServiceAreaRecord = { id: randomUUID(), ...input };
    this.serviceAreasById.set(area.id, area);
    return area;
  }

  async listServiceAreas(providerId: string): Promise<ProviderServiceAreaRecord[]> {
    return [...this.serviceAreasById.values()].filter((a) => a.providerId === providerId);
  }

  async getServiceArea(id: string): Promise<ProviderServiceAreaRecord | null> {
    return this.serviceAreasById.get(id) ?? null;
  }

  async removeServiceArea(id: string): Promise<void> {
    this.serviceAreasById.delete(id);
  }

  async addAvailability(input: { providerId: string; startsAt: Date; endsAt: Date }): Promise<ProviderAvailabilityRecord> {
    const availability: ProviderAvailabilityRecord = { id: randomUUID(), ...input };
    this.availabilityById.set(availability.id, availability);
    return availability;
  }

  async listAvailability(providerId: string): Promise<ProviderAvailabilityRecord[]> {
    return [...this.availabilityById.values()].filter((a) => a.providerId === providerId);
  }

  async getAvailability(id: string): Promise<ProviderAvailabilityRecord | null> {
    return this.availabilityById.get(id) ?? null;
  }

  async removeAvailability(id: string): Promise<void> {
    this.availabilityById.delete(id);
  }

  async findEligibleProviders(criteria: {
    service: ServiceType;
    postalCode: string;
    pickupWindowStart: Date;
    pickupWindowEnd: Date;
  }): Promise<ProviderProfileRecord[]> {
    return [...this.profilesById.values()].filter((profile) => {
      if (profile.status !== "ACTIVE") return false;

      const hasCapability = [...this.capabilitiesById.values()].some(
        (c) => c.providerId === profile.id && c.service === criteria.service,
      );
      if (!hasCapability) return false;

      const coversArea = [...this.serviceAreasById.values()].some(
        (a) => a.providerId === profile.id && criteria.postalCode.startsWith(a.postalPrefix),
      );
      if (!coversArea) return false;

      const hasOverlappingAvailability = [...this.availabilityById.values()].some(
        (window) =>
          window.providerId === profile.id &&
          window.startsAt < criteria.pickupWindowEnd &&
          window.endsAt > criteria.pickupWindowStart,
      );
      return hasOverlappingAvailability;
    });
  }
}
