import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { searchOpenFoodFactsProduct } from '@/services/openFoodFacts';
import {
  buildConflicts,
  nutritionSignals,
  shouldUseGenericLabelCheck,
  type Conflict,
} from '@/services/nutritionInsights';
import type { OpenFoodFactsNutrition, OpenFoodFactsProduct } from '@/types/recall';

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

interface HealthDietInsightsProps {
  productText: string;
  product?: OpenFoodFactsProduct;
  requireNutritionData?: boolean;
  colors?: ReturnType<typeof useColors>;
}

function labelsFor(ids: string[], options: readonly { id: string; label: string }[]) {
  return ids.map((id) => options.find((option) => option.id === id)?.label ?? id);
}

function profileSummary(profile: { healthConditions: string[]; dietaryPreferences: string[] }) {
  return labelsFor(profile.healthConditions, HEALTH_CONDITION_OPTIONS)
    .concat(labelsFor(profile.dietaryPreferences, DIETARY_PREFERENCE_OPTIONS))
    .join(', ');
}

function NutritionMeta({
  nutrition,
  colors,
}: {
  nutrition?: OpenFoodFactsNutrition;
  colors: ReturnType<typeof useColors>;
}) {
  if (!nutrition?.nutriScoreGrade || !/^[a-e]$/i.test(nutrition.nutriScoreGrade)) return null;
  return (
    <View style={[styles.nutriScore, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.nutriScoreLabel, { color: colors.mutedForeground }]}>Nutri-Score</Text>
      <Text style={[styles.nutriScoreValue, { color: colors.foreground }]}>{nutrition.nutriScoreGrade.toUpperCase()}</Text>
    </View>
  );
}

export function HealthDietInsights({
  productText,
  product,
  requireNutritionData = false,
  colors: providedColors,
}: HealthDietInsightsProps) {
  const fallbackColors = useColors();
  const colors = providedColors ?? fallbackColors;
  const { status, profile } = useAuth();
  const [lookupProduct, setLookupProduct] = useState<OpenFoodFactsProduct | null>(product ?? null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (product) {
      setLookupProduct(product);
      setLookupFailed(false);
      setLookupLoading(false);
      return () => {
        mounted = false;
      };
    }

    const searchTerm = productText.trim();
    if (!searchTerm) {
      setLookupProduct(null);
      setLookupFailed(false);
      setLookupLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLookupLoading(true);
    setLookupFailed(false);
    void searchOpenFoodFactsProduct(searchTerm)
      .then((nextProduct) => {
        if (mounted) setLookupProduct(nextProduct);
      })
      .catch(() => {
        if (mounted) {
          setLookupProduct(null);
          setLookupFailed(true);
        }
      })
      .finally(() => {
        if (mounted) setLookupLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [product, productText]);

  const evaluation = useMemo(() => {
    if (!profile || !lookupProduct) return { conflicts: [] as Conflict[], hasComparableData: false, hasMissingData: true };
    const signals = nutritionSignals(lookupProduct, profile.healthConditions, profile.dietaryPreferences);
    return {
      conflicts: buildConflicts(lookupProduct, profile.healthConditions, profile.dietaryPreferences),
      ...signals,
    };
  }, [lookupProduct, profile]);

  if (
    status !== 'authenticated' ||
    !profile?.healthConsentGiven ||
    (profile.healthConditions.length === 0 && profile.dietaryPreferences.length === 0)
  ) {
    return null;
  }

  if (lookupLoading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <ActivityIndicator color={colors.warning} size="small" />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Health &amp; Diet Notes</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Checking available nutrition data…</Text>
        </View>
      </View>
    );
  }

  const summary = profileSummary(profile);
  const hasNutritionData = Boolean(
    lookupProduct &&
      (Object.values(lookupProduct.nutrition ?? {}).some((value) => value !== undefined) ||
        lookupProduct.ingredients ||
        lookupProduct.allergens),
  );
  if (requireNutritionData && !hasNutritionData) return null;

  const showGeneric = shouldUseGenericLabelCheck(lookupProduct, lookupFailed, evaluation);
  const nutrition = lookupProduct?.nutrition;

  if (showGeneric) {
    return (
      <View style={[styles.card, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Feather name="info" size={22} color={colors.warning} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Health &amp; Diet Notes</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            We don&apos;t have full nutrition data for this product. Check the label for {summary}.
          </Text>
          <NutritionMeta colors={colors} nutrition={nutrition} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            This is based on available nutrition data and your profile. Not medical advice.
          </Text>
        </View>
      </View>
    );
  }

  if (evaluation.conflicts.length > 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Feather name="alert-circle" size={22} color={colors.warning} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Health &amp; Diet Conflicts</Text>
          <View style={styles.conflictList}>
            {evaluation.conflicts.map((conflict) => (
              <Text key={`${conflict.label}-${conflict.detail}`} style={[styles.conflict, { color: colors.foreground }]}>
                • {conflict.label}: {conflict.detail}
              </Text>
            ))}
          </View>
          <NutritionMeta colors={colors} nutrition={nutrition} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            This is based on available nutrition data and your profile. Not medical advice.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
      <Feather name="check-circle" size={22} color={colors.success} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Health &amp; Diet Notes</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>No dietary conflicts detected based on your profile.</Text>
        <NutritionMeta colors={colors} nutrition={nutrition} />
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
          This is based on available nutrition data and your profile. Not medical advice.
        </Text>
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
    gap: 7,
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
  conflictList: {
    gap: 5,
  },
  conflict: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
  },
  disclaimerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
  nutriScore: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  nutriScoreLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  nutriScoreValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
});