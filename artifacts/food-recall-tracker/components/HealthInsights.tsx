import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export const HEALTH_CONDITION_OPTIONS = [
  { id: 'diabetes-type-1', label: 'Diabetes (Type 1)' },
  { id: 'diabetes-type-2', label: 'Diabetes (Type 2)' },
  { id: 'celiac-disease', label: 'Celiac Disease' },
  { id: 'crohns-disease', label: "Crohn's Disease" },
  { id: 'ibs', label: 'IBS' },
  { id: 'hypertension', label: 'Hypertension' },
  { id: 'high-cholesterol', label: 'High Cholesterol' },
  { id: 'kidney-disease', label: 'Kidney Disease' },
  { id: 'heart-disease', label: 'Heart Disease' },
  { id: 'pregnancy', label: 'Pregnancy' },
  { id: 'other', label: 'Other' },
] as const;

export const DIETARY_PREFERENCE_OPTIONS = [
  { id: 'gluten-free', label: 'Gluten-Free' },
  { id: 'dairy-free', label: 'Dairy-Free' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'keto', label: 'Keto' },
  { id: 'low-sodium', label: 'Low-Sodium' },
  { id: 'low-sugar', label: 'Low-Sugar' },
  { id: 'low-fat', label: 'Low-Fat' },
  { id: 'low-carb', label: 'Low-Carb' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'nut-free', label: 'Nut-Free' },
  { id: 'other', label: 'Other' },
] as const;

const GLUTEN_TERMS = ['wheat', 'barley', 'rye', 'oat', 'malt', 'gluten'];

function labelsFor(ids: string[], options: readonly { id: string; label: string }[]) {
  return ids.map((id) => options.find((option) => option.id === id)?.label ?? id);
}

export function HealthDietInsights({
  productText,
  colors: providedColors,
}: {
  productText: string;
  colors?: ReturnType<typeof useColors>;
}) {
  const fallbackColors = useColors();
  const colors = providedColors ?? fallbackColors;
  const { status, profile } = useAuth();

  if (
    status !== 'authenticated' ||
    !profile?.healthConsentGiven ||
    (profile.healthConditions.length === 0 && profile.dietaryPreferences.length === 0)
  ) {
    return null;
  }

  const normalizedProductText = productText.toLowerCase();
  const hasGlutenConcern =
    profile.healthConditions.includes('celiac-disease') ||
    profile.dietaryPreferences.includes('gluten-free');
  const productMentionsGluten = GLUTEN_TERMS.some((term) => normalizedProductText.includes(term));
  const hasDiabetesConcern = profile.healthConditions.some((condition) => condition.startsWith('diabetes-'));
  const hasSodiumConcern =
    profile.healthConditions.includes('hypertension') ||
    profile.dietaryPreferences.includes('low-sodium');
  const hasGeneralDietConcern = profile.dietaryPreferences.some(
    (preference) => !['gluten-free', 'low-sodium'].includes(preference),
  );

  const reminders: string[] = [];
  if (hasGlutenConcern) reminders.push(productMentionsGluten ? 'gluten (including wheat, barley, rye, or oats)' : 'gluten, wheat, barley, rye, or oats');
  if (hasDiabetesConcern) reminders.push('added sugars');
  if (hasSodiumConcern) reminders.push('sodium');
  if (hasGeneralDietConcern || profile.healthConditions.some((condition) => !condition.startsWith('diabetes-') && condition !== 'celiac-disease' && condition !== 'hypertension')) {
    reminders.push('ingredients that matter for your preferences');
  }

  const uniqueReminders = [...new Set(reminders)];
  const conditionLabels = labelsFor(profile.healthConditions, HEALTH_CONDITION_OPTIONS);
  const preferenceLabels = labelsFor(profile.dietaryPreferences, DIETARY_PREFERENCE_OPTIONS);

  return (
    <View style={[styles.card, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
      <Feather name="info" size={22} color={colors.warning} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Health &amp; Diet Notes</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Based on your profile, you may want to check the label for: {uniqueReminders.join(', ')}. This app doesn&apos;t have full nutrition data, so please verify on the package.
        </Text>
        <Text style={[styles.profileSummary, { color: colors.mutedForeground }]}>
          Your profile includes {conditionLabels.concat(preferenceLabels).join(', ')}.
        </Text>
        <View style={styles.disclaimer}>
          <Feather name="info" size={13} color={colors.warning} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>Not medical advice.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  copy: {
    flex: 1,
    gap: 5,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  profileSummary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  disclaimer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 3,
  },
  disclaimerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});