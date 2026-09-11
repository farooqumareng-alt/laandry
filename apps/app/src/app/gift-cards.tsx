import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { GiftCard } from '@laandry/api-client';
import { GIFT_CARD_DENOMINATIONS_CENTS } from '@laandry/domain';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { RequireAuth } from '@/components/require-auth';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { api, LaandryApiError } from '@/lib/auth-store';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const DENOMINATION_OPTIONS = GIFT_CARD_DENOMINATIONS_CENTS.map((cents) => ({
  value: String(cents),
  label: centsToLabel(cents),
}));

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  GIFT_CARD_NOT_FOUND: "We couldn't find a gift card with that code.",
  GIFT_CARD_ALREADY_REDEEMED: 'That gift card has already been redeemed.',
};

/**
 * Buy and redeem gift cards — docs/ARCHITECTURE.md §34. Redeeming adds
 * the full face value to the same account-credit balance referrals
 * grant into (see referrals.tsx) — there's no separate gift-card
 * balance to track here, it's already spendable at the next booking's
 * Review step.
 */
function GiftCardsView() {
  const theme = useTheme();

  const [denomination, setDenomination] = useState(String(GIFT_CARD_DENOMINATIONS_CENTS[0]));
  const [recipientEmail, setRecipientEmail] = useState('');
  const [paymentMethodToken, setPaymentMethodToken] = useState('tok_visa');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<GiftCard | null>(null);

  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<GiftCard | null>(null);

  const [purchased, setPurchased] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);

  function loadPurchased() {
    return api.listMyGiftCards().then((res) => setPurchased(res.giftCards));
  }

  useEffect(() => {
    loadPurchased().finally(() => setLoading(false));
  }, []);

  async function onPurchase() {
    setPurchasing(true);
    setPurchaseError(null);
    setPurchaseSuccess(null);
    try {
      const { giftCard } = await api.purchaseGiftCard({
        valueCents: Number(denomination),
        recipientEmail: recipientEmail.trim() || undefined,
        paymentMethodToken,
      });
      setPurchaseSuccess(giftCard);
      setRecipientEmail('');
      await loadPurchased();
    } catch (err) {
      setPurchaseError(
        err instanceof LaandryApiError && err.code === 'PAYMENT_DECLINED'
          ? 'That payment method was declined.'
          : 'Couldn’t complete the purchase — please try again.',
      );
    } finally {
      setPurchasing(false);
    }
  }

  async function onRedeem() {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    setRedeemError(null);
    setRedeemSuccess(null);
    try {
      const { giftCard } = await api.redeemGiftCard(redeemCode.trim());
      setRedeemSuccess(giftCard);
      setRedeemCode('');
    } catch (err) {
      setRedeemError(
        (err instanceof LaandryApiError && err.code ? REDEEM_ERROR_MESSAGES[err.code] : undefined) ??
          'Couldn’t redeem that code — please try again.',
      );
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 28 }}>
        <View>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600' }}>Give someone their time back.</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 14, marginTop: 4 }}>
            A Laandry gift card redeems as account credit, spendable toward any order.
          </Text>
        </View>

        <View style={{ gap: 14, borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 20 }}>
          <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}>Buy a gift card</Text>
          <ChipGroup label="Amount" value={denomination} options={DENOMINATION_OPTIONS} onChange={setDenomination} />
          <TextField
            label="Recipient email (optional)"
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            autoCapitalize="none"
            placeholder="Leave blank to send it to yourself"
          />
          <TextField
            label="Payment method (test token)"
            value={paymentMethodToken}
            onChangeText={setPaymentMethodToken}
            autoCapitalize="none"
          />
          <Text style={{ color: theme.inkFaint, fontSize: 12 }}>
            No live payment processor is connected yet — &quot;tok_visa&quot; authorizes, &quot;tok_declined&quot; simulates a decline.
          </Text>
          {purchaseError ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{purchaseError}</Text> : null}
          {purchaseSuccess ? (
            <Text style={{ color: theme.accent, fontSize: 13.5 }}>
              Purchased — code {purchaseSuccess.code} was emailed to{' '}
              {purchaseSuccess.recipientEmail ?? 'you'}.
            </Text>
          ) : null}
          <Button label={`Buy for ${centsToLabel(Number(denomination))}`} onPress={onPurchase} loading={purchasing} />
        </View>

        <View style={{ gap: 14, borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 20 }}>
          <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}>Redeem a code</Text>
          <TextField label="Gift card code" value={redeemCode} onChangeText={setRedeemCode} autoCapitalize="characters" />
          {redeemError ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{redeemError}</Text> : null}
          {redeemSuccess ? (
            <Text style={{ color: theme.accent, fontSize: 13.5 }}>
              Redeemed — {centsToLabel(redeemSuccess.valueCents)} added to your account credit.
            </Text>
          ) : null}
          <Button label="Redeem" variant="secondary" onPress={onRedeem} loading={redeeming} disabled={!redeemCode.trim()} />
        </View>

        {!loading && purchased.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>Gift cards you&apos;ve bought</Text>
            {purchased.map((g) => (
              <View
                key={g.id}
                style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.line }}
              >
                <View>
                  <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>{g.code}</Text>
                  <Text style={{ color: theme.inkFaint, fontSize: 12 }}>{g.recipientEmail ?? 'Sent to you'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.ink, fontSize: 13.5, fontWeight: '600' }}>{centsToLabel(g.valueCents)}</Text>
                  <Text style={{ color: g.status === 'REDEEMED' ? theme.inkFaint : theme.accent, fontSize: 12 }}>
                    {g.status === 'REDEEMED' ? 'Redeemed' : 'Unredeemed'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function GiftCardsScreen() {
  return (
    <RequireAuth role="customer">
      <GiftCardsView />
    </RequireAuth>
  );
}
