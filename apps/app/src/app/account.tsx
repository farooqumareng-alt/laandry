import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import type { Address } from '@laandry/api-client';
import { COMMON_ADDRESS_LABELS } from '@laandry/domain';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { RequireAuth } from '@/components/require-auth';
import { TextField } from '@/components/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { api, logout } from '@/lib/auth-store';

function AddressCard({ address, onDelete }: { address: Address; onDelete: (id: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 14, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 15 }}>{address.label}</Text>
        <Text onPress={() => onDelete(address.id)} style={{ color: theme.danger, fontSize: 13 }}>
          Remove
        </Text>
      </View>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ''}
      </Text>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>
        {address.city}, {address.region} {address.postalCode}
      </Text>
    </View>
  );
}

const EMPTY_ADDRESS_FORM = { label: 'Home', line1: '', line2: '', city: '', region: '', postalCode: '' };

function AccountScreenBody() {
  const theme = useTheme();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAddress, setAddingAddress] = useState(false);
  const [form, setForm] = useState(EMPTY_ADDRESS_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAddresses()
      .then((res) => setAddresses(res.addresses))
      .finally(() => setLoading(false));
  }, []);

  async function onAddAddress() {
    setError(null);
    if (!form.line1 || !form.city || !form.region || !form.postalCode) {
      setError('Fill in address, city, state/region, and postal code.');
      return;
    }
    setAddingAddress(true);
    try {
      const { address } = await api.addAddress({
        label: form.label,
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        region: form.region,
        postalCode: form.postalCode,
      });
      setAddresses((prev) => [...prev, address]);
      setForm(EMPTY_ADDRESS_FORM);
    } catch {
      setError('Couldn’t save that address — please try again.');
    } finally {
      setAddingAddress(false);
    }
  }

  async function onDeleteAddress(id: string) {
    const previous = addresses;
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.deleteAddress(id);
    } catch {
      setAddresses(previous);
      setError('Couldn’t remove that address — please try again.');
    }
  }

  async function onSignOut() {
    await logout();
    router.replace('/');
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24, gap: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 24 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Account</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 14, marginTop: 4 }}>{user?.email}</Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}>Saved addresses</Text>
          {loading ? (
            <Text style={{ color: theme.inkSoft }}>Loading…</Text>
          ) : addresses.length === 0 ? (
            <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>No saved addresses yet.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {addresses.map((address) => (
                <AddressCard key={address.id} address={address} onDelete={onDeleteAddress} />
              ))}
            </View>
          )}

          <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 16, marginTop: 4 }}>
            <ChipGroup
              label="Label"
              value={form.label}
              onChange={(v) => setForm((f) => ({ ...f, label: v }))}
              options={COMMON_ADDRESS_LABELS.map((label) => ({ value: label, label }))}
            />
            <TextField label="Address" value={form.line1} onChangeText={(v) => setForm((f) => ({ ...f, line1: v }))} />
            <TextField
              label="Apt / Unit (optional)"
              value={form.line2}
              onChangeText={(v) => setForm((f) => ({ ...f, line2: v }))}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TextField label="City" value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="State / Region" value={form.region} onChangeText={(v) => setForm((f) => ({ ...f, region: v }))} />
              </View>
            </View>
            <TextField
              label="Postal code"
              value={form.postalCode}
              onChangeText={(v) => setForm((f) => ({ ...f, postalCode: v }))}
            />
            {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}
            <Button label="Add Address" variant="secondary" onPress={onAddAddress} loading={addingAddress} />
          </View>
        </View>

        <Button label="My Laandry Preferences" variant="secondary" onPress={() => router.push('/preferences')} />
        <Button label="Sign Out" variant="danger" onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

export default function AccountScreen() {
  return (
    <RequireAuth>
      <AccountScreenBody />
    </RequireAuth>
  );
}
