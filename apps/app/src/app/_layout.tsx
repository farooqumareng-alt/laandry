import { useEffect } from 'react';
import { Stack, ThemeProvider, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { restoreSession } from '@/lib/auth-store';

function navTheme(scheme: 'light' | 'dark'): Theme {
  const tokens = Colors[scheme];
  return {
    dark: scheme === 'dark',
    colors: {
      primary: tokens.accent,
      background: tokens.paper,
      card: tokens.paperRaised,
      text: tokens.ink,
      border: tokens.line,
      notification: tokens.danger,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  // Fire-and-forget: useAuth() consumers render a "loading" state until
  // this resolves (see src/hooks/use-auth.ts / src/lib/auth-store.ts).
  useEffect(() => {
    void restoreSession();
  }, []);

  return (
    <ThemeProvider value={navTheme(scheme)}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors[scheme].paperRaised },
          headerTintColor: Colors[scheme].ink,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: Colors[scheme].paper },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Laandry' }} />
        <Stack.Screen name="login" options={{ title: 'Sign In' }} />
        <Stack.Screen name="register" options={{ title: 'Create Account' }} />
        <Stack.Screen name="how-it-works" options={{ title: 'How It Works' }} />
        <Stack.Screen name="services/index" options={{ title: 'Services' }} />
        <Stack.Screen name="services/[slug]" options={{ title: 'Service' }} />
        <Stack.Screen name="providers" options={{ title: 'Become a Provider' }} />
        <Stack.Screen name="gift-cards" options={{ title: 'Gift Cards' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="security" options={{ title: 'Security' }} />
        <Stack.Screen name="help" options={{ title: 'Help' }} />
        <Stack.Screen name="book" options={{ title: 'Schedule a Pickup' }} />
        <Stack.Screen name="orders/index" options={{ title: 'Your Laandry' }} />
        <Stack.Screen name="orders/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="preferences" options={{ title: 'My Laandry Preferences' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
        <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Stack.Screen name="referrals" options={{ title: 'Invite a Friend' }} />
        <Stack.Screen name="store" options={{ title: 'Laandry Store' }} />
        <Stack.Screen name="provider/home" options={{ title: 'Provider Home' }} />
        <Stack.Screen name="provider/offers" options={{ title: 'Offers' }} />
        <Stack.Screen name="provider/orders/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="provider/earnings" options={{ title: 'Earnings' }} />
        <Stack.Screen name="provider/availability" options={{ title: 'Availability' }} />
        <Stack.Screen name="provider/onboarding" options={{ title: 'Provider Onboarding' }} />
      </Stack>
    </ThemeProvider>
  );
}
