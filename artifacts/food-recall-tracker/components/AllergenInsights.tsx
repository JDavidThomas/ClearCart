import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export const ALLERGEN_OPTIONS = [
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'tree-nuts', label: 'Tree nuts' },
  { id: 'milk', label: 'Milk' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'soy', label: 'Soy' },
  { id: 'sesame', label: 'Sesame' },
  { id: 'fish', label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'corn', label: 'Corn' },
] as const;

const ALLERGEN_TERMS: Record<string, string[]> = {
  peanuts: ['peanut', 'groundnut'],
  'tree-nuts': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  milk: ['milk', 'whey', 'casein', 'butter', 'cream', 'cheese', 'lactose'],
  eggs: ['egg', 'albumen', 'mayonnaise', 'mayo'],
  wheat: ['wheat', 'flour', 'gluten', 'barley', 'rye'],
  soy: ['soy', 'soybean', 'soya', 'lecithin'],
  sesame: ['sesame', 'tahini'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'anchovy'],
  shellfish: ['shrimp', 'crab', 'lobster', 'shellfish'],
  corn: ['corn', 'maize'],
};

interface AllergenInsightsProps {
  productText: string;
  dataAvailable: boolean;
  colors?: ReturnType<typeof useColors>;
}

function getLabel(id: string) {
  return ALLERGEN_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

function findMatches(allergies: string[], productText: string) {
  const normalized = productText.toLowerCase();
  return allergies.filter((allergen) =>
    (ALLERGEN_TERMS[allergen] ?? []).some((term) => normalized.includes(term)),
  );
}

export function AllergenInsights({ productText, dataAvailable, colors: providedColors }: AllergenInsightsProps) {
  const fallbackColors = useColors();
  const colors = providedColors ?? fallbackColors;
  const router = useRouter();
  const { status, profile, guestPromptDismissed, dismissGuestPrompt } = useAuth();

  if (status === 'loading') return null;

  if (status !== 'authenticated') {
    if (guestPromptDismissed) return null;
    return (
      <View style={[styles.promptCard, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
        <View style={[styles.promptIcon, { backgroundColor: colors.primary }]}>
          <Feather name="heart" size={17} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.promptTitle, { color: colors.foreground }]}>Personalized allergen alerts</Text>
        <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>
          Want to know if this product contains your allergens? Create a free profile to get personalized allergen alerts.
        </Text>
        <View style={styles.promptActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/profile')}
            style={({ pressed }) => [
              styles.smallPrimaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
            ]}
            testID="allergen-sign-up-button"
          >
            <Text style={[styles.smallPrimaryText, { color: colors.primaryForeground }]}>Sign Up</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={dismissGuestPrompt}
            style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.6 : 1 }]}
            testID="allergen-maybe-later-button"
          >
            <Text style={[styles.textButtonText, { color: colors.mutedForeground }]}>Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!profile || profile.allergies.length === 0) {
    return (
      <View style={[styles.promptCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <View style={[styles.promptIcon, { backgroundColor: colors.primary }]}>
          <Feather name="sliders" size={17} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.promptTitle, { color: colors.foreground }]}>Set up your allergen profile</Text>
        <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>
          Tell us what to watch for and we’ll personalize future product checks.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/allergen-setup')}
          style={({ pressed }) => [
            styles.smallPrimaryButton,
            { alignSelf: 'flex-start', backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
          testID="allergen-setup-button"
        >
          <Text style={[styles.smallPrimaryText, { color: colors.primaryForeground }]}>Set Up Now</Text>
        </Pressable>
      </View>
    );
  }

  if (!dataAvailable) {
    return (
      <View style={[styles.alertCard, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Feather name="help-circle" size={22} color={colors.warning} />
        <View style={styles.alertCopy}>
          <Text style={[styles.alertTitle, { color: colors.foreground }]}>Allergen data not available</Text>
          <Text style={[styles.alertBody, { color: colors.mutedForeground }]}>
            We need ingredient information for this product before we can compare it with your profile.
          </Text>
        </View>
      </View>
    );
  }

  const matches = findMatches(profile.allergies, productText);
  if (matches.length > 0) {
    return (
      <View style={[styles.alertCard, { backgroundColor: colors.dangerSoft, borderColor: colors.destructive }]}>
        <Feather name="alert-triangle" size={22} color={colors.destructive} />
        <View style={styles.alertCopy}>
          <Text style={[styles.alertTitle, { color: colors.foreground }]}>Allergen Alert</Text>
          <Text style={[styles.alertBody, { color: colors.mutedForeground }]}>
            This product contains {matches.map(getLabel).join(', ')}.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.alertCard, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
      <Feather name="check-circle" size={22} color={colors.success} />
      <View style={styles.alertCopy}>
        <Text style={[styles.alertTitle, { color: colors.foreground }]}>No matching allergens detected</Text>
        <Text style={[styles.alertBody, { color: colors.mutedForeground }]}>
          No allergens matching your profile were detected in the available product data.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  promptCard: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  promptIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  promptTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    marginTop: 2,
  },
  promptBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  promptActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
  },
  smallPrimaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  smallPrimaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  textButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  textButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  alertCard: {
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  alertCopy: {
    flex: 1,
    gap: 4,
  },
  alertTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  alertBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
});