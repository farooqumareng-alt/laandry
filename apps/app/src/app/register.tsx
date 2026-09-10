import { useState } from 'react';
import { router, Link } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { register, LaandryApiError } from '@/lib/auth-store';

const MIN_PASSWORD_LENGTH = 10;

export default function RegisterScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await register(email.trim(), password);
      router.replace('/preferences');
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('An account already exists for that email — try signing in instead.');
      } else if (err instanceof LaandryApiError && err.code === 'INVALID_INPUT') {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      } else {
        setError('Couldn’t create your account — please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24, justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: 16 }}>
        <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600', marginBottom: 4 }}>Create your account</Text>
        <Text style={{ color: theme.inkSoft, fontSize: 14, marginTop: -8 }}>
          Save your preferences once — every pickup after this one gets faster.
        </Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          error={passwordTooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
        />

        {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}

        <Button
          label="Create Account"
          onPress={onSubmit}
          loading={submitting}
          disabled={!email || password.length < MIN_PASSWORD_LENGTH}
        />

        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>Already have an account?</Text>
          <Link href="/login">
            <Text style={{ color: theme.accent, fontSize: 13.5, fontWeight: '600' }}>Sign in</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}
