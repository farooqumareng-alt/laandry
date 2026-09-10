import type { PrismaClient } from "@prisma/client";
import type { ProviderStatus, ServiceType } from "@laandry/domain";

import type {
  ProviderAvailabilityRecord,
  ProviderCapabilityRecord,
  ProviderProfileRecord,
  ProviderRepository,
  ProviderServiceAreaRecord,
} from "./repository";

export class PrismaProviderRepository implements ProviderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createProfile(userId: string): Promise<ProviderProfileRecord> {
    const profile = await this.prisma.providerProfile.create({ data: { userId } });
    return { id: profile.id, userId: profile.userId, status: profile.status as ProviderStatus };
  }

  async getProfileByUserId(userId: string): Promise<ProviderProfileRecord | null> {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    return profile ? { id: profile.id, userId: profile.userId, status: profile.status as ProviderStatus } : null;
  }

  async getProfileById(id: string): Promise<ProviderProfileRecord | null> {
    const profile = await this.prisma.providerProfile.findUnique({ where: { id } });
    return profile ? { id: profile.id, userId: profile.userId, status: profile.status as ProviderStatus } : null;
  }

  async updateStatus(profileId: string, status: ProviderStatus): Promise<ProviderProfileRecord> {
    const profile = await this.prisma.providerProfile.update({ where: { id: profileId }, data: { status } });
    return { id: profile.id, userId: profile.userId, status: profile.status as ProviderStatus };
  }

  async addCapability(providerId: string, service: ServiceType): Promise<ProviderCapabilityRecord> {
    const capability = await this.prisma.providerCapability.upsert({
      where: { providerId_service: { providerId, service } },
      create: { providerId, service },
      update: {},
    });
    return { id: capability.id, providerId: capability.providerId, service: capability.service as ServiceType };
  }

  async listCapabilities(providerId: string): Promise<ProviderCapabilityRecord[]> {
    const capabilities = await this.prisma.providerCapability.findMany({ where: { providerId } });
    return capabilities.map((c) => ({ id: c.id, providerId: c.providerId, service: c.service as ServiceType }));
  }

  async removeCapability(providerId: string, service: ServiceType): Promise<void> {
    await this.prisma.providerCapability.deleteMany({ where: { providerId, service } });
  }

  async addServiceArea(input: {
    providerId: string;
    postalPrefix: string;
    radiusMiles: number;
  }): Promise<ProviderServiceAreaRecord> {
    return this.prisma.providerServiceArea.create({ data: input });
  }

  async listServiceAreas(providerId: string): Promise<ProviderServiceAreaRecord[]> {
    return this.prisma.providerServiceArea.findMany({ where: { providerId } });
  }

  async getServiceArea(id: string): Promise<ProviderServiceAreaRecord | null> {
    return this.prisma.providerServiceArea.findUnique({ where: { id } });
  }

  async removeServiceArea(id: string): Promise<void> {
    await this.prisma.providerServiceArea.delete({ where: { id } });
  }

  async addAvailability(input: { providerId: string; startsAt: Date; endsAt: Date }): Promise<ProviderAvailabilityRecord> {
    return this.prisma.providerAvailability.create({ data: input });
  }

  async listAvailability(providerId: string): Promise<ProviderAvailabilityRecord[]> {
    return this.prisma.providerAvailability.findMany({ where: { providerId } });
  }

  async getAvailability(id: string): Promise<ProviderAvailabilityRecord | null> {
    return this.prisma.providerAvailability.findUnique({ where: { id } });
  }

  async removeAvailability(id: string): Promise<void> {
    await this.prisma.providerAvailability.delete({ where: { id } });
  }

  async findEligibleProviders(criteria: {
    service: ServiceType;
    postalCode: string;
    pickupWindowStart: Date;
    pickupWindowEnd: Date;
  }): Promise<ProviderProfileRecord[]> {
    // Status + capability + availability-overlap filter server-side;
    // postalPrefix is itself a column (not a literal), so "does this
    // provider's prefix cover that postal code" isn't expressible as a
    // single indexed WHERE — filtered in application code below instead
    // of a raw SQL LIKE. Provider counts are small enough for this to be
    // a non-issue; revisit if that stops being true.
    const candidates = await this.prisma.providerProfile.findMany({
      where: {
        status: "ACTIVE",
        capabilities: { some: { service: criteria.service } },
        availability: {
          some: {
            startsAt: { lt: criteria.pickupWindowEnd },
            endsAt: { gt: criteria.pickupWindowStart },
          },
        },
      },
      include: { serviceAreas: true },
    });

    return candidates
      .filter((p) => p.serviceAreas.some((area) => criteria.postalCode.startsWith(area.postalPrefix)))
      .map((p) => ({ id: p.id, userId: p.userId, status: p.status as ProviderStatus }));
  }
}
