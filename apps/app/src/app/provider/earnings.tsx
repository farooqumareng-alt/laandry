import { Screen } from '@/components/screen';

export default function ProviderEarningsScreen() {
  return (
    <Screen
      kicker="Provider app · /provider/earnings"
      title="Earnings"
      description="Today, this week, completed orders, tips, and pending vs. available balance — always read from the server-computed ledger, never calculated on-device (docs/ARCHITECTURE.md §10)."
    />
  );
}
