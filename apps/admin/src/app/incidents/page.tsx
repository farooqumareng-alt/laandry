import { PlaceholderPage } from '@/components/placeholder-page';

export default function IncidentsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /incidents"
      title="Incidents"
      description="Damaged, missing, or unsupported-item reports raised by a provider before return (docs/ARCHITECTURE.md — Incident entity) — the pathway that stops a provider from being forced to mark everything normal."
      emptyState="No incidents reported."
    />
  );
}
