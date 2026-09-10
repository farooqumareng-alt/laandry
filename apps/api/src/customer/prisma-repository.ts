import type { PrismaClient } from "@prisma/client";
import { DEFAULT_PREFERENCES, laandryPreferencesSchema, type LaandryPreferences } from "@laandry/domain";

import type {
  AddressRecord,
  CreateAddressInput,
  CustomerProfileRecord,
  CustomerRepository,
} from "./repository";

function parsePreferences(value: unknown): LaandryPreferences {
  if (!value) return DEFAULT_PREFERENCES;
  const result = laandryPreferencesSchema.safeParse(value);
  // A row that fails to parse (e.g. written by an older schema version)
  // falls back to defaults rather than 500ing the customer's own screen.
  return result.success ? result.data : DEFAULT_PREFERENCES;
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createProfile(userId: string): Promise<CustomerProfileRecord> {
    const profile = await this.prisma.customerProfile.create({
      data: { userId, preferences: DEFAULT_PREFERENCES },
    });
    return {
      id: profile.id,
      userId: profile.userId,
      preferences: parsePreferences(profile.preferences),
      preferredProviderId: profile.preferredProviderId,
    };
  }

  async getProfileByUserId(userId: string): Promise<CustomerProfileRecord | null> {
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) return null;
    return {
      id: profile.id,
      userId: profile.userId,
      preferences: parsePreferences(profile.preferences),
      preferredProviderId: profile.preferredProviderId,
    };
  }

  async getProfileById(id: string): Promise<CustomerProfileRecord | null> {
    const profile = await this.prisma.customerProfile.findUnique({ where: { id } });
    if (!profile) return null;
    return {
      id: profile.id,
      userId: profile.userId,
      preferences: parsePreferences(profile.preferences),
      preferredProviderId: profile.preferredProviderId,
    };
  }

  async updatePreferences(profileId: string, preferences: LaandryPreferences): Promise<CustomerProfileRecord> {
    const profile = await this.prisma.customerProfile.update({
      where: { id: profileId },
      data: { preferences },
    });
    return {
      id: profile.id,
      userId: profile.userId,
      preferences: parsePreferences(profile.preferences),
      preferredProviderId: profile.preferredProviderId,
    };
  }

  async addAddress(input: CreateAddressInput): Promise<AddressRecord> {
    return this.prisma.address.create({
      data: {
        customerId: input.customerId,
        label: input.label,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        region: input.region,
        postalCode: input.postalCode,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      },
    });
  }

  async listAddresses(customerId: string): Promise<AddressRecord[]> {
    return this.prisma.address.findMany({ where: { customerId } });
  }

  async getAddress(id: string): Promise<AddressRecord | null> {
    return this.prisma.address.findUnique({ where: { id } });
  }

  async updateAddress(id: string, patch: Partial<CreateAddressInput>): Promise<AddressRecord> {
    return this.prisma.address.update({
      where: { id },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.line1 !== undefined ? { line1: patch.line1 } : {}),
        ...(patch.line2 !== undefined ? { line2: patch.line2 ?? null } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.region !== undefined ? { region: patch.region } : {}),
        ...(patch.postalCode !== undefined ? { postalCode: patch.postalCode } : {}),
        ...(patch.lat !== undefined ? { lat: patch.lat ?? null } : {}),
        ...(patch.lng !== undefined ? { lng: patch.lng ?? null } : {}),
      },
    });
  }

  async deleteAddress(id: string): Promise<void> {
    await this.prisma.address.delete({ where: { id } });
  }
}
