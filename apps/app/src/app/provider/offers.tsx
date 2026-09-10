import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import type { ProviderOfferSummary } from '@laandry/api-client';

import { Button } from '@/components/button';
import { RequireAuth } from '@/components/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { api, LaandryApiError } from '@/lib/auth-store';

const SERVICE_LABEL: Record<ProviderOfferSummary['service'], string> = {
  EVERYDAY_LAUNDRY: 'Everyday Laundry',
  FORMAL_SPECIAL_CARE: 'Formal & Special Garments',
  BEDDING_HOUSEHOLD: 'Bedding & Household',
  TRAVEL: 'Travel',
};

const OPEN_STATUSES = new Set(['WAVE_1_OFFERED', 'WAVE_2_OFFERED']);

function OfferCard({ summary, onAccepted }: { summary: ProviderOfferSummary; onAccepted: (orderId: string) => void }) {
  const theme = useTheme();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOpen = OPEN_STATUSES.has(summary.offer.status);

  async function onAccept() {
    setAccepting(true);
    setError(null);
    try {
      await api.acceptOffer(summary.offer.id);
      onAccepted(summary.offer.orderId);
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'OFFER_NO_LONGER_AVAILABLE') {
        setError('Someone else already took this one.');
      } else {
        setError('Couldn’t accept — please try again.');
      }
    } finally {
      setAccepting(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, backgroundColor: theme.paperRaised, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 15 }}>{SERVICE_LABEL[summary.service]}</Text>
        <Text style={{ color: isOpen ? theme.accent : theme.inkFaint, fontSize: 12.5, fontWeight: '600' }}>
          {summary.offer.status === 'ACCEPTED' ? 'You accepted this' : summary.offer.status === 'UNFULFILLED' ? 'No longer available' : 'Open'}
        </Text>
      </View>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{summary.approximateArea}</Text>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>
        Pickup {new Date(summary.pickupWindowStart).toLocaleString()}
      </Text>
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      {isOpen ? (
        <Button label="Accept" onPress={onAccept} loading={accepting} />
      ) : summary.offer.status === 'ACCEPTED' ? (
        <Button label="View Order" variant="secondary" onPress={() => router.push({ pathname: '/provider/orders/[id]', params: { id: summary.offer.orderId } })} />
      ) : null}
    </View>
  );
}

function OffersList() {
  const theme = useTheme();
  const [offers, setOffers] = useState<ProviderOfferSummary[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    return api.listProviderOffers().then((res) => setOffers(res.offers));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function onAccepted(orderId: string) {
    load();
    router.push({ pathname: '/provider/orders/[id]', params: { id: orderId } });
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Offers</Text>
        {loading ? (
          <Text style={{ color: theme.inkSoft }}>Loading…</Text>
        ) : offers.length === 0 ? (
          <Text style={{ color: theme.inkSoft, fontSize: 14 }}>No offers right now — check back once you're active in a covered area.</Text>
        ) : (
          offers.map((summary) => <OfferCard key={summary.offer.id} summary={summary} onAccepted={onAccepted} />)
        )}
      </View>
    </ScrollView>
  );
}

export default function ProviderOffersScreen() {
  return (
    <RequireAuth role="provider">
      <OffersList />
    </RequireAuth>
  );
}
