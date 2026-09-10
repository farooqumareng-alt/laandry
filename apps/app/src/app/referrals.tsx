import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { CreditLedgerEntry } from '@laandry/api-client';
import { REFERRAL_CREDIT_CENTS } from '@laandry/domain';

import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const REASON_LABELS: Record<string, string> = {
  referral_referrer: 'Friend completed their first Laandry',
  referral_referee: 'Welcome credit from your referral',
  spent_at_booking: 'Applied to an order',
};

/**
 * Invite a friend — docs/ARCHITECTURE.md §32. Credit only ever shows up
 * here once it's real: granted on the referee's first order reaching
 * DELIVERED, never at signup (§7's threat-model note on referral abuse).
 */
function ReferralsView() {
  const theme = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [entries, setEntries] = useState<CreditLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getReferralCode(), api.getCredit()])
      .then(([codeRes, creditRes]) => {
        setCode(codeRes.code);
        setBalanceCents(creditRes.balanceCents);
        setEntries(creditRes.entries);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 20 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Invite a friend</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 14, marginTop: 4 }}>
            You both get {centsToLabel(REFERRAL_CREDIT_CENTS)} in Laandry credit — theirs when they sign up with
            your code, yours once their first Laandry is delivered.
          </Text>
        </View>

        {loading ? (
          <Text style={{ color: theme.inkSoft }}>Loading…</Text>
        ) : (
          <>
            <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 20, alignItems: 'center', gap: 6, backgroundColor: theme.paperRaised }}>
              <Text style={{ color: theme.inkSoft, fontSize: 12.5 }}>Your code</Text>
              <Text style={{ color: theme.accent, fontSize: 28, fontWeight: '700', letterSpacing: 2 }}>{code}</Text>
              <Text style={{ color: theme.inkFaint, fontSize: 12.5, marginTop: 4 }}>Share it — they enter it when creating their account.</Text>
            </View>

            <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16 }}>
              <Text style={{ color: theme.inkSoft, fontSize: 12.5 }}>Available credit</Text>
              <Text style={{ color: theme.ink, fontSize: 26, fontWeight: '700', marginTop: 4 }}>{centsToLabel(balanceCents)}</Text>
              <Text style={{ color: theme.inkFaint, fontSize: 12.5, marginTop: 4 }}>Applied automatically as an option at your next booking&apos;s Review step.</Text>
            </View>

            {entries.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Activity</Text>
                {entries.map((e) => (
                  <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.line }}>
                    <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{REASON_LABELS[e.reason] ?? e.reason}</Text>
                    <Text style={{ color: e.amountCents >= 0 ? theme.accent : theme.ink, fontSize: 13.5, fontWeight: '600' }}>
                      {e.amountCents >= 0 ? '+' : ''}
                      {centsToLabel(e.amountCents)}
                    </Text>
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

export default function ReferralsScreen() {
  return (
    <RequireAuth role="customer">
      <ReferralsView />
    </RequireAuth>
  );
}
