import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  DEFAULT_PREFERENCES,
  GARMENT_CARE_RATES_CENTS,
  HOUSEHOLD_RATES_CENTS,
  WEIGHT_TIER_PRICE_CENTS,
  WEIGHT_TIER_RANGE_LB,
  WEIGHT_TIERS,
  type BookingServiceInput,
  type ComputedQuote,
  type LaandryPreferences,
  type ServiceType,
  type WeightTier,
} from '@laandry/domain';
import type { Address } from '@laandry/api-client';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { RequireAuth } from '@/components/require-auth';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { api, LaandryApiError } from '@/lib/auth-store';

const SERVICES: { value: ServiceType; label: string; description: string }[] = [
  { value: 'EVERYDAY_LAUNDRY', label: 'Everyday Laundry', description: 'Wash, dry, fold — priced by weight.' },
  { value: 'FORMAL_SPECIAL_CARE', label: 'Formal & Special Garments', description: 'Priced per item.' },
  { value: 'BEDDING_HOUSEHOLD', label: 'Bedding & Household', description: 'Sheets, towels, comforters and more.' },
  { value: 'TRAVEL', label: 'Laandry for Travelers', description: 'Hotel and short-stay pickup, priced by weight.' },
];

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function isItemBased(service: ServiceType): boolean {
  return service === 'FORMAL_SPECIAL_CARE' || service === 'BEDDING_HOUSEHOLD';
}

interface ItemLine {
  description: string;
  quantity: number;
}

function pickupWindows() {
  const now = new Date();
  const startOfHour = (base: Date, hour: number, dayOffset = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const todayEvening = now.getHours() < 15;
  return [
    todayEvening
      ? { label: 'Today, 5–7 PM', start: startOfHour(now, 17), end: startOfHour(now, 19) }
      : { label: 'Tomorrow, 9–11 AM', start: startOfHour(now, 9, 1), end: startOfHour(now, 11, 1) },
    { label: 'Tomorrow, 9–11 AM', start: startOfHour(now, 9, 1), end: startOfHour(now, 11, 1) },
    { label: 'Tomorrow, 5–7 PM', start: startOfHour(now, 17, 1), end: startOfHour(now, 19, 1) },
  ].filter((w, i, arr) => arr.findIndex((x) => x.label === w.label) === i);
}

function StepHeader({ step, title }: { step: number; title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: 20 }}>
      <Text style={{ color: theme.brass, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>
        STEP {step} OF 4
      </Text>
      <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '600' }}>{title}</Text>
    </View>
  );
}

