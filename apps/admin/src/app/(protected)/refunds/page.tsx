import { PlaceholderPage } from '@/components/placeholder-page';

export default function RefundsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /refunds"
      title="Refunds"
      description="Refund requests and approvals — a privileged, audited action (docs/ARCHITECTURE.md §15, AuditEvent) available to ops_manager and above."
      emptyState="No refund requests yet."
    />
  );
}
