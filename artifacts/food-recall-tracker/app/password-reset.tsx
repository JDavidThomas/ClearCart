import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';

function getTokens(url: string) {
  const fragment = url.split('#')[1] ?? '';
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(`${fragment}&${query}`);
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
  };
}

export default function PasswordResetScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const acceptLink = async (url?: string) => {
      try {
        if (url) {
          const tokens = getTokens(url);
          if (tokens.accessToken && tokens.refreshToken) {
            await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            });
          } else if (tokens.code) {
            await supabase.auth.exchangeCodeForSession(tokens.code);
          }
        }
        const { data } = await supabase.auth.getSession();
        setHasSession(Boolean(data.session));
      } catch {
        setError('This reset link is invalid or has expired. Request a new one and try again.');
      }
    };

    void Linking.getInitialURL().then((url) => acceptLink(url ?? undefined));
    const subscription = Linking.addEventListener('url', ({ url }) => void acceptLink(url));
    const authSubscription = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true);
    });
    return () => {
      subscription.remove();
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage('Your password was updated. You can now log in with the new password.');
    await supabase.auth.signOut();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <View style={[styles.icon, { backgroundColor: colors.blueSoft }]}>
          <Feather name="lock" size={25} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Reset your password</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {hasSession ? 'Choose a new password for your account.' : 'Open the reset link from your email on this device to choose a new password.'}
        </Text>
        {hasSession ? (
          <View style={styles.form}>
            <Field label="New password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" colors={colors} secureTextEntry />
            <Field label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter it again" colors={colors} secureTextEntry />
            {error ? <ErrorBox message={error} colors={colors} /> : null}
            {message ? <View style={[styles.successBox, { backgroundColor: colors.successSoft }]}><Feather name="check-circle" size={17} color={colors.success} /><Text style={[styles.successText, { color: colors.foreground }]}>{message}</Text></View> : null}
            <Pressable disabled={saving} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 }]}>
              {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="check" size={18} color={colors.primaryForeground} />}
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{saving ? 'Updating…' : 'Update Password'}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => router.replace('/login')} style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 30 }]}>
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Back to Log In</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  colors,
  ...props
}: { label: string; colors: ReturnType<typeof useColors> } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput {...props} autoCorrect={false} placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]} />
    </View>
  );
}

function ErrorBox({ message, colors }: { message: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}><Feather name="alert-circle" size={17} color={colors.destructive} /><Text style={[styles.errorText, { color: colors.destructive }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 24 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 44 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  icon: { alignItems: 'center', borderRadius: 16, height: 58, justifyContent: 'center', marginTop: 28, width: 58 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.7, lineHeight: 38, marginTop: 18 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10 },
  form: { gap: 15, marginTop: 30 },
  field: { gap: 7 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  input: { borderRadius: 14, borderWidth: 1, fontFamily: 'Inter_400Regular', fontSize: 16, minHeight: 54, paddingHorizontal: 15 },
  errorBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  successBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  successText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 56 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});