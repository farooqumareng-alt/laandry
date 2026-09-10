import { PlaceholderPage } from '@/components/placeholder-page';

export default function ApplicationsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /applications"
      title="Provider Applications"
      description="Queue of providers moving through APPLICATION_STARTED → ACTIVE (docs/ARCHITECTURE.md §8) — identity review, service-area and equipment checks, approval/rejection. Built in Phase 5."
      emptyState="No pending applications."
    />
  );
}
