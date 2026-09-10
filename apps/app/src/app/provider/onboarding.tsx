import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SERVICE_TYPES, type ProviderStatus, type ServiceType } from '@laandry/domain';
import type { ProviderServiceArea } from '@laandry/api-client';

import { Button } from '@/components/button';
import { ChipMultiGroup } from '@/components/chip-multi-group';
import { RequireAuth } from '@/components/require-auth';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

const SERVICE_LABEL: Record<ServiceType, string> = {
  EVERYDAY_LAUNDRY: 'Everyday Laundry',
  FORMAL_SPECIAL_CARE: 'Formal & Special Garments',
  BEDDING_HOUSEHOLD: 'Bedding & Household',
  TRAVEL: 'Travel',
};

const STATUS_LABEL: Record<ProviderStatus, string> = {
  APPLICATION_STARTED: 'Application started',
  IDENTITY_PENDING: 'Identity verification pending',
  REVIEW_PENDING: 'Under review',
  TRAINING_PENDING: 'Training pending',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

function OnboardingBody() {
  const theme = useTheme();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [capabilities, setCapabilities] = useState<ServiceType[]>([]);
  const [serviceAreas, setServiceAreas] = useState<ProviderServiceArea[]>([]);
  const [postalPrefix, setPostalPrefix] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('15');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    return api.getProviderProfile().then((res) => {
      setStatus(res.profile.status);
      setCapabilities(res.capabilities.map((c) => c.service));
      setServiceAreas(res.serviceAreas);
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onSaveCapabilities() {
    setSaving(true);
    setError(null);
    try {
      await api.setProviderCapabilities(capabilities);
      setMessage('Capabilities saved.');
    } catch {
      setError('Couldn’t save your capabilities — please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function onAddServiceArea() {
    if (!postalPrefix) return;
    setError(null);
    try {
      const { serviceArea } = await api.addProviderServiceArea({ postalPrefix, radiusMiles: Number(radiusMiles) || 15 });
      setServiceAreas((prev) => [...prev, serviceArea]);
      setPostalPrefix('');
    } catch {
      setError('Couldn’t add that service area — please try again.');
    }
  }

  async function onRemoveServiceArea(id: string) {
    const previous = serviceAreas;
    setServiceAreas((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.removeProviderServiceArea(id);
    } catch {
      setServiceAreas(previous);
    }
  }

  async function onSubmitForReview() {
    setSaving(true);
    setError(null);
    try {
      const { profile } = await api.submitProviderForReview();
      setStatus(profile.status);
      setMessage('Application submitted for review.');
    } catch {
      setError('Add at least one capability and one service area before submitting.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !status) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.inkSoft }}>Loading…</Text>
      </View>
    );
  }

  const canEdit = status === 'APPLICATION_STARTED' || status === 'IDENTITY_PENDING';

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 22 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Provider onboarding</Text>
          <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600', marginTop: 6 }}>{STATUS_LABEL[status]}</Text>
        </View>

        {status === 'APPROVED' ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
              You're approved — set your availability to go active.
            </Text>
            <Button label="Set My Availability" onPress={() => router.push('/provider/availability')} />
          </View>
        ) : null}

        {!canEdit && status !== 'APPROVED' && status !== 'ACTIVE' ? (
          <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
            Your application is {STATUS_LABEL[status].toLowerCase()}. We'll let you know once it's reviewed.
          </Text>
        ) : null}

        <ChipMultiGroup
          label="Services you can provide"
          value={capabilities}
          onChange={canEdit ? setCapabilities : () => undefined}
          options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABEL[s] }))}
        />
        {canEdit ? <Button label="Save Capabilities" variant="secondary" onPress={onSaveCapabilities} loading={saving} /> : null}

        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}>Service areas</Text>
          {serviceAreas.length === 0 ? (
            <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>No service areas yet.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {serviceAreas.map((area) => (
                <View key={area.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.ink, fontSize: 14 }}>
                    {area.postalPrefix}* · {area.radiusMiles} mi
                  </Text>
                  {canEdit ? (
                    <Text onPress={() => onRemoveServiceArea(area.id)} style={{ color: theme.danger, fontSize: 13 }}>
                      Remove
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {canEdit ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 2 }}>
                <TextField label="Postal prefix" value={postalPrefix} onChangeText={setPostalPrefix} placeholder="941" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Radius (mi)" value={radiusMiles} onChangeText={setRadiusMiles} keyboardType="number-pad" />
              </View>
            </View>
          ) : null}
          {canEdit ? <Button label="Add Service Area" variant="secondary" onPress={onAddServiceArea} /> : null}
        </View>

        {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}
        {message ? <Text style={{ color: theme.accent, fontSize: 13.5 }}>{message}</Text> : null}

        {canEdit ? (
          <Button
            label="Submit for Review"
            onPress={onSubmitForReview}
            loading={saving}
            disabled={capabilities.length === 0 || serviceAreas.length === 0}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function ProviderOnboardingScreen() {
  return (
    <RequireAuth role="provider">
      <OnboardingBody />
    </RequireAuth>
  );
}
