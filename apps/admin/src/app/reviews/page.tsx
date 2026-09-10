import { PlaceholderPage } from '@/components/placeholder-page';

export default function ReviewsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /reviews"
      title="Reviews"
      description="Customer ratings and comments per completed order, with provider-level rollups feeding matching eligibility in Phase 6."
      emptyState="No reviews yet."
    />
  );
}
