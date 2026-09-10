import { randomUUID } from "node:crypto";
import { assertOfferTransition, assertOrderTransition } from "@laandry/domain";

import type { InMemoryCustomerRepository } from "../customer/memory-repository";
import type { InMemoryOrderRepository } from "../order/memory-repository";
import type { InMemoryProviderRepository } from "../provider/memory-repository";
import type {
  AcceptOfferResult,
  DispatchInput,
  MatchingRepository,
  ProviderAssignmentRecord,
  ProviderOfferRecord,
  ProviderOfferSummary,
} from "./repository";

function approximateAreaLabel(city: string, region: string, postalCode: string): string {
  return `${city}, ${region} · ${postalCode.slice(0, 3)}**`;
}

export class InMemoryMatchingRepository implements MatchingRepository {
  private offersById = new Map<string, ProviderOfferRecord>();
  private assignmentsByOrderId = new Map<string, ProviderAssignmentRecord>();

  constructor(
    private readonly providerRepository: InMemoryProviderRepository,
    private readonly orderRepository: InMemoryOrderRepository,
    private readonly customerRepository: InMemoryCustomerRepository,
  ) {}

  async dispatchOrder(input: DispatchInput): Promise<ProviderOfferRecord[]> {
    const eligible = await this.providerRepository.findEligibleProviders({
      service: input.service,
      postalCode: input.postalCode,
      pickupWindowStart: input.pickupWindowStart,
      pickupWindowEnd: input.pickupWindowEnd,
    });
    return eligible.map((provider) => {
      const offer: ProviderOfferRecord = {
        id: randomUUID(),
        orderId: input.orderId,
        providerId: provider.id,
        status: "WAVE_1_OFFERED",
        wave: 1,
        offeredAt: new Date(),
        respondedAt: null,
      };
      this.offersById.set(offer.id, offer);
      return offer;
    });
  }

  async listOffersForProvider(providerId: string): Promise<ProviderOfferSummary[]> {
    const offers = [...this.offersById.values()].filter((o) => o.providerId === providerId);
    const summaries: ProviderOfferSummary[] = [];
    for (const offer of offers) {
      const order = await this.orderRepository.getOrderById(offer.orderId);
      if (!order) continue;
      const address = await this.customerRepository.getAddress(order.addressId);
      summaries.push({
        offer,
        service: order.service,
        pickupWindowStart: order.pickupWindowStart,
        pickupWindowEnd: order.pickupWindowEnd,
        approximateArea: address
          ? approximateAreaLabel(address.city, address.region, address.postalCode)
          : "Unknown area",
      });
    }
    return summaries;
  }

  async getOffer(id: string): Promise<ProviderOfferRecord | null> {
    return this.offersById.get(id) ?? null;
  }

  async tryAcceptOffer(offerId: string, providerId: string): Promise<AcceptOfferResult> {
    // Everything up to and including the status flip below is fully
    // synchronous — no `await` runs until after `this.offersById.set(...)`
    // — so this section can never be interleaved by another in-flight
    // call the way the Prisma conditional UPDATE can't be interleaved by
    // a concurrent transaction. That's what makes this "atomic" here, not
    // just "sequential because JS is single-threaded."
    //
    // The guard that actually decides the race is the assignmentsByOrderId
    // check-and-set below — each eligible provider has their *own* offer
    // row for this order, so gating only on *this* offer's own status (an
    // earlier draft did exactly that) stops the same offer being accepted
    // twice but does nothing to stop two *different* providers' offers for
    // the same order both winning. One order, one assignment, checked
    // against the same map key every time.
    const offer = this.offersById.get(offerId);
    if (
      !offer ||
      offer.providerId !== providerId ||
      (offer.status !== "WAVE_1_OFFERED" && offer.status !== "WAVE_2_OFFERED")
    ) {
      return { won: false };
    }
    if (this.assignmentsByOrderId.has(offer.orderId)) {
      return { won: false };
    }

    const assignment: ProviderAssignmentRecord = {
      id: randomUUID(),
      orderId: offer.orderId,
      offerId: offer.id,
      providerId: offer.providerId,
      acceptedAt: new Date(),
    };
    this.assignmentsByOrderId.set(offer.orderId, assignment);

    offer.status = "ACCEPTED";
    offer.respondedAt = new Date();
    this.offersById.set(offer.id, offer);

    const order = await this.orderRepository.getOrderById(offer.orderId);
    if (!order) throw new Error(`Accepted offer references a missing order: ${offer.orderId}`);
    assertOrderTransition(order.status, "PROVIDER_ASSIGNED");
    await this.orderRepository.updateStatus(offer.orderId, "PROVIDER_ASSIGNED");

    for (const sibling of this.offersById.values()) {
      if (
        sibling.orderId === offer.orderId &&
        sibling.id !== offer.id &&
        (sibling.status === "WAVE_1_OFFERED" || sibling.status === "WAVE_2_OFFERED")
      ) {
        assertOfferTransition(sibling.status, "UNFULFILLED");
        sibling.status = "UNFULFILLED";
        sibling.respondedAt = new Date();
        this.offersById.set(sibling.id, sibling);
      }
    }

    return { won: true, assignment };
  }

  async getAssignmentForOrder(orderId: string): Promise<ProviderAssignmentRecord | null> {
    return this.assignmentsByOrderId.get(orderId) ?? null;
  }
}
