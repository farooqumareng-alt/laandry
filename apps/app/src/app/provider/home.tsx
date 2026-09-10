import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { ProviderStatus } from '@laandry/domain';

import { Button } from '@/components/button';
import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

const STATUS_MESSAGE: Record<ProviderStatus, string> = {
  APPLICATION_STARTED: 'Finish your application to get reviewed.',
  IDENTITY_PENDING: 'Finish your application to get reviewed.',
  REVIEW_PENDING: 'Your application is under review.',
  TRAINING_PENDING: 'Training pending.',
  APPROVED: "You're approved — set your availability to go active.",
  ACTIVE: "You're active — eligible orders in your service area will show up as offers.",
  PAUSED: 'Your account is paused.',
  SUSPENDED: 'Your account is suspended.',
  DEACTIVATED: 'Your account is deactivated.',
};

function ProviderHomeBody() {
  const theme = useTheme();
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    api.getProviderProfile().then((res) => setStatus(res.profile.status));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24, gap: 16 }}>
      <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Provider Home</Text>
      {status ? <Text style={{ color: theme.inkSoft, fontSize: 14 }}>{STATUS_MESSAGE[status]}</Text> : null}
      <View style={{ gap: 10, marginTop: 8 }}>
        {status === 'ACTIVE' ? <Button label="Offers" onPress={() => router.push('/provider/offers')} /> : null}
        <Button label="Onboarding" variant="secondary" onPress={() => router.push('/provider/onboarding')} />
        <Button label="Availability" variant="secondary" onPress={() => router.push('/provider/availability')} />
      </View>
    </View>
  );
}

export default function ProviderHomeScreen() {
  return (
    <RequireAuth role="provider">
      <ProviderHomeBody />
    </RequireAuth>
  );
}
