import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { CUSTOMER_MILESTONES, toCustomerMilestone } from '@laandry/domain';
import type { Incident, Order, QuoteResponse, Review, Tip, WeightVerification } from '@laandry/api-client';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { RequireAuth } from '@/components/require-auth';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { api, LaandryApiError } from '@/lib/auth-store';

const INCIDENT_TYPE_LABELS: Record<Incident['type'], string> = {
  DAMAGED_ITEM: 'Damaged item',
  MISSING_ITEM: 'Missing item',
  UNSUPPORTED_ITEM: 'Unsupported item',
  OTHER: 'Other',
};

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

function WeightApprovalCard({ orderId, verifiedWeightLb, onResolved }: { orderId: string; verifiedWeightLb: number; onResolved: () => void }) {
  const theme = useTheme();
  const [paymentMethodToken, setPaymentMethodToken] = useState('tok_visa');
  const [submitting, setSubmitting] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setSubmitting('approve');
    setError(null);
    try {
      await api.approveWeight(orderId, paymentMethodToken);
      onResolved();
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'PAYMENT_DECLINED') {
        setError('That payment method was declined. Try a different one.');
      } else {
        setError('Couldn’t process that — please try again.');
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function onDecline() {
    setSubmitting('decline');
    setError(null);
    try {
      await api.declineWeight(orderId);
      onResolved();
    } catch {
      setError('Couldn’t process that — please try again.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.brass, borderRadius: 12, padding: 16, gap: 12, backgroundColor: theme.accentSoft }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Your laundry weighed more than estimated</Text>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>
        Verified at {verifiedWeightLb} lb — more than your original estimate allowed for. Approve the adjusted price to
        continue as-is, or decline and we'll process it at your original price.
      </Text>
      <TextField label="Payment method (test token)" value={paymentMethodToken} onChangeText={setPaymentMethodToken} autoCapitalize="none" />
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Decline" variant="secondary" onPress={onDecline} loading={submitting === 'decline'} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Approve" onPress={onApprove} loading={submitting === 'approve'} />
        </View>
      </View>
    </View>
  );
}

const TIP_AMOUNTS_CENTS = [300, 500, 1000] as const;

function TipCard({ orderId, tips, onTipped }: { orderId: string; tips: Tip[]; onTipped: () => void }) {
  const theme = useTheme();
  const [amountCents, setAmountCents] = useState<number>(TIP_AMOUNTS_CENTS[1]);
  const [paymentMethodToken, setPaymentMethodToken] = useState('tok_visa');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanked, setThanked] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.addTip(orderId, amountCents, paymentMethodToken);
      setThanked(true);
      onTipped();
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'PAYMENT_DECLINED') {
        setError('That payment method was declined. Try a different one.');
      } else {
        setError('Couldn’t process that — please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const totalTippedCents = tips.reduce((sum, t) => sum + t.amountCents, 0);

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 14 }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>
        {totalTippedCents > 0 ? `You’ve tipped ${centsToLabel(totalTippedCents)}` : 'Tip your provider'}
      </Text>
      {thanked ? (
        <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>Thank you — it goes straight to them.</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TIP_AMOUNTS_CENTS.map((cents) => (
              <View key={cents} style={{ flex: 1 }}>
                <Button
                  label={centsToLabel(cents)}
                  variant={amountCents === cents ? 'primary' : 'secondary'}
                  onPress={() => setAmountCents(cents)}
                />
              </View>
            ))}
          </View>
          <TextField label="Payment method (test token)" value={paymentMethodToken} onChangeText={setPaymentMethodToken} autoCapitalize="none" />
          {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
          <Button label={`Send ${centsToLabel(amountCents)} Tip`} onPress={onSubmit} loading={submitting} />
        </>
      )}
    </View>
  );
}

function ReviewCard({ orderId, review, onSubmitted }: { orderId: string; review: Review | null; onSubmitted: () => void }) {
  const theme = useTheme();
  const [rating, setRating] = useState<'1' | '2' | '3' | '4' | '5'>('5');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.submitReview(orderId, { rating: Number(rating), comment: comment.trim() || undefined });
      onSubmitted();
    } catch {
      setError('Couldn’t submit that — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (review) {
    return (
      <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 6 }}>
        <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Your review</Text>
        <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</Text>
        {review.comment ? <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{review.comment}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 14 }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Rate this Laandry</Text>
      <ChipGroup
        label="Rating"
        value={rating}
        onChange={setRating}
        options={['1', '2', '3', '4', '5'].map((n) => ({ value: n as typeof rating, label: `${n} ★` }))}
      />
      <TextField label="Comment (optional)" value={comment} onChangeText={setComment} multiline />
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button label="Submit Review" onPress={onSubmit} loading={submitting} />
    </View>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [weightVerification, setWeightVerification] = useState<WeightVerification | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return Promise.all([
      api.getOrder(orderId),
      api.getWeightVerification(orderId),
      api.listIncidents(orderId),
      api.listTips(orderId),
      api.getReview(orderId),
    ])
      .then(([orderRes, weightRes, incidentsRes, tipsRes, reviewRes]) => {
        setOrder(orderRes.order);
        setQuote(orderRes.quote);
        setWeightVerification(weightRes.weightVerification);
        setIncidents(incidentsRes.incidents);
        setTips(tipsRes.tips);
        setReview(reviewRes.review);
      })
      .catch(() => setError('Couldn’t load this order.'));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
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

  const needsWeightApproval =
    !!weightVerification && weightVerification.requiredApproval && weightVerification.approvedByCustomer === null;

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

        {order.status === 'DELIVERED' ? (
          <>
            <TipCard orderId={orderId} tips={tips} onTipped={load} />
            <ReviewCard orderId={orderId} review={review} onSubmitted={load} />
          </>
        ) : null}

        {needsWeightApproval && weightVerification ? (
          <WeightApprovalCard orderId={orderId} verifiedWeightLb={weightVerification.verifiedWeightLb} onResolved={load} />
        ) : null}

        {incidents.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Reported issues</Text>
            {incidents.map((incident) => (
              <View key={incident.id} style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 12, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>
                    {INCIDENT_TYPE_LABELS[incident.type]}
                  </Text>
                  <Text style={{ color: incident.status === 'OPEN' ? theme.accent : theme.inkSoft, fontSize: 12.5, fontWeight: '600' }}>
                    {incident.status === 'OPEN' ? 'Being looked into' : 'Resolved'}
                  </Text>
                </View>
                <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{incident.description}</Text>
                {incident.status === 'RESOLVED' && incident.resolutionNote ? (
                  <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 2 }}>{incident.resolutionNote}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

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
