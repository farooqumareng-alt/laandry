import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { CUSTOMER_MILESTONES, toCustomerMilestone } from '@laandry/domain';
import type { Order, QuoteResponse } from '@laandry/api-client';

import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function MilestoneTracker({ status }: { status: Order['status'] }) {
  const theme = useTheme();
  const current = toCustomerMilestone(status);
  const currentIndex = current ? CUSTOMER_MILESTONES.indexOf(current) : -1;

  return (
    <View style={{ gap: 6 }}>
      {CUSTOMER_MILESTONES.map((milestone, i) => {
        const reached = currentIndex >= 0 && i <= currentIndex;
        return (
          <View key={milestone} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: reached ? theme.accent : theme.line,
              }}
            />
            <Text style={{ color: reached ? theme.ink : theme.inkFaint, fontSize: 13.5, fontWeight: reached ? '600' : '400' }}>
              {milestone}
            </Text>
          </View>
        );
      })}
      {current === null ? (
        <Text style={{ color: theme.danger, fontSize: 13, marginTop: 4 }}>
          This order needs attention — contact support for details.
        </Text>
      ) : null}
    </View>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrder(orderId)
      .then((res) => {
        setOrder(res.order);
        setQuote(res.quote);
      })
      .catch(() => setError('Couldn’t load this order.'))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.inkSoft }}>Loading…</Text>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24 }}>
        <Text style={{ color: theme.danger }}>{error ?? 'Order not found.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 24 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Your Laandry</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 13.5, marginTop: 4 }}>
            Pickup {new Date(order.pickupWindowStart).toLocaleString()}
          </Text>
        </View>

        <MilestoneTracker status={order.status} />

        {order.items.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Items</Text>
            {order.items.map((item, i) => (
              <Text key={i} style={{ color: theme.inkSoft, fontSize: 13.5 }}>
                {item.description} ×{item.quantity}
              </Text>
            ))}
          </View>
        ) : null}

        {quote ? (
          <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 8 }}>
            {quote.lineItems.map((li, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{li.label}</Text>
                <Text style={{ color: theme.ink, fontSize: 13.5 }}>{centsToLabel(li.amountCents)}</Text>
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderTopColor: theme.line,
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15 }}>Total</Text>
              <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15 }}>{centsToLabel(quote.totalCents)}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <OrderDetail orderId={id!} />
    </RequireAuth>
  );
}
