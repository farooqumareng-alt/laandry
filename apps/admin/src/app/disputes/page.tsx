import { PlaceholderPage } from '@/components/placeholder-page';

export default function DisputesPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /disputes"
      title="Disputes"
      description="Orders in the DISPUTED state (docs/ARCHITECTURE.md §4) — damage/mismatch reports awaiting resolution, with the full order and provider context needed to decide."
      emptyState="No open disputes."
    />
  );
}
