import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import type { Address, Incident, Order } from '@laandry/api-client';
import { requiredProcessingStages, type ProcessingStage } from '@laandry/domain';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { RequireAuth } from '@/components/require-auth';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/auth-store';

const WEIGHT_BASED = new Set(['EVERYDAY_LAUNDRY', 'TRAVEL']);
const NO_INCIDENT_STATUSES = new Set(['SCHEDULED', 'PROVIDER_ASSIGNED', 'CANCELLED']);

const STAGE_LABELS: Record<ProcessingStage, string> = {
  wash: 'Washed per instructions',
  dry: 'Dried per instructions',
  fold: 'Folded',
  hang: 'Hung',
  iron: 'Ironed / pressed',
};

const INCIDENT_TYPE_LABELS: Record<Incident['type'], string> = {
  DAMAGED_ITEM: 'Damaged item',
  MISSING_ITEM: 'Missing item',
  UNSUPPORTED_ITEM: 'Unsupported item',
  OTHER: 'Other',
};

function PreferenceRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{label}</Text>
      <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

function PickupForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const theme = useTheme();
  const [method, setMethod] = useState<'qr' | 'pin' | 'signature'>('qr');
  const [bagCount, setBagCount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await api.recordPickup(orderId, { method, bagCount: bagCount ? Number(bagCount) : undefined });
      onDone();
    } catch {
      setError('Couldn’t confirm pickup — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 14 }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Confirm pickup</Text>
      <ChipGroup
        label="Handoff confirmed via"
        value={method}
        onChange={setMethod}
        options={[
          { value: 'qr', label: 'QR code' },
          { value: 'pin', label: 'PIN' },
          { value: 'signature', label: 'Signature' },
        ]}
      />
      <TextField label="Bag count" value={bagCount} onChangeText={setBagCount} keyboardType="number-pad" placeholder="e.g. 2" />
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button label="Confirm Pickup" onPress={onConfirm} loading={submitting} />
    </View>
  );
}

function WeightForm({ orderId, onDone }: { orderId: string; onDone: (requiredApproval: boolean) => void }) {
  const theme = useTheme();
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    const lb = Number(weight);
    if (!lb || lb <= 0) {
      setError('Enter the actual weight in pounds.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.verifyWeight(orderId, lb);
      onDone(res.weightVerification.requiredApproval);
    } catch {
      setError('Couldn’t submit that weight — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 14 }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Verify weight</Text>
      <TextField label="Actual weight (lb)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="e.g. 32" />
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button label="Submit Weight" onPress={onSubmit} loading={submitting} />
    </View>
  );
}

function ProcessingConfirmForm({ order, orderId, onDone }: { order: Order; orderId: string; onDone: () => void }) {
  const theme = useTheme();
  const required = requiredProcessingStages(order.preferenceSnapshot);
  const [checked, setChecked] = useState<Set<ProcessingStage>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(stage: ProcessingStage) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await api.confirmProcessing(orderId, [...checked]);
      onDone();
    } catch {
      setError('Every required stage needs to be checked before finishing.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 12 }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Confirm processing</Text>
      <Text style={{ color: theme.inkSoft, fontSize: 13 }}>
        Check off each stage as it's done, matching this customer's saved preferences above.
      </Text>
      {required.map((stage) => (
        <Button
          key={stage}
          variant={checked.has(stage) ? 'primary' : 'secondary'}
          label={`${checked.has(stage) ? '✓ ' : ''}${STAGE_LABELS[stage]}`}
          onPress={() => toggle(stage)}
        />
      ))}
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button label="Mark Finishing" onPress={onConfirm} loading={submitting} disabled={checked.size !== required.length} />
    </View>
  );
}

function IncidentForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const theme = useTheme();
  const [type, setType] = useState<Incident['type']>('DAMAGED_ITEM');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function onSubmit() {
    if (!description.trim()) {
      setError('Describe what happened.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.reportIncident(orderId, { type, description: description.trim() });
      setDescription('');
      setOpen(false);
      onDone();
    } catch {
      setError('Couldn’t submit that report — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return <Button variant="secondary" label="Report an issue with this order" onPress={() => setOpen(true)} />;
  }

  return (
    <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, gap: 14 }}>
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Report an issue</Text>
      <Text style={{ color: theme.inkSoft, fontSize: 13 }}>
        This doesn't hold up the order — it just puts it in front of our support team.
      </Text>
      <ChipGroup
        label="What happened"
        value={type}
        onChange={setType}
        options={(Object.keys(INCIDENT_TYPE_LABELS) as Incident['type'][]).map((t) => ({
          value: t,
          label: INCIDENT_TYPE_LABELS[t],
        }))}
      />
      <TextField label="What happened, specifically" value={description} onChangeText={setDescription} multiline />
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Submit Report" onPress={onSubmit} loading={submitting} />
        <Button variant="secondary" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

function ProviderOrderDetail({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weightNotice, setWeightNotice] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const [markingReady, setMarkingReady] = useState(false);

  function load() {
    return api
      .getProviderOrder(orderId)
      .then((res) => {
        setOrder(res.order);
        setAddress(res.address);
        return api.listIncidents(orderId).then((r) => setIncidents(r.incidents));
      })
      .catch(() => setError('This order isn’t available — it may not be assigned to you.'));
  }

  async function onMarkReadyForReturn() {
    setMarkingReady(true);
    try {
      const res = await api.markReadyForReturn(orderId);
      setReturnNotice(
        res.openIncidentCount > 0
          ? `Marked ready for return — ${res.openIncidentCount} open incident report${res.openIncidentCount === 1 ? '' : 's'} on file.`
          : 'Marked ready for return.',
      );
      load();
    } catch {
      setReturnNotice('Couldn’t mark this ready for return — please try again.');
    } finally {
      setMarkingReady(false);
    }
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

        {order.status === 'PROVIDER_ASSIGNED' ? <PickupForm orderId={orderId} onDone={load} /> : null}

        {order.status === 'PICKED_UP' && WEIGHT_BASED.has(order.service) ? (
          <WeightForm
            orderId={orderId}
            onDone={(requiredApproval) => {
              setWeightNotice(
                requiredApproval
                  ? 'Weight submitted — waiting on the customer to approve the extra amount.'
                  : 'Weight confirmed.',
              );
              load();
            }}
          />
        ) : null}
        {weightNotice ? <Text style={{ color: theme.accent, fontSize: 13.5 }}>{weightNotice}</Text> : null}

        {order.status === 'BEING_CARED_FOR' ? (
          <ProcessingConfirmForm order={order} orderId={orderId} onDone={load} />
        ) : null}

        {order.status === 'FINISHING' ? (
          <View style={{ gap: 10 }}>
            <Button label="Mark Ready for Return" onPress={onMarkReadyForReturn} loading={markingReady} />
          </View>
        ) : null}
        {returnNotice ? <Text style={{ color: theme.accent, fontSize: 13.5 }}>{returnNotice}</Text> : null}

        {!NO_INCIDENT_STATUSES.has(order.status) ? <IncidentForm orderId={orderId} onDone={load} /> : null}

        {incidents.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Reported issues</Text>
            {incidents.map((incident) => (
              <View key={incident.id} style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 12, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>
                    {INCIDENT_TYPE_LABELS[incident.type]}
                  </Text>
                  <Text style={{ color: incident.status === 'OPEN' ? theme.accent : theme.inkSoft, fontSize: 12.5, fontWeight: '600' }}>
                    {incident.status === 'OPEN' ? 'Open' : 'Resolved'}
                  </Text>
                </View>
                <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>{incident.description}</Text>
              </View>
            ))}
          </View>
        ) : null}

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
