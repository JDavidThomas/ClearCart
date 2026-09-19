import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALLERGEN_OPTIONS } from '@/components/AllergenInsights';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function AllergenSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateAllergies } = useAuth();
  const [selected, setSelected] = useState<string[]>(profile?.allergies ?? []);
  const [saving, setSaving] = useState(false);

  const toggleAllergen = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const save = async () => {
    setSaving(true);
    await updateAllergies(selected);
    setSaving(false);
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 34 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Profile</Text>
        </Pressable>
        <View style={[styles.headingIcon, { backgroundColor: colors.blueSoft }]}>
          <Feather name="heart" size={25} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>What should we watch for?</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Choose any allergens you want checked when product ingredients are available. You can update these choices anytime.
        </Text>

        <View style={styles.options}>
          {ALLERGEN_OPTIONS.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                key={option.id}
                onPress={() => toggleAllergen(option.id)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: isSelected ? colors.blueSoft : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                testID={`allergen-option-${option.id}`}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.background,
                      borderColor: isSelected ? colors.primary : colors.input,
                    },
                  ]}
                >
                  {isSelected ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
                </View>
                <Text style={[styles.optionText, { color: colors.foreground }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 },
          ]}
          testID="save-allergen-profile-button"
        >
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {saving ? 'Saving…' : 'Save My Allergens'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Not now</Text>
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
  headingIcon: { alignItems: 'center', borderRadius: 16, height: 56, justifyContent: 'center', marginTop: 26, width: 56 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.6, lineHeight: 36, marginTop: 18 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10 },
  options: { gap: 10, marginTop: 28 },
  option: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 54, paddingHorizontal: 14 },
  checkbox: { alignItems: 'center', borderRadius: 7, borderWidth: 1, height: 25, justifyContent: 'center', width: 25 },
  optionText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  saveButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', marginTop: 26, minHeight: 54 },
  saveText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  skipButton: { alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: 8 },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});