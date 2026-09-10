import { PlaceholderPage } from '@/components/placeholder-page';

export default function PayoutsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /payouts"
      title="Payouts"
      description="Provider payout batches — earnings rolled up from ProviderEarning into a Payout (docs/ARCHITECTURE.md §10). Customer charges and provider payouts stay separate accounting flows."
      emptyState="No payouts processed yet."
    />
  );
}
