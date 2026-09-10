import { PlaceholderPage } from '@/components/placeholder-page';

export default function ServiceAreasPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /service-areas"
      title="Service Areas"
      description="Postal-prefix / radius coverage configuration that drives provider-eligibility matching in Phase 6 (docs/ARCHITECTURE.md §8, ProviderServiceArea)."
      emptyState="No service areas configured."
    />
  );
}
