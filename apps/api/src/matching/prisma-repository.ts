import type { PrismaClient } from "@prisma/client";
import type { OfferStatus, ServiceType } from "@laandry/domain";
import { assertOrderTransition } from "@laandry/domain";

import type {
  AcceptOfferResult,
  DispatchInput,
  MatchingRepository,
  ProviderOfferRecord,
  ProviderOfferSummary,
} from "./repository";

function approximateAreaLabel(city: string, region: string, postalCode: string): string {
  return `${city}, ${region} · ${postalCode.slice(0, 3)}**`;
}

export class PrismaMatchingRepository implements MatchingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async dispatchOrder(input: DispatchInput): Promise<ProviderOfferRecord[]> {
    // Same eligibility filter as ProviderRepository.findEligibleProviders,
    // duplicated here rather than shared because the two Prisma
    // repositories intentionally don't depend on each other — matching
    // just needs "who's eligible," not the provider module's full API
    // surface. If this drifts out of sync with provider/prisma-repository.ts,
    // that's a sign the query belongs in one shared place; it hasn't yet.
    const candidates = await this.prisma.providerProfile.findMany({
      where: {
        status: "ACTIVE",
        capabilities: { some: { service: input.service } },
        availability: {
          some: {
            startsAt: { lt: input.pickupWindowEnd },
            endsAt: { gt: input.pickupWindowStart },
          },
        },
      },
      include: { serviceAreas: true },
    });
    const eligible = candidates.filter((p) => p.serviceAreas.some((a) => input.postalCode.startsWith(a.postalPrefix)));

    if (eligible.length === 0) return [];

    await this.prisma.providerOffer.createMany({
      data: eligible.map((p) => ({ orderId: input.orderId, providerId: p.id, status: "WAVE_1_OFFERED", wave: 1, offeredAt: new Date() })),
    });
    const created = await this.prisma.providerOffer.findMany({ where: { orderId: input.orderId } });
    return created.map(toOfferRecord);
  }

  async listOffersForProvider(providerId: string): Promise<ProviderOfferSummary[]> {
    const offers = await this.prisma.providerOffer.findMany({
      where: { providerId },
      include: { order: { include: { address: true } } },
      orderBy: { offeredAt: "desc" },
    });
    return offers.map((o) => ({
      offer: toOfferRecord(o),
      service: o.order.service as ServiceType,
      pickupWindowStart: o.order.pickupWindowStart,
      pickupWindowEnd: o.order.pickupWindowEnd,
      approximateArea: approximateAreaLabel(o.order.address.city, o.order.address.region, o.order.address.postalCode),
    }));
  }

  async getOffer(id: string): Promise<ProviderOfferRecord | null> {
    const offer = await this.prisma.providerOffer.findUnique({ where: { id } });
    return offer ? toOfferRecord(offer) : null;
  }

  async tryAcceptOffer(offerId: string, providerId: string): Promise<AcceptOfferResult> {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.providerOffer.findUnique({ where: { id: offerId } });
      if (!offer || offer.providerId !== providerId || (offer.status !== "WAVE_1_OFFERED" && offer.status !== "WAVE_2_OFFERED")) {
        return { won: false } as const;
      }

      // THE atomic guard. Each eligible provider has their *own* offer
      // row for this order — a conditional UPDATE on the offer row alone
      // (an earlier draft of this method did exactly that) only stops the
      // same offer being accepted twice, not two *different* providers'
      // offers for the same order both winning. ProviderAssignment.orderId
      // is UNIQUE, so this INSERT is the real race-arbiter: two concurrent
      // transactions attempting it for the same orderId — Postgres lets
      // exactly one commit and rejects the other with a unique-constraint
      // violation, no matter which offer row each came from.
      let assignment;
      try {
        assignment = await tx.providerAssignment.create({
          data: { orderId: offer.orderId, offerId: offer.id, providerId: offer.providerId },
        });
      } catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
          return { won: false } as const;
        }
        throw err;
      }

      await tx.providerOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });

      const order = await tx.order.findUniqueOrThrow({ where: { id: offer.orderId } });
      assertOrderTransition(order.status as Parameters<typeof assertOrderTransition>[0], "PROVIDER_ASSIGNED");
      await tx.order.update({ where: { id: offer.orderId }, data: { status: "PROVIDER_ASSIGNED" } });

      await tx.providerOffer.updateMany({
        where: { orderId: offer.orderId, id: { not: offer.id }, status: { in: ["WAVE_1_OFFERED", "WAVE_2_OFFERED"] } },
        data: { status: "UNFULFILLED", respondedAt: new Date() },
      });

      return { won: true, assignment } as const;
    });
  }

  async getAssignmentForOrder(orderId: string) {
    return this.prisma.providerAssignment.findUnique({ where: { orderId } });
  }
}

interface PrismaOfferShape {
  id: string;
  orderId: string;
  providerId: string;
  status: string;
  wave: number;
  offeredAt: Date | null;
  respondedAt: Date | null;
}

function toOfferRecord(offer: PrismaOfferShape): ProviderOfferRecord {
  return {
    id: offer.id,
    orderId: offer.orderId,
    providerId: offer.providerId,
    status: offer.status as OfferStatus,
    wave: offer.wave,
    offeredAt: offer.offeredAt,
    respondedAt: offer.respondedAt,
  };
}
