import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await signUp(email, password);
      router.replace('/allergen-setup');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not create your account.');
    } finally {
      setSaving(false);
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
          <Feather name="user-plus" size={25} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Set up a profile so product checks can compare available information against your allergies.
        </Text>
        <View style={styles.form}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" colors={colors} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" colors={colors} secureTextEntry />
          <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter it again" colors={colors} secureTextEntry />
          {error ? <ErrorBox message={error} colors={colors} /> : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 }]}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="arrow-right" size={18} color={colors.primaryForeground} />}
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{saving ? 'Creating…' : 'Continue'}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/login')} style={styles.linkButton}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Already have an account? Log In</Text>
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
  errorBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 56, marginTop: 4 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  linkButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});