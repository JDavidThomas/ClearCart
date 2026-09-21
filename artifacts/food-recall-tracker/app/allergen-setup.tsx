import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALLERGEN_OPTIONS } from '@/components/AllergenInsights';
import { useAuth, type AllergySeverity } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

const SEVERITY_OPTIONS: { id: Exclude<AllergySeverity, null>; title: string; description: string }[] = [
  { id: 'mild', title: 'Mild', description: 'Discomfort' },
  { id: 'moderate', title: 'Moderate', description: 'Need to avoid' },
  { id: 'severe', title: 'Severe', description: 'Life-threatening' },
];

export default function AllergenSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, uploadAvatar } = useAuth();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(profile?.allergies ?? []);
  const [customAllergy, setCustomAllergy] = useState(profile?.customAllergy ?? '');
  const [severity, setSeverity] = useState<AllergySeverity>(profile?.severity ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatarUrl ?? null);
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Log in to set up your allergen profile.</Text>
        <Pressable onPress={() => router.replace('/profile')} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Go to Profile</Text>
        </Pressable>
      </View>
    );
  }

  const toggleAllergen = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const finish = async (answers = {
    allergies: selected,
    customAllergy,
    severity,
    avatarUrl,
  }) => {
    setError(null);
    setSaving(true);
    try {
      await updateProfile(answers);
      router.replace('/profile');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'We could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const chooseAvatar = async () => {
    setError(null);
    setAvatarNotice(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to choose a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    setPendingAvatarUri(result.assets[0].uri);
  };

  const confirmAvatar = async () => {
    if (!pendingAvatarUri) return;
    setUploading(true);
    setError(null);
    setAvatarNotice(null);
    try {
      const publicUrl = await uploadAvatar(pendingAvatarUri);
      setAvatarUrl(publicUrl);
      setPendingAvatarUri(null);
      setAvatarNotice('Upload complete');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'We could not upload that photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 30 }]} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => step === 0 ? router.back() : setStep(step - 1)} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>{step === 0 ? 'Profile' : 'Back'}</Text>
        </Pressable>
        <View style={styles.progressRow}>
          {[0, 1, 2].map((item) => <View key={item} style={[styles.progressDot, { backgroundColor: item <= step ? colors.primary : colors.input }]} />)}
        </View>
        {step === 0 ? (
          <AllergyStep
            colors={colors}
            selected={selected}
            customAllergy={customAllergy}
            onToggle={toggleAllergen}
            onCustomChange={setCustomAllergy}
            onNext={() => setStep(1)}
            onSkip={() => void finish({ allergies: [], customAllergy: '', severity: null, avatarUrl })}
          />
        ) : step === 1 ? (
          <SeverityStep
            colors={colors}
            severity={severity}
            onSelect={setSeverity}
            onNext={() => setStep(2)}
          />
        ) : (
          <PhotoStep
            colors={colors}
            avatarUrl={pendingAvatarUri ?? avatarUrl}
            hasPendingAvatar={Boolean(pendingAvatarUri)}
            uploading={uploading}
            saving={saving}
            error={error}
            successMessage={avatarNotice}
            onChoose={() => void chooseAvatar()}
            onConfirm={() => void confirmAvatar()}
            onFinish={() => void finish()}
            onSkip={() => void finish()}
          />
        )}
        {step < 2 && error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function AllergyStep({
  colors,
  selected,
  customAllergy,
  onToggle,
  onCustomChange,
  onNext,
  onSkip,
}: {
  colors: ReturnType<typeof useColors>;
  selected: string[];
  customAllergy: string;
  onToggle: (id: string) => void;
  onCustomChange: (value: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const otherSelected = selected.includes('other');
  return (
    <View>
      <View style={[styles.headingIcon, { backgroundColor: colors.blueSoft }]}><Feather name="heart" size={25} color={colors.primary} /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>Do you have any food allergies?</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Select all that apply. You can change these choices later.</Text>
      <View style={styles.grid}>
        {ALLERGEN_OPTIONS.map((option) => {
          const active = selected.includes(option.id);
          return (
            <Pressable
              key={option.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => onToggle(option.id)}
              style={({ pressed }) => [styles.option, { backgroundColor: active ? colors.blueSoft : colors.card, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.checkbox, { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.input }]}>
                {active ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
              </View>
              <Text style={[styles.optionText, { color: colors.foreground }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {otherSelected ? (
        <TextInput
          autoCapitalize="sentences"
          onChangeText={onCustomChange}
          placeholder="Tell us about your other allergy"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.customInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          value={customAllergy}
        />
      ) : null}
      <Pressable onPress={onNext} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Continue</Text>
        <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
      </Pressable>
      <Pressable onPress={onSkip} style={styles.skipButton}><Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text></Pressable>
    </View>
  );
}

function SeverityStep({
  colors,
  severity,
  onSelect,
  onNext,
}: {
  colors: ReturnType<typeof useColors>;
  severity: AllergySeverity;
  onSelect: (severity: Exclude<AllergySeverity, null>) => void;
  onNext: () => void;
}) {
  return (
    <View>
      <View style={[styles.headingIcon, { backgroundColor: colors.warningSoft }]}><Feather name="activity" size={25} color={colors.warning} /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>How severe are your allergies?</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>This helps us emphasize alerts appropriately.</Text>
      <View style={styles.severityList}>
        {SEVERITY_OPTIONS.map((option) => {
          const active = severity === option.id;
          return (
            <Pressable key={option.id} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.severityOption, { backgroundColor: active ? colors.blueSoft : colors.card, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.radio, { borderColor: active ? colors.primary : colors.input }]}>{active ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}</View>
              <View style={styles.severityCopy}><Text style={[styles.optionText, { color: colors.foreground }]}>{option.title}</Text><Text style={[styles.severityDescription, { color: colors.mutedForeground }]}>{option.description}</Text></View>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={onNext} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Continue</Text>
        <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

function PhotoStep({
  colors,
  avatarUrl,
  hasPendingAvatar,
  uploading,
  saving,
  error,
  successMessage,
  onChoose,
  onConfirm,
  onFinish,
  onSkip,
}: {
  colors: ReturnType<typeof useColors>;
  avatarUrl: string | null;
  hasPendingAvatar: boolean;
  uploading: boolean;
  saving: boolean;
  error: string | null;
  successMessage: string | null;
  onChoose: () => void;
  onConfirm: () => void;
  onFinish: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.photoStep}>
      <View style={[styles.headingIcon, { backgroundColor: colors.successSoft }]}><Feather name="image" size={25} color={colors.success} /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>Add a profile photo</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Optional. A photo makes your profile easier to recognize.</Text>
      <Pressable onPress={onChoose} style={({ pressed }) => [styles.avatarButton, { opacity: pressed ? 0.7 : 1 }]}>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.largeAvatar} contentFit="cover" /> : <View style={[styles.largeAvatar, { backgroundColor: colors.blueSoft }]}><Feather name="camera" size={32} color={colors.primary} /></View>}
        <Text style={[styles.changePhotoText, { color: colors.primary }]}>{uploading ? 'Uploading…' : hasPendingAvatar ? 'Photo selected' : 'Choose from Gallery'}</Text>
      </Pressable>
      {hasPendingAvatar ? (
        <View style={styles.photoActions}>
          <Text style={[styles.previewText, { color: colors.mutedForeground }]}>Preview ready. Confirm to save it to your profile.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={uploading}
            onPress={onConfirm}
            style={({ pressed }) => [styles.confirmPhotoButton, { backgroundColor: colors.primary, opacity: pressed || uploading ? 0.7 : 1 }]}
          >
            {uploading ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="upload" size={17} color={colors.primaryForeground} />}
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{uploading ? 'Uploading…' : 'Use this photo'}</Text>
          </Pressable>
          <Pressable disabled={uploading} onPress={onChoose} style={styles.chooseDifferentButton}>
            <Text style={[styles.chooseDifferentText, { color: colors.primary }]}>Choose a different one</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
      {successMessage ? <Text style={[styles.successText, { color: colors.success }]}>{successMessage}</Text> : null}
      <Pressable disabled={uploading || saving || hasPendingAvatar} onPress={onFinish} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || uploading || saving || hasPendingAvatar ? 0.7 : 1 }]}>
        {saving ? <ActivityIndicator color={colors.primaryForeground} /> : null}
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Finish Setup'}</Text>
      </Pressable>
      <Pressable disabled={uploading || saving} onPress={onSkip} style={styles.skipButton}><Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 24 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 44 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  progressRow: { flexDirection: 'row', gap: 6, marginTop: 16 },
  progressDot: { borderRadius: 999, flex: 1, height: 5 },
  headingIcon: { alignItems: 'center', borderRadius: 16, height: 56, justifyContent: 'center', marginTop: 26, width: 56 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.6, lineHeight: 36, marginTop: 18 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 26 },
  option: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 50, paddingHorizontal: 11, width: '48%' },
  checkbox: { alignItems: 'center', borderRadius: 6, borderWidth: 1, height: 23, justifyContent: 'center', width: 23 },
  optionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  customInput: { borderRadius: 13, borderWidth: 1, fontFamily: 'Inter_400Regular', fontSize: 15, marginTop: 14, minHeight: 52, paddingHorizontal: 14 },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 55, marginTop: 26 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  skipButton: { alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: 8 },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  severityList: { gap: 11, marginTop: 28 },
  severityOption: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 76, paddingHorizontal: 15 },
  radio: { alignItems: 'center', borderRadius: 999, borderWidth: 2, height: 24, justifyContent: 'center', width: 24 },
  radioDot: { borderRadius: 999, height: 12, width: 12 },
  severityCopy: { gap: 4 },
  severityDescription: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  photoStep: { alignItems: 'center' },
  avatarButton: { alignItems: 'center', marginTop: 28 },
  largeAvatar: { alignItems: 'center', borderRadius: 999, height: 150, justifyContent: 'center', width: 150 },
  changePhotoText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 14 },
  photoActions: { alignItems: 'center', gap: 10, marginTop: 16, width: '100%' },
  previewText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  confirmPhotoButton: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 50, paddingHorizontal: 18, width: '100%' },
  chooseDifferentButton: { alignItems: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  chooseDifferentText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  errorText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 12 },
  successText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19, marginTop: 12 },
});