import { PlaceholderPage } from '@/components/placeholder-page';

export default function PaymentsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /payments"
      title="Payments"
      description="Customer charges from the immutable financial ledger (docs/ARCHITECTURE.md §10) — never an editable balance. Webhook-verified, idempotent, traceable to the originating order."
      emptyState="No payments recorded yet."
    />
  );
}
