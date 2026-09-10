import type { IncidentStatus, IncidentType, ProcessingStage } from "@laandry/domain";

/** Same interface/in-memory/Prisma pattern as the rest of apps/api. */

export interface ProcessingConfirmationRecord {
  id: string;
  orderId: string;
  confirmedStages: ProcessingStage[];
  confirmedByUserId: string;
  createdAt: Date;
}

export interface IncidentRecord {
  id: string;
  orderId: string;
  reportedByUserId: string;
  type: IncidentType;
  description: string;
  status: IncidentStatus;
  resolutionNote: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface ProcessingRepository {
  recordProcessingConfirmation(input: {
    orderId: string;
    confirmedStages: ProcessingStage[];
    confirmedByUserId: string;
  }): Promise<ProcessingConfirmationRecord>;
  getProcessingConfirmation(orderId: string): Promise<ProcessingConfirmationRecord | null>;

  reportIncident(input: {
    orderId: string;
    reportedByUserId: string;
    type: IncidentType;
    description: string;
  }): Promise<IncidentRecord>;
  listIncidentsForOrder(orderId: string): Promise<IncidentRecord[]>;
  /** Admin/ops-only — every incident across every order, optionally narrowed to one status. Newest first. */
  listAllIncidents(filter?: { status?: IncidentStatus }): Promise<IncidentRecord[]>;
  getIncidentById(id: string): Promise<IncidentRecord | null>;
  /** A dumb setter, same discipline as every other repository's status setters — the route handler decides whether resolving is legal before calling this. */
  resolveIncident(id: string, input: { resolvedByUserId: string; resolutionNote: string }): Promise<IncidentRecord>;
}
