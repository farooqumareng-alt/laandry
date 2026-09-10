import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useTheme } from '@/hooks/use-theme';

const SERVICES: { slug: string; label: string }[] = [
  { slug: 'everyday-laundry', label: 'Everyday Laundry' },
  { slug: 'garment-care', label: 'Formal & Special Garments' },
  { slug: 'travel', label: 'Laandry for Travelers' },
];

export default function ServicesScreen() {
  const theme = useTheme();

  return (
    <Screen
      kicker="Public · laandry.com"
      title="What can we take off your hands?"
      description="Everyday Laundry, Wash & Hang, Press & Finish, Formal & Special Garments, Bedding & Household, and Travel — one card each, per docs/ARCHITECTURE.md §2."
    >
      <View style={{ marginTop: 24, gap: 12 }}>
        {SERVICES.map((s) => (
          <Link key={s.slug} href={{ pathname: '/services/[slug]', params: { slug: s.slug } }} asChild>
            <Pressable style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 16 }}>
              <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}>{s.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}
