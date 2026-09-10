import { randomUUID } from "node:crypto";
import { DEFAULT_PREFERENCES, type LaandryPreferences } from "@laandry/domain";

import type {
  AddressRecord,
  CreateAddressInput,
  CustomerProfileRecord,
  CustomerRepository,
} from "./repository";

export class InMemoryCustomerRepository implements CustomerRepository {
  private profilesById = new Map<string, CustomerProfileRecord>();
  private addressesById = new Map<string, AddressRecord>();

  async createProfile(userId: string): Promise<CustomerProfileRecord> {
    const profile: CustomerProfileRecord = {
      id: randomUUID(),
      userId,
      preferences: DEFAULT_PREFERENCES,
      preferredProviderId: null,
    };
    this.profilesById.set(profile.id, profile);
    return profile;
  }

  async getProfileByUserId(userId: string): Promise<CustomerProfileRecord | null> {
    return [...this.profilesById.values()].find((p) => p.userId === userId) ?? null;
  }

  async updatePreferences(profileId: string, preferences: LaandryPreferences): Promise<CustomerProfileRecord> {
    const profile = this.profilesById.get(profileId);
    if (!profile) throw new Error(`No such customer profile: ${profileId}`);
    const updated = { ...profile, preferences };
    this.profilesById.set(profileId, updated);
    return updated;
  }

  async addAddress(input: CreateAddressInput): Promise<AddressRecord> {
    const address: AddressRecord = {
      id: randomUUID(),
      customerId: input.customerId,
      label: input.label,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    };
    this.addressesById.set(address.id, address);
    return address;
  }

  async listAddresses(customerId: string): Promise<AddressRecord[]> {
    return [...this.addressesById.values()].filter((a) => a.customerId === customerId);
  }

  async getAddress(id: string): Promise<AddressRecord | null> {
    return this.addressesById.get(id) ?? null;
  }

  async updateAddress(id: string, patch: Partial<CreateAddressInput>): Promise<AddressRecord> {
    const existing = this.addressesById.get(id);
    if (!existing) throw new Error(`No such address: ${id}`);
    const updated: AddressRecord = {
      ...existing,
      ...patch,
      line2: patch.line2 !== undefined ? patch.line2 ?? null : existing.line2,
      lat: patch.lat !== undefined ? patch.lat ?? null : existing.lat,
      lng: patch.lng !== undefined ? patch.lng ?? null : existing.lng,
    };
    this.addressesById.set(id, updated);
    return updated;
  }

  async deleteAddress(id: string): Promise<void> {
    this.addressesById.delete(id);
  }
}
