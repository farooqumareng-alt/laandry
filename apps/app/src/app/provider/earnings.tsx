import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Payout, ProviderEarning } from '@laandry/api-client';

import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function SummaryTile({ label, valueCents, accent }: { label: string; valueCents: number; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 14, backgroundColor: theme.paperRaised }}>
      <Text style={{ color: theme.inkSoft, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <Text style={{ color: accent ? theme.accent : theme.ink, fontSize: 20, fontWeight: '700' }}>{centsToLabel(valueCents)}</Text>
    </View>
  );
}

/**
 * Earnings — docs/ARCHITECTURE.md §31. Always the server-computed
 * ledger (GET /provider/earnings' summary), never totaled on-device —
 * the whole point of an immutable ledger is that the client displays
 * it, it doesn't derive it.
 */
function EarningsView() {
  const theme = useTheme();
  const [earnings, setEarnings] = useState<ProviderEarning[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [summary, setSummary] = useState({ totalEarnedCents: 0, pendingCents: 0, paidOutCents: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProviderEarnings(), api.getProviderPayouts()])
      .then(([earningsRes, payoutsRes]) => {
        setEarnings(earningsRes.earnings);
        setSummary(earningsRes.summary);
        setPayouts(payoutsRes.payouts);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 20 }}>
        <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Earnings</Text>

        {loading ? (
          <Text style={{ color: theme.inkSoft }}>Loading…</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SummaryTile label="Available" valueCents={summary.pendingCents} accent />
              <SummaryTile label="Paid out" valueCents={summary.paidOutCents} />
              <SummaryTile label="Lifetime" valueCents={summary.totalEarnedCents} />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Recent earnings</Text>
              {earnings.length === 0 ? (
                <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>Completed orders and tips will show up here.</Text>
              ) : (
                earnings.map((e) => (
                  <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.line }}>
                    <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>
                      {new Date(e.createdAt).toLocaleDateString()} · {e.payoutId ? 'Paid out' : 'Pending'}
                    </Text>
                    <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>{centsToLabel(e.amountCents)}</Text>
                  </View>
                ))
              )}
            </View>

            {payouts.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Payout history</Text>
                {payouts.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.line }}>
                    <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>
                      {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : '—'} · {p.status}
                    </Text>
                    <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>{centsToLabel(p.amountCents)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function ProviderEarningsScreen() {
  return (
    <RequireAuth role="provider">
      <EarningsView />
    </RequireAuth>
  );
}
