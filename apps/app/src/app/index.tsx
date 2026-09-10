import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Fonts } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const { status } = useAuth();

  return (
    <Screen
      logo
      kicker="Public · laandry.com"
      title="Get your time back."
      description="Laundry picked up from your door and returned clean, fresh, and exactly the way you like it. Wash. Dry. Fold. Hang. Press. You choose what you need — we take care of the rest."
    >
      <Link href="/book" asChild>
        <Pressable style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 24, marginTop: 24, alignSelf: 'flex-start' }}>
          <Text style={{ color: theme.accentInk, fontFamily: Fonts?.body, fontWeight: '600', fontSize: 16 }}>
            Schedule My Pickup
          </Text>
        </Pressable>
      </Link>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
        {status === 'signedIn' ? (
          <Link href="/account">
            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Go to my account</Text>
          </Link>
        ) : (
          <>
            <Text style={{ color: theme.inkSoft, fontSize: 14 }}>Already use Laandry?</Text>
            <Link href="/login">
              <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Sign in</Text>
            </Link>
          </>
        )}
      </View>
    </Screen>
  );
}
