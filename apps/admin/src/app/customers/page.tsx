import { PlaceholderPage } from '@/components/placeholder-page';

export default function CustomersPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /customers"
      title="Customers"
      description="Customer directory — profile, saved addresses, order history, wallet/credit balance, support notes. Role access follows the ops_manager/admin grants in docs/ARCHITECTURE.md §5."
      emptyState="No customer records yet."
    />
  );
}
