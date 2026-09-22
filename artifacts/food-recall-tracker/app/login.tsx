import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PasswordField } from '@/components/PasswordField';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import {
  authenticateWithBiometrics,
  getBiometricAvailability,
  isBiometricCancellation,
  type BiometricAvailability,
} from '@/services/biometrics';

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const insets = useSafeAreaInsets();
  const { logIn, logInWithBiometrics, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [biometric, setBiometric] = useState<BiometricAvailability | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricPromptVisible, setBiometricPromptVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getBiometricAvailability().then((availability) => {
      if (mounted) setBiometric(availability);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const biometricReady = Boolean(
    biometric?.enabled && biometric.hasHardware && biometric.isEnrolled && biometric.kind,
  );

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await logIn(email, password);
      router.replace(next === '/allergen-setup' ? '/allergen-setup' : '/profile');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not log you in.');
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async () => {
    setError(null);
    setResetMessage(null);
    setSendingReset(true);
    try {
      await sendPasswordReset(email);
      setResetMessage('Reset email sent. Open the link on this device to choose a new password.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'We could not send the reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  const signInWithBiometrics = async () => {
    if (!biometricReady || biometricBusy) return;
    setError(null);
    setResetMessage(null);
    setBiometricBusy(true);
    setBiometricPromptVisible(true);
    try {
      const result = await authenticateWithBiometrics('Sign in to Food Recall Tracker');
      if (!result.success) {
        if (!isBiometricCancellation(result.error)) {
          setError('Biometric authentication failed. Please log in with your password.');
        }
        return;
      }

      await logInWithBiometrics();
      router.replace(next === '/allergen-setup' ? '/allergen-setup' : '/profile');
    } catch (biometricError) {
      setError(
        biometricError instanceof Error
          ? biometricError.message
          : 'Biometric authentication failed. Please log in with your password.',
      );
    } finally {
      setBiometricBusy(false);
      setBiometricPromptVisible(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 34 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <View style={[styles.icon, { backgroundColor: colors.blueSoft }]}>
          <Feather name="log-in" size={25} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Log in to use your saved allergy preferences on this device.
        </Text>
        <View style={styles.form}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" colors={colors} autoCapitalize="none" keyboardType="email-address" />
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            colors={colors}
            testID="login-password"
          />
          <Pressable disabled={sendingReset} onPress={() => void sendReset()} style={styles.forgotButton}>
            {sendingReset ? <ActivityIndicator color={colors.primary} size="small" /> : null}
            <Text style={[styles.forgotText, { color: colors.primary }]}>{sendingReset ? 'Sending reset email…' : 'Forgot Password?'}</Text>
          </Pressable>
          {error ? <ErrorBox message={error} colors={colors} /> : null}
          {resetMessage ? <View style={[styles.successBox, { backgroundColor: colors.successSoft }]}><Feather name="mail" size={17} color={colors.success} /><Text style={[styles.successText, { color: colors.foreground }]}>{resetMessage}</Text></View> : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 }]}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="log-in" size={18} color={colors.primaryForeground} />}
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{saving ? 'Logging in…' : 'Log In'}</Text>
          </Pressable>
          {biometricReady ? (
            <View style={[styles.biometricPrompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                disabled={biometricBusy || saving}
                onPress={() => void signInWithBiometrics()}
                style={({ pressed }) => [
                  styles.biometricButton,
                  { borderColor: colors.border, opacity: pressed || biometricBusy ? 0.65 : 1 },
                ]}
                testID="sign-in-with-biometrics-button"
              >
                {biometricBusy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons
                    name={biometric?.kind === 'face' ? 'scan-outline' : 'finger-print-outline'}
                    size={21}
                    color={colors.primary}
                  />
                )}
                <Text style={[styles.biometricButtonText, { color: colors.primary }]}>
                  {biometricBusy
                    ? 'Waiting for verification…'
                    : biometric?.kind === 'face'
                      ? 'Sign in with Face ID'
                      : 'Sign in with Fingerprint'}
                </Text>
              </Pressable>
              {biometricPromptVisible ? (
                <Text style={[styles.biometricPromptText, { color: colors.mutedForeground }]}>
                  Confirm your identity with your device unlock.
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={biometricBusy}
                onPress={() => {
                  setBiometricPromptVisible(false);
                  setError(null);
                }}
                style={styles.passwordEscape}
              >
                <Text style={[styles.passwordEscapeText, { color: colors.primary }]}>Use password instead</Text>
              </Pressable>
            </View>
          ) : null}
          {biometric?.enabled && biometric.hasHardware && !biometric.isEnrolled ? (
            <View style={[styles.settingsNotice, { backgroundColor: colors.warningSoft }]}>
              <Feather name="settings" size={16} color={colors.warning} />
              <Text style={[styles.settingsNoticeText, { color: colors.foreground }]}>
                Set up fingerprint or face unlock in your phone settings to use biometric sign-in.
              </Text>
            </View>
          ) : null}
          <Pressable onPress={() => router.replace('/sign-up')} style={styles.linkButton}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Need an account? Sign Up</Text>
          </Pressable>
        </View>
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
      <TextInput
        {...props}
        autoCorrect={false}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
      />
    </View>
  );
}

function ErrorBox({ message, colors }: { message: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
      <Feather name="alert-circle" size={17} color={colors.destructive} />
      <Text style={[styles.errorText, { color: colors.destructive }]}>{message}</Text>
    </View>
  );
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
  forgotButton: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 7, minHeight: 35, justifyContent: 'center' },
  forgotText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  errorBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  successBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  successText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 56, marginTop: 4 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  biometricPrompt: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 12 },
  biometricButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 50, paddingHorizontal: 14 },
  biometricButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  biometricPromptText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  passwordEscape: { alignItems: 'center', minHeight: 30, justifyContent: 'center' },
  passwordEscapeText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  settingsNotice: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  settingsNoticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
  linkButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});