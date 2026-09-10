import { PlaceholderPage } from '@/components/placeholder-page';

export default function DashboardPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /dashboard"
      title="Dashboard"
      description="Live orders and exceptions at a glance — the ops entry point from docs/ARCHITECTURE.md §3. Populated once the order/offer APIs exist (Phase 10)."
      emptyState="No live-order feed connected yet."
    />
  );
}
