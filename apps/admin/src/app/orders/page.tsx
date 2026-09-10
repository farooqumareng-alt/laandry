import { PlaceholderPage } from '@/components/placeholder-page';

export default function OrdersPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /orders"
      title="Live Orders"
      description="Every order with its full status-event history (docs/ARCHITECTURE.md §8, OrderStatusEvent) — search, filter by status/service area, drill into one order."
      emptyState="No orders yet — this table reads from the API once Phase 10 wires it up."
    />
  );
}
