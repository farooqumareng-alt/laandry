import { PlaceholderPage } from '@/components/placeholder-page';

export default function ProvidersPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /providers"
      title="Providers"
      description="Active provider roster — status, capabilities, service area, performance, earnings-to-date. Status values follow the ProviderStatus enum in apps/api/prisma/schema.prisma."
      emptyState="No approved providers yet."
    />
  );
}
