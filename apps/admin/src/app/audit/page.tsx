import { PlaceholderPage } from '@/components/placeholder-page';

export default function AuditPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /audit"
      title="Security / Audit"
      description="Every privileged action — provider approval, price override, refund, reassignment, admin role change (docs/ARCHITECTURE.md §15, AuditEvent) — as an append-only, filterable log."
      emptyState="No audit events yet."
    />
  );
}
