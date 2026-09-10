import { useEffect, useState } from 'react';
import { Link, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { toCustomerMilestone } from '@laandry/domain';
import type { Order } from '@laandry/api-client';

import { Button } from '@/components/button';
import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

const SERVICE_LABEL: Record<Order['service'], string> = {
  EVERYDAY_LAUNDRY: 'Everyday Laundry',
  FORMAL_SPECIAL_CARE: 'Formal & Special Garments',
  BEDDING_HOUSEHOLD: 'Bedding & Household',
  TRAVEL: 'Travel Laandry',
};

function OrderRow({ order }: { order: Order }) {
  const theme = useTheme();
  const milestone = toCustomerMilestone(order.status) ?? order.status;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
      style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, backgroundColor: theme.paperRaised }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 15 }}>{SERVICE_LABEL[order.service]}</Text>
        <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>{milestone}</Text>
      </View>
      <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 4 }}>
        Pickup {new Date(order.pickupWindowStart).toLocaleString()}
      </Text>
    </Pressable>
  );
}

function OrdersList() {
  const theme = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listOrders()
      .then((res) => setOrders(res.orders))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 20 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Your Laandry</Text>
        </View>

        {loading ? (
          <Text style={{ color: theme.inkSoft }}>Loading…</Text>
        ) : orders.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.inkSoft, fontSize: 14 }}>No orders yet.</Text>
            <Button label="Schedule My Pickup" onPress={() => router.push('/book')} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
            <Link href="/book" style={{ marginTop: 8 }}>
              <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Do My Laandry Again</Text>
            </Link>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export default function OrdersScreen() {
  return (
    <RequireAuth>
      <OrdersList />
    </RequireAuth>
  );
}
