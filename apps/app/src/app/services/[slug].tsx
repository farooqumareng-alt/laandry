import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';

const TITLES: Record<string, string> = {
  'everyday-laundry': 'Everyday Laundry',
  'garment-care': 'Formal & Special Garments',
  household: 'Bedding & Household',
  travel: 'Laandry for Travelers',
};

export default function ServiceDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const title = TITLES[slug ?? ''] ?? 'Service';

  return (
    <Screen
      kicker={`Public · /services/${slug}`}
      title={title}
      description="Service detail page — pricing basis, what's included, and the primary booking CTA for this service land here once Phase 3 content is written."
    />
  );
}
