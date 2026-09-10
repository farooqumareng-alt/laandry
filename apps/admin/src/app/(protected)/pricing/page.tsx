import { PlaceholderPage } from '@/components/placeholder-page';

export default function PricingPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /pricing"
      title="Pricing"
      description="PricingRule configuration — weight tiers, minimums, per-item pricing, add-ons, service-area/rush modifiers (docs/ARCHITECTURE.md §9). The server-owned quote engine reads these; the client never does."
      emptyState="No pricing rules configured."
    />
  );
}
