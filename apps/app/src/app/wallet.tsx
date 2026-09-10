import { Screen } from '@/components/screen';

export default function WalletScreen() {
  return (
    <Screen
      kicker="Customer app · /wallet"
      title="Wallet"
      description="Account credit, gift card balances, and receipts — reads from the immutable financial ledger described in docs/ARCHITECTURE.md §10."
    />
  );
}
