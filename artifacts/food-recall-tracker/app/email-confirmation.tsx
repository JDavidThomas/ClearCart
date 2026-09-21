import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function EmailConfirmationScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resendConfirmationEmail } = useAuth();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = typeof params.email === 'string' ? params.email : params.email?.[0] ?? '';
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setResending(true);
    setMessage(null);
    setError(null);
    try {
      await resendConfirmationEmail(email);
      setMessage('A new confirmation email is on its way.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'We could not resend the confirmation email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 34 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.replace('/sign-up')} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back to sign up</Text>
        </Pressable>
        <View style={[styles.icon, { backgroundColor: colors.successSoft }]}>
          <Feather name="mail" size={27} color={colors.success} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Check your inbox</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          We sent a confirmation link to:
        </Text>
        <Text style={[styles.email, { color: colors.foreground }]}>{email}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Tap the link in that email to confirm your account, then return here and log in. Check your spam or junk folder if you do not see it soon.
        </Text>
        {message ? (
          <View style={[styles.successBox, { backgroundColor: colors.successSoft }]}>
            <Feather name="check-circle" size={17} color={colors.success} />
            <Text style={[styles.messageText, { color: colors.foreground }]}>{message}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={[styles.messageText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={resending}
          onPress={() => void resend()}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed || resending ? 0.7 : 1 }]}
        >
          {resending ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="refresh-cw" size={17} color={colors.primary} />}
          <Text style={[styles.secondaryText, { color: colors.primary }]}>{resending ? 'Sending…' : 'Resend confirmation email'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
        >
          <Feather name="log-in" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Go to Log In</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 24 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 44 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  icon: { alignItems: 'center', borderRadius: 16, height: 62, justifyContent: 'center', marginTop: 30, width: 62 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.7, lineHeight: 38, marginTop: 20 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 12 },
  email: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 23, marginTop: 5 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 16 },
  successBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, marginTop: 20, padding: 12 },
  errorBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, marginTop: 20, padding: 12 },
  messageText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  secondaryButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 54, marginTop: 24 },
  secondaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 56, marginTop: 12 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});