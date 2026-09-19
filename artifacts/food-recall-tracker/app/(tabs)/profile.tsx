import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALLERGEN_OPTIONS } from '@/components/AllergenInsights';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

type AuthForm = 'sign-up' | 'log-in' | null;

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [form, setForm] = useState<AuthForm>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const topPadding = insets.top;

  const submitForm = async () => {
    setFormError(null);
    try {
      if (form === 'sign-up') {
        await auth.signUp(name, email, password);
      } else {
        await auth.logIn(email, password);
      }
      setForm(null);
      setPassword('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'We could not save your profile.');
    }
  };

  if (auth.status === 'loading') {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPadding + 28 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.eyebrowRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.blueSoft }]}>
            <Feather name="user" size={21} color={colors.primary} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR PROFILE</Text>
        </View>
        {auth.status === 'guest' && auth.authNotice ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
            <Feather name="info" size={16} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{auth.authNotice}</Text>
          </View>
        ) : null}

        {auth.status === 'authenticated' && auth.profile ? (
          <LoggedInProfile
            profile={auth.profile}
            authNotice={auth.authNotice}
            colors={colors}
            onSetUp={() => router.push('/allergen-setup')}
            onLogOut={() => void auth.logOut()}
          />
        ) : form ? (
          <AuthFormView
            form={form}
            name={name}
            email={email}
            password={password}
            error={formError}
            colors={colors}
            onNameChange={setName}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={() => void submitForm()}
            onCancel={() => {
              setForm(null);
              setFormError(null);
            }}
          />
        ) : (
          <GuestProfile
            colors={colors}
            onSignUp={() => {
              setForm('sign-up');
              setFormError(null);
            }}
            onLogIn={() => {
              setForm('log-in');
              setFormError(null);
            }}
            onContinue={() => router.replace('/')}
          />
        )}
      </ScrollView>
    </View>
  );
}

function GuestProfile({
  colors,
  onSignUp,
  onLogIn,
  onContinue,
}: {
  colors: ReturnType<typeof useColors>;
  onSignUp: () => void;
  onLogIn: () => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.title, { color: colors.foreground }]}>Make product checks personal.</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Create a free profile to get personalized allergen alerts and save your preferences. You can always keep using every recall check as a guest.
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onSignUp}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
          testID="profile-sign-up-button"
        >
          <Feather name="user-plus" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Sign Up</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onLogIn}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
          ]}
          testID="profile-log-in-button"
        >
          <Feather name="log-in" size={18} color={colors.primary} />
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Log In</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onContinue}
        style={({ pressed }) => [styles.guestLink, { opacity: pressed ? 0.6 : 1 }]}
        testID="continue-as-guest-button"
      >
        <Text style={[styles.guestLinkText, { color: colors.mutedForeground }]}>Continue as Guest</Text>
      </Pressable>
    </View>
  );
}

function AuthFormView({
  form,
  name,
  email,
  password,
  error,
  colors,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onCancel,
}: {
  form: Exclude<AuthForm, null>;
  name: string;
  email: string;
  password: string;
  error: string | null;
  colors: ReturnType<typeof useColors>;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isSignUp = form === 'sign-up';
  return (
    <View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {isSignUp ? 'Create your profile' : 'Welcome back'}
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {isSignUp
          ? 'A profile unlocks personalized allergen alerts without changing access to public recall information.'
          : 'Log in on this device to use your saved allergen preferences.'}
      </Text>
      <View style={styles.form}>
        {isSignUp ? (
          <Field
            label="Name"
            value={name}
            onChangeText={onNameChange}
            placeholder="Your name"
            colors={colors}
            autoCapitalize="words"
          />
        ) : null}
        <Field
          label="Email"
          value={email}
          onChangeText={onEmailChange}
          placeholder="you@example.com"
          colors={colors}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={onPasswordChange}
          placeholder="At least 6 characters"
          colors={colors}
          secureTextEntry
        />
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            {isSignUp ? 'Create Profile' : 'Log In'}
          </Text>
        </Pressable>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.guestLink, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.guestLinkText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  colors,
  ...props
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
      />
    </View>
  );
}

function LoggedInProfile({
  profile,
  authNotice,
  colors,
  onSetUp,
  onLogOut,
}: {
  profile: { name: string; email: string; allergies: string[] };
  authNotice: string | null;
  colors: ReturnType<typeof useColors>;
  onSetUp: () => void;
  onLogOut: () => void;
}) {
  const allergyLabels = profile.allergies.map(
    (id) => ALLERGEN_OPTIONS.find((option) => option.id === id)?.label ?? id,
  );
  const initials = profile.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View>
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{profile.name}</Text>
          <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{profile.email}</Text>
        </View>
      </View>

      {authNotice ? (
        <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
          <Feather name="smartphone" size={16} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.foreground }]}>{authNotice}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Allergens to watch for</Text>
        {allergyLabels.length > 0 ? (
          <View style={styles.chips}>
            {allergyLabels.map((label) => (
              <View key={label} style={[styles.chip, { backgroundColor: colors.blueSoft }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No allergens selected yet. Add them to turn on personalized alerts.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onSetUp}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: colors.border, marginTop: 14, opacity: pressed ? 0.65 : 1 },
          ]}
          testID="edit-allergen-profile-button"
        >
          <Feather name="edit-3" size={17} color={colors.primary} />
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
            {allergyLabels.length > 0 ? 'Edit Allergens' : 'Set Up Now'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onLogOut}
        style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.6 : 1 }]}
        testID="profile-log-out-button"
      >
        <Feather name="log-out" size={16} color={colors.destructive} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingScreen: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { paddingBottom: 110, paddingHorizontal: 24 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  iconCircle: { alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4 },
  centered: { alignItems: 'center', marginTop: 28 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.6, lineHeight: 36, marginTop: 20 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10, textAlign: 'center' },
  actions: { gap: 12, marginTop: 28, width: '100%' },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 54, paddingHorizontal: 18, width: '100%' },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  secondaryButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18, width: '100%' },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  guestLink: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 40, paddingHorizontal: 8 },
  guestLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  form: { gap: 14, marginTop: 28 },
  field: { gap: 7 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  input: { borderRadius: 13, borderWidth: 1, fontFamily: 'Inter_400Regular', fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  errorBox: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: 14, marginTop: 28 },
  avatar: { alignItems: 'center', borderRadius: 999, height: 64, justifyContent: 'center', width: 64 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  profileCopy: { flex: 1, gap: 4 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  profileEmail: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  notice: { alignItems: 'flex-start', borderRadius: 14, flexDirection: 'row', gap: 9, marginTop: 22, padding: 13 },
  noticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
  section: { marginTop: 30 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 10 },
  logoutButton: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 38, minHeight: 44 },
  logoutText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});