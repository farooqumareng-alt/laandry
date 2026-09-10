import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import type { Address, Order } from '@laandry/api-client';

import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

function PreferenceRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{label}</Text>
      <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

function ProviderOrderDetail({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProviderOrder(orderId)
      .then((res) => {
        setOrder(res.order);
        setAddress(res.address);
      })
      .catch(() => setError('This order isn’t available — it may not be assigned to you.'))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.inkSoft }}>Loading…</Text>
      </View>
    );
  }

  if (error || !order || !address) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.danger }}>{error ?? 'Order not found.'}</Text>
      </View>
    );
  }

  const prefs = order.preferenceSnapshot;

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 22 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Order</Text>
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600', marginTop: 4 }}>{order.status}</Text>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Pickup</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}
          </Text>
          <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
            {address.city}, {address.region} {address.postalCode}
          </Text>
          <Text style={{ color: theme.inkSoft, fontSize: 13.5, marginTop: 4 }}>
            {new Date(order.pickupWindowStart).toLocaleString()} – {new Date(order.pickupWindowEnd).toLocaleTimeString()}
          </Text>
        </View>

        {order.items.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Items</Text>
            {order.items.map((item, i) => (
              <Text key={i} style={{ color: theme.inkSoft, fontSize: 14 }}>
                {item.description} ×{item.quantity}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 8 }}>
          <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600', marginBottom: 2 }}>Care preferences</Text>
          <PreferenceRow label="Wash" value={prefs.washTemperature === 'warm' ? 'Warm' : 'Cold'} />
          <PreferenceRow label="Detergent" value={prefs.detergent} />
          <PreferenceRow label="Fragrance-free" value={prefs.fragranceFree ? 'Yes' : 'No'} />
          <PreferenceRow label="Fabric softener" value={prefs.fabricSoftener ? 'Yes' : 'No'} />
          <PreferenceRow label="Drying" value={prefs.dryingPreference.replace('_', ' ')} />
          <PreferenceRow label="Finish" value={prefs.foldOrHang === 'hang' ? 'Hang' : 'Fold'} />
          <PreferenceRow label="Ironing / pressing" value={prefs.ironingRequested ? 'Yes' : 'No'} />
          {prefs.specialInstructions ? (
            <View style={{ marginTop: 4 }}>
              <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>Special instructions</Text>
              <Text style={{ color: theme.ink, fontSize: 14, marginTop: 2 }}>{prefs.specialInstructions}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

export default function ProviderOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth role="provider">
      <ProviderOrderDetail orderId={id!} />
    </RequireAuth>
  );
}
