import type { PrismaClient } from "@prisma/client";
import type { IncidentStatus, IncidentType, ProcessingStage } from "@laandry/domain";

import type { IncidentRecord, ProcessingConfirmationRecord, ProcessingRepository } from "./repository";

export class PrismaProcessingRepository implements ProcessingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordProcessingConfirmation(input: {
    orderId: string;
    confirmedStages: ProcessingStage[];
    confirmedByUserId: string;
  }): Promise<ProcessingConfirmationRecord> {
    const created = await this.prisma.processingConfirmation.create({
      data: {
        orderId: input.orderId,
        confirmedStages: input.confirmedStages,
        confirmedByUserId: input.confirmedByUserId,
      },
    });
    return { ...created, confirmedStages: created.confirmedStages as ProcessingStage[] };
  }

  async getProcessingConfirmation(orderId: string): Promise<ProcessingConfirmationRecord | null> {
    const found = await this.prisma.processingConfirmation.findUnique({ where: { orderId } });
    if (!found) return null;
    return { ...found, confirmedStages: found.confirmedStages as ProcessingStage[] };
  }

  async reportIncident(input: {
    orderId: string;
    reportedByUserId: string;
    type: IncidentType;
    description: string;
  }): Promise<IncidentRecord> {
    return this.prisma.incident.create({ data: input });
  }

  async listIncidentsForOrder(orderId: string): Promise<IncidentRecord[]> {
    return this.prisma.incident.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  }

  async listAllIncidents(filter?: { status?: IncidentStatus }): Promise<IncidentRecord[]> {
    return this.prisma.incident.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async getIncidentById(id: string): Promise<IncidentRecord | null> {
    return this.prisma.incident.findUnique({ where: { id } });
  }

  async resolveIncident(
    id: string,
    input: { resolvedByUserId: string; resolutionNote: string },
  ): Promise<IncidentRecord> {
    return this.prisma.incident.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedByUserId: input.resolvedByUserId,
        resolutionNote: input.resolutionNote,
        resolvedAt: new Date(),
      },
    });
  }
}
