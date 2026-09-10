import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { applyAsProvider, LaandryApiError } from '@/lib/auth-store';

const MIN_PASSWORD_LENGTH = 10;

function ApplyForm() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await applyAsProvider(email.trim(), password);
      router.replace('/provider/onboarding');
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('An account already exists for that email.');
      } else {
        setError('Couldn’t start your application — please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
      />
      {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}
      <Button
        label="Start My Application"
        onPress={onSubmit}
        loading={submitting}
        disabled={!email || password.length < MIN_PASSWORD_LENGTH}
      />
    </View>
  );
}

export default function BecomeProviderScreen() {
  const theme = useTheme();
  const { status, user } = useAuth();

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 480, width: '100%', alignSelf: 'center', paddingVertical: 24 }}>
        <Text style={{ color: theme.brass, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10 }}>
          BECOME A PROVIDER
        </Text>
        <Text style={{ color: theme.ink, fontSize: 26, fontWeight: '600', marginBottom: 10 }}>
          Earn on your schedule.
        </Text>
        <Text style={{ color: theme.inkSoft, fontSize: 15, marginBottom: 24 }}>
          Set your availability, receive eligible orders in your service area, and build the kind of service record
          customers rebook.
        </Text>

        {status === 'signedIn' && user?.role === 'provider' ? (
          <Button label="Continue My Application" onPress={() => router.push('/provider/onboarding')} />
        ) : status === 'signedIn' ? (
          <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
            You're signed in with a customer account — provider applications need a separate account.
          </Text>
        ) : (
          <ApplyForm />
        )}
      </View>
    </ScrollView>
  );
}
