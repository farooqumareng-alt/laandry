import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DEFAULT_PREFERENCES, type LaandryPreferences } from '@laandry/domain';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { RequireAuth } from '@/components/require-auth';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

function PreferencesForm() {
  const theme = useTheme();
  const [prefs, setPrefs] = useState<LaandryPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProfile()
      .then((profile) => setPrefs(profile.preferences))
      .catch(() => setError('Couldn’t load your saved preferences.'))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof LaandryPreferences>(key: K, value: LaandryPreferences[K]) {
    setSaved(false);
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.updatePreferences(prefs);
      setPrefs(result.preferences);
      setSaved(true);
    } catch {
      setError('Couldn’t save — please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.inkSoft }}>Loading your preferences…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24, gap: 20 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 20 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>My Laandry Preferences</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 14, marginTop: 4 }}>
            Tell us once. We'll remember for every eligible order — you can still change any of this per order at
            checkout.
          </Text>
        </View>

        <ChipGroup
          label="Wash temperature"
          value={prefs.washTemperature}
          onChange={(v) => update('washTemperature', v)}
          options={[
            { value: 'cold', label: 'Cold' },
            { value: 'warm', label: 'Warm' },
          ]}
        />

        <ChipGroup
          label="Detergent"
          value={prefs.detergent}
          onChange={(v) => update('detergent', v)}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'sensitive', label: 'Sensitive' },
            { value: 'premium', label: 'Premium' },
            { value: 'own', label: 'Mine' },
          ]}
        />

        <ChipGroup
          label="Drying"
          value={prefs.dryingPreference}
          onChange={(v) => update('dryingPreference', v)}
          options={[
            { value: 'low_heat', label: 'Low heat' },
            { value: 'medium_heat', label: 'Medium heat' },
            { value: 'high_heat', label: 'High heat' },
            { value: 'air_dry', label: 'Air dry' },
          ]}
        />

        <ChipGroup
          label="Finish"
          value={prefs.foldOrHang}
          onChange={(v) => update('foldOrHang', v)}
          options={[
            { value: 'fold', label: 'Fold' },
            { value: 'hang', label: 'Hang' },
          ]}
        />

        <View style={{ gap: 4 }}>
          <SwitchRow label="Fragrance-free" value={prefs.fragranceFree} onChange={(v) => update('fragranceFree', v)} />
          <SwitchRow label="Fabric softener" value={prefs.fabricSoftener} onChange={(v) => update('fabricSoftener', v)} />
          <SwitchRow label="Ironing / pressing" value={prefs.ironingRequested} onChange={(v) => update('ironingRequested', v)} />
        </View>

        <TextField
          label="Special instructions"
          value={prefs.specialInstructions ?? ''}
          onChangeText={(v) => update('specialInstructions', v || undefined)}
          placeholder="e.g. extra hangers for shirts"
          multiline
          numberOfLines={3}
        />

        {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}
        {saved ? <Text style={{ color: theme.accent, fontSize: 13.5 }}>Saved.</Text> : null}

        <Button label="Save Preferences" onPress={onSave} loading={saving} />
      </View>
    </ScrollView>
  );
}

export default function PreferencesScreen() {
  return (
    <RequireAuth>
      <PreferencesForm />
    </RequireAuth>
  );
}
