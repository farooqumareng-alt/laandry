import { randomUUID } from "node:crypto";

import type { IncidentStatus, IncidentType, ProcessingStage } from "@laandry/domain";

import type { IncidentRecord, ProcessingConfirmationRecord, ProcessingRepository } from "./repository";

export class InMemoryProcessingRepository implements ProcessingRepository {
  private confirmationsByOrderId = new Map<string, ProcessingConfirmationRecord>();
  private incidentsById = new Map<string, IncidentRecord>();

  async recordProcessingConfirmation(input: {
    orderId: string;
    confirmedStages: ProcessingStage[];
    confirmedByUserId: string;
  }): Promise<ProcessingConfirmationRecord> {
    const record: ProcessingConfirmationRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      confirmedStages: input.confirmedStages,
      confirmedByUserId: input.confirmedByUserId,
      createdAt: new Date(),
    };
    this.confirmationsByOrderId.set(input.orderId, record);
    return record;
  }

  async getProcessingConfirmation(orderId: string): Promise<ProcessingConfirmationRecord | null> {
    return this.confirmationsByOrderId.get(orderId) ?? null;
  }

  async reportIncident(input: {
    orderId: string;
    reportedByUserId: string;
    type: IncidentType;
    description: string;
  }): Promise<IncidentRecord> {
    const record: IncidentRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      reportedByUserId: input.reportedByUserId,
      type: input.type,
      description: input.description,
      status: "OPEN" as IncidentStatus,
      resolutionNote: null,
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt: new Date(),
    };
    this.incidentsById.set(record.id, record);
    return record;
  }

  async listIncidentsForOrder(orderId: string): Promise<IncidentRecord[]> {
    return [...this.incidentsById.values()]
      .filter((incident) => incident.orderId === orderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getIncidentById(id: string): Promise<IncidentRecord | null> {
    return this.incidentsById.get(id) ?? null;
  }

  async resolveIncident(
    id: string,
    input: { resolvedByUserId: string; resolutionNote: string },
  ): Promise<IncidentRecord> {
    const existing = this.incidentsById.get(id);
    if (!existing) throw new Error(`No incident: ${id}`);
    const updated: IncidentRecord = {
      ...existing,
      status: "RESOLVED",
      resolvedByUserId: input.resolvedByUserId,
      resolutionNote: input.resolutionNote,
      resolvedAt: new Date(),
    };
    this.incidentsById.set(id, updated);
    return updated;
  }
}