function BookingWizard() {
  const theme = useTheme();
  const [step, setStep] = useState(1);

  const [service, setService] = useState<ServiceType | null>(null);
  const [weightTier, setWeightTier] = useState<WeightTier>('30_40');
  const [items, setItems] = useState<ItemLine[]>([]);
  const [preferences, setPreferences] = useState<LaandryPreferences>(DEFAULT_PREFERENCES);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const windows = useMemo(pickupWindows, []);
  const [windowIndex, setWindowIndex] = useState(0);

  const [paymentMethodToken, setPaymentMethodToken] = useState('tok_visa');
  const [quote, setQuote] = useState<ComputedQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProfile().then((profile) => {
      setPreferences(profile.preferences);
      setAddresses(profile.addresses);
      if (profile.addresses[0]) setAddressId(profile.addresses[0].id);
    });
  }, []);

  const serviceInput: BookingServiceInput | null = !service
    ? null
    : isItemBased(service)
      ? items.length > 0
        ? ({ service, items } as BookingServiceInput)
        : null
      : ({ service, weightTier } as BookingServiceInput);

  useEffect(() => {
    if (step !== 4 || !serviceInput) return;
    setQuoteLoading(true);
    setError(null);
    api
      .quotePreview({ ...serviceInput, preferenceOverrides: preferences })
      .then(setQuote)
      .catch(() => setError('Couldn’t price this order — please try again.'))
      .finally(() => setQuoteLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function addItem(description: string) {
    setItems((prev) => {
      const existing = prev.find((i) => i.description === description);
      if (existing) {
        return prev.map((i) => (i.description === description ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { description, quantity: 1 }];
    });
  }

  function removeItem(description: string) {
    setItems((prev) => prev.filter((i) => i.description !== description));
  }

  async function onSubmit() {
    if (!serviceInput || !addressId) return;
    setSubmitting(true);
    setError(null);
    try {
      const win = windows[windowIndex]!;
      const { order } = await api.createOrder({
        ...serviceInput,
        addressId,
        pickupWindowStart: win.start.toISOString(),
        pickupWindowEnd: win.end.toISOString(),
        paymentMethodToken,
        preferenceOverrides: preferences,
      });
      router.replace({ pathname: '/orders/[id]', params: { id: order.id } });
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'PAYMENT_DECLINED') {
        setError('That payment method was declined. Try a different one.');
      } else {
        setError('Couldn’t schedule your Laandry — please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {step === 1 && (
          <View>
            <StepHeader step={1} title="What do you need taken care of?" />
            <View style={{ gap: 10 }}>
              {SERVICES.map((s) => (
                <Pressable
                  key={s.value}
                  onPress={() => {
                    setService(s.value);
                    setItems([]);
                    setStep(2);
                  }}
                  style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 16, backgroundColor: theme.paperRaised }}
                >
                  <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}>{s.label}</Text>
                  <Text style={{ color: theme.inkSoft, fontSize: 13.5, marginTop: 2 }}>{s.description}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 2 && service && (
          <View style={{ gap: 20 }}>
            <StepHeader step={2} title="Tell us how you'd like it cared for." />

            {!isItemBased(service) ? (
              <ChipGroup
                label="Approximate amount"
                value={weightTier}
                onChange={setWeightTier}
                options={WEIGHT_TIERS.map((tier) => ({
                  value: tier,
                  label:
                    tier === 'NOT_SURE'
                      ? 'Not sure'
                      : `${WEIGHT_TIER_RANGE_LB[tier][0]}–${WEIGHT_TIER_RANGE_LB[tier][1]} lb · ${centsToLabel(WEIGHT_TIER_PRICE_CENTS[tier])}`,
                }))}
              />
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>Items</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(service === 'FORMAL_SPECIAL_CARE' ? GARMENT_CARE_RATES_CENTS : HOUSEHOLD_RATES_CENTS).map(
                    ([description, cents]) => (
                      <Pressable
                        key={description}
                        onPress={() => addItem(description)}
                        style={{ borderWidth: 1, borderColor: theme.lineStrong, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}
                      >
                        <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>
                          + {description} · {centsToLabel(cents)}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
                {items.length > 0 ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    {items.map((item) => (
                      <View
                        key={item.description}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <Text style={{ color: theme.ink, fontSize: 14 }}>
                          {item.description} ×{item.quantity}
                        </Text>
                        <Text onPress={() => removeItem(item.description)} style={{ color: theme.danger, fontSize: 13 }}>
                          Remove
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: theme.inkFaint, fontSize: 13 }}>Tap an item above to add it.</Text>
                )}
              </View>
            )}

            <View style={{ gap: 4 }}>
              <SwitchRow
                label="Hang selected items"
                value={preferences.foldOrHang === 'hang'}
                onChange={(v) => setPreferences((p) => ({ ...p, foldOrHang: v ? 'hang' : 'fold' }))}
              />
              <SwitchRow
                label="Ironing / pressing"
                value={preferences.ironingRequested}
                onChange={(v) => setPreferences((p) => ({ ...p, ironingRequested: v }))}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="secondary" onPress={() => setStep(1)} />
              </View>
              <View style={{ flex: 2 }}>
                <Button label="Continue" onPress={() => setStep(3)} disabled={!serviceInput} />
              </View>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 20 }}>
            <StepHeader step={3} title="Where and when should we pick up?" />

            {addresses.length === 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
                  You don't have a saved address yet.
                </Text>
                <Button label="Add an Address" variant="secondary" onPress={() => router.push('/account')} />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>Pickup address</Text>
                {addresses.map((address) => {
                  const selected = address.id === addressId;
                  return (
                    <Pressable
                      key={address.id}
                      onPress={() => setAddressId(address.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? theme.accent : theme.line,
                        backgroundColor: selected ? theme.accentSoft : theme.paperRaised,
                        borderRadius: 10,
                        padding: 14,
                      }}
                    >
                      <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 14.5 }}>{address.label}</Text>
                      <Text style={{ color: theme.inkSoft, fontSize: 13 }}>
                        {address.line1}, {address.city}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <ChipGroup
              label="Pickup window"
              value={String(windowIndex)}
              onChange={(v) => setWindowIndex(Number(v))}
              options={windows.map((w, i) => ({ value: String(i), label: w.label }))}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="secondary" onPress={() => setStep(2)} />
              </View>
              <View style={{ flex: 2 }}>
                <Button label="Continue" onPress={() => setStep(4)} disabled={!addressId} />
              </View>
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={{ gap: 20 }}>
            <StepHeader step={4} title="Review your Laandry" />

            {quoteLoading ? (
              <Text style={{ color: theme.inkSoft }}>Pricing your order…</Text>
            ) : quote ? (
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
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15 }}>Estimated Total</Text>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15 }}>{centsToLabel(quote.totalCents)}</Text>
                </View>
              </View>
            ) : null}

            <TextField
              label="Payment method (test token)"
              value={paymentMethodToken}
              onChangeText={setPaymentMethodToken}
              autoCapitalize="none"
            />
            <Text style={{ color: theme.inkFaint, fontSize: 12, marginTop: -12 }}>
              No live payment processor is connected yet — "tok_visa" authorizes, "tok_declined" simulates a decline.
            </Text>

            {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="secondary" onPress={() => setStep(3)} />
              </View>
              <View style={{ flex: 2 }}>
                <Button
                  label="Schedule My Laandry"
                  onPress={onSubmit}
                  loading={submitting}
                  disabled={!quote || quoteLoading}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export default function BookScreen() {
  return (
    <RequireAuth>
      <BookingWizard />
    </RequireAuth>
  );
}
