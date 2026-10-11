import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { classifyAllergenVerdict, evaluateAllergenMatches } from '@/services/allergenMatching';

export const ALLERGEN_OPTIONS = [
  { id: 'milk', label: 'Milk' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'fish', label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'tree-nuts', label: 'Tree Nuts' },
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'soy', label: 'Soy' },
  { id: 'sesame', label: 'Sesame' },
  { id: 'gluten', label: 'Gluten' },
  { id: 'corn', label: 'Corn' },
  { id: 'other', label: 'Other' },
] as const;

interface AllergenInsightsProps {
  productText: string;
  productName?: string;
  dataAvailable: boolean;
  source?: 'photo' | 'barcode' | 'search';
  colors?: ReturnType<typeof useColors>;
}

function getLabel(id: string) {
  return ALLERGEN_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

export function AllergenInsights({
  productText,
  productName = '',
  dataAvailable,
  source = 'search',
  colors: providedColors,
}: AllergenInsightsProps) {
  const fallbackColors = useColors();
  const colors = providedColors ?? fallbackColors;
  const router = useRouter();
  const { status, profile, guestPromptDismissed, dismissGuestPrompt } = useAuth();
  const evaluation = profile
    ? evaluateAllergenMatches(profile.allergies, profile.customAllergy, productName, productText)
    : null;
  const matches = evaluation?.matches ?? [];
  const hasAllergyProfile = status === 'authenticated' && Boolean(profile?.allergies.length);
  const isSevere = profile?.severity === 'severe';
  const nameFallbackCount = evaluation?.nameOnlyMatches.length ?? 0;
  const allergenSignature = matches.join('|');
  const finalVerdict = classifyAllergenVerdict({
    matches,
    dataAvailable,
    hasProfile: hasAllergyProfile,
    severe: isSevere,
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (nameFallbackCount > 0) {
      console.info('[Allergen] Name-based fallback triggered', {
        source,
        productName,
        fallbackMatchCount: nameFallbackCount,
        ingredientOrAllergenDataAvailable: dataAvailable,
      });
    }
    console.info('[Allergen] Final product verdict', {
      source,
      productName,
      result: finalVerdict,
      matchedAllergenCount: matches.length,
      nameBasedFallbackTriggered: nameFallbackCount > 0,
      ingredientOrAllergenDataAvailable: dataAvailable,
    });
  }, [
    allergenSignature,
    dataAvailable,
    finalVerdict,
    matches.length,
    nameFallbackCount,
    productName,
    source,
    status,
  ]);

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
          Create a profile to compare product information against your allergies. Recall searches still work fully as a guest.
        </Text>
        <View style={styles.promptActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-up')}
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

  if (matches.length > 0) {
    const nameFallbackNote = evaluation?.nameOnlyMatches.length
      ? dataAvailable
        ? 'Based on the product name; confirm against the package label. '
        : 'Based on the product name — ingredient data not available. '
      : '';
    return (
      <View
        style={[
          styles.alertCard,
          isSevere
            ? styles.severeAlert
            : { backgroundColor: colors.dangerSoft, borderColor: colors.destructive },
        ]}
      >
        <Feather
          name="alert-triangle"
          size={isSevere ? 26 : 22}
          color={isSevere ? '#ffffff' : colors.destructive}
        />
        <View style={styles.alertCopy}>
          <Text
            style={[
              styles.alertTitle,
              { color: isSevere ? '#ffffff' : colors.foreground },
              isSevere ? styles.severeText : null,
            ]}
          >
            {isSevere ? 'Severe Allergen Alert' : 'Allergen Alert'}
          </Text>
          <Text
            style={[
              styles.alertBody,
              { color: isSevere ? '#ffffff' : colors.mutedForeground },
              isSevere ? styles.severeText : null,
            ]}
          >
            {nameFallbackNote}
            {profile.displayName.trim() || 'You'} — Contains your allergens: {matches.map(getLabel).join(', ')}. Review the product label and official information carefully.
          </Text>
        </View>
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
    justifyContent: 'center',
    minHeight: 40,
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
  severeAlert: {
    backgroundColor: '#991b1b',
    borderColor: '#7f1d1d',
  },
  severeText: {
    fontFamily: 'Inter_700Bold',
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