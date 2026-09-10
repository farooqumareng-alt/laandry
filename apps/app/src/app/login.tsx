import { useState } from 'react';
import { router, Link } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { useTheme } from '@/hooks/use-theme';
import { login, LaandryApiError } from '@/lib/auth-store';

export default function LoginScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, needsMfa ? mfaCode.trim() : undefined);
      router.replace('/account');
    } catch (err) {
      if (err instanceof LaandryApiError) {
        if (err.code === 'MFA_REQUIRED') {
          setNeedsMfa(true);
          setError('Enter the 6-digit code from your authenticator app.');
        } else if (err.code === 'INVALID_CREDENTIALS') {
          setError('That email or password isn’t right.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        setError('Couldn’t reach Laandry — check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper, padding: 24, justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: 16 }}>
        <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '600', marginBottom: 4 }}>Sign in</Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        {needsMfa ? (
          <TextField
            label="Authenticator code"
            value={mfaCode}
            onChangeText={setMfaCode}
            keyboardType="number-pad"
            maxLength={6}
          />
        ) : null}

        {error ? <Text style={{ color: theme.danger, fontSize: 13.5 }}>{error}</Text> : null}

        <Button label="Sign In" onPress={onSubmit} loading={submitting} disabled={!email || !password} />

        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 13.5 }}>New to Laandry?</Text>
          <Link href="/register">
            <Text style={{ color: theme.accent, fontSize: 13.5, fontWeight: '600' }}>Create an account</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}
