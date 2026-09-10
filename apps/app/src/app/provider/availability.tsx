import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import type { ProviderStatus } from '@laandry/domain';
import type { ProviderAvailability } from '@laandry/api-client';

import { Button } from '@/components/button';
import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

function presetShifts() {
  const now = new Date();
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  return [
    { label: 'Tomorrow, morning (8 AM–1 PM)', start: at(1, 8), end: at(1, 13) },
    { label: 'Tomorrow, afternoon (1–6 PM)', start: at(1, 13), end: at(1, 18) },
    { label: 'This weekend, Saturday (9 AM–5 PM)', start: at((6 - now.getDay() + 7) % 7 || 7, 9), end: at((6 - now.getDay() + 7) % 7 || 7, 17) },
  ];
}

function AvailabilityBody() {
  const theme = useTheme();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [availability, setAvailability] = useState<ProviderAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProviderProfile()
      .then((res) => {
        setStatus(res.profile.status);
        setAvailability(res.availability);
      })
      .finally(() => setLoading(false));
  }, []);

  async function onAddShift(shift: { start: Date; end: Date }) {
    setError(null);
    try {
      const { availability: created } = await api.addProviderAvailability({
        startsAt: shift.start.toISOString(),
        endsAt: shift.end.toISOString(),
      });
      setAvailability((prev) => [...prev, created]);
    } catch {
      setError('Couldn’t add that window — please try again.');
    }
  }

  async function onRemove(id: string) {
    const previous = availability;
    setAvailability((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.removeProviderAvailability(id);
    } catch {
      setAvailability(previous);
    }
  }

  async function onActivate() {
    setActivating(true);
    setError(null);
    try {
      const { profile } = await api.activateProvider();
      setStatus(profile.status);
    } catch {
      setError('Add at least one availability window first.');
    } finally {
      setActivating(false);
    }
  }

  if (loading || !status) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.inkSoft }}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 22 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Availability</Text>
          {status !== 'APPROVED' && status !== 'ACTIVE' ? (
            <Text style={{ color: theme.inkSoft, fontSize: 13.5, marginTop: 6 }}>
              You can set availability now, but activation needs an approved application — see{' '}
              <Text onPress={() => router.push('/provider/onboarding')} style={{ color: theme.accent, fontWeight: '600' }}>
                onboarding
              </Text>
              .
            </Text>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>Your windows</Text>
          {availability.length === 0 ? (
            <Text style={{ color: theme.inkFaint, fontSize: 13.5 }}>No availability set yet.</Text>
          ) : (
            availability.map((window) => (
              <View key={window.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: theme.ink, fontSize: 14 }}>
                  {new Date(window.startsAt).toLocaleString()} – {new Date(window.endsAt).toLocaleTimeString()}
                </Text>
                <Text onPress={() => onRemove(window.id)} style={{ color: theme.danger, fontSize: 13 }}>
                  Remove
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>Add a shift</Text>
          {presetShifts().map((shift) => (
            <Button key={shift.label} label={`+ ${shift.label}`} variant="secondary" onPress={() => onAddShift(shift)} />
          ))}
        </View>

        {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}

        {status === 'APPROVED' ? (
          <Button label="Go Active" onPress={onActivate} loading={activating} disabled={availability.length === 0} />
        ) : null}
        {status === 'ACTIVE' ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>You're active.</Text>
            <Button label="View Offers" variant="secondary" onPress={() => router.push('/provider/offers')} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function ProviderAvailabilityScreen() {
  return (
    <RequireAuth role="provider">
      <AvailabilityBody />
    </RequireAuth>
  );
}
