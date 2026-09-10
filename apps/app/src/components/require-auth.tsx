import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Role } from '@laandry/domain';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * Full route-guard middleware (redirecting before a protected screen even
 * mounts) is a nicety for once there are enough authenticated routes to
 * justify it. For now this wrapper covers what's built: render nothing
 * meaningful until we know the auth state, bounce to /login if signed out,
 * and — when `role` is given — show a plain "not available" message
 * instead of the screen if the signed-in account is the wrong role (a
 * customer hitting a /provider/* route, say), rather than redirecting them
 * away from a URL they deliberately opened.
 */
export function RequireAuth({ role, children }: PropsWithChildren<{ role?: Role }>) {
  const { status, user } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (status === 'signedOut') {
      router.replace('/login');
    }
  }, [status]);

  if (status !== 'signedIn') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (role && user?.role !== role) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.inkSoft, fontSize: 14, textAlign: 'center' }}>
          This page is only available to {role} accounts.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}
