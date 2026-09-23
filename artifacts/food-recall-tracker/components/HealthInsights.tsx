import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { searchOpenFoodFactsProduct } from '@/services/openFoodFacts';
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

interface Conflict {
  label: string;
  detail: string;
}

interface HealthDietInsightsProps {
  productText: string;
  product?: OpenFoodFactsProduct;
  colors?: ReturnType<typeof useColors>;
}

const DAIRY_TERMS = ['milk', 'cheese', 'butter', 'cream', 'whey', 'casein', 'lactose', 'yogurt'];
const MEAT_TERMS = ['beef', 'pork', 'chicken', 'turkey', 'ham', 'bacon', 'meat', 'fish', 'chicken', 'gelatin', 'lard', 'anchovy', 'tuna'];
const ANIMAL_TERMS = [...MEAT_TERMS, ...DAIRY_TERMS, 'egg', 'honey', 'animal'];
const NUT_TERMS = ['nut', 'peanut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut'];
const SPICY_TERMS = ['chili', 'chilli', 'jalapeno', 'pepper', 'cayenne', 'hot sauce', 'sriracha', 'spicy'];
const HALAL_KOSHER_TERMS = ['pork', 'bacon', 'ham', 'lard', 'alcohol', 'wine', 'beer', 'gelatin'];

function labelsFor(ids: string[], options: readonly { id: string; label: string }[]) {
  return ids.map((id) => options.find((option) => option.id === id)?.label ?? id);
}

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function profileSummary(profile: { healthConditions: string[]; dietaryPreferences: string[] }) {
  return labelsFor(profile.healthConditions, HEALTH_CONDITION_OPTIONS)
    .concat(labelsFor(profile.dietaryPreferences, DIETARY_PREFERENCE_OPTIONS))
    .join(', ');
}

function ingredientText(product: OpenFoodFactsProduct | null) {
  return `${product?.ingredients ?? ''} ${product?.allergens ?? ''}`
    .toLowerCase()
    .replace(/gluten[- ]free/g, '');
}

function nutritionSignals(
  product: OpenFoodFactsProduct | null,
  healthConditions: string[],
  dietaryPreferences: string[],
) {
  const nutrition = product?.nutrition;
  const ingredients = ingredientText(product);
  const signals: boolean[] = [];

  if (healthConditions.some((condition) => condition.startsWith('diabetes-'))) signals.push(nutrition?.sugars100g !== undefined);
  if (healthConditions.includes('hypertension') || dietaryPreferences.includes('low-sodium')) signals.push(nutrition?.sodium100g !== undefined);
  if (healthConditions.includes('high-cholesterol') || healthConditions.includes('heart-disease')) signals.push(nutrition?.saturatedFat100g !== undefined);
  if (healthConditions.includes('celiac-disease') || dietaryPreferences.includes('gluten-free')) signals.push(Boolean(ingredients));
  if (healthConditions.includes('kidney-disease')) signals.push(nutrition?.sodium100g !== undefined || nutrition?.potassium100g !== undefined);
  if (healthConditions.includes('crohns-disease') || healthConditions.includes('ibs')) {
    signals.push(Boolean(ingredients) || nutrition?.fiber100g !== undefined);
  }
  if (dietaryPreferences.includes('keto') || dietaryPreferences.includes('low-carb')) signals.push(nutrition?.carbohydrates100g !== undefined);
  if (dietaryPreferences.includes('low-sugar')) signals.push(nutrition?.sugars100g !== undefined);
  if (dietaryPreferences.includes('low-fat')) signals.push(nutrition?.fat100g !== undefined);
  if (dietaryPreferences.some((preference) => ['vegan', 'vegetarian', 'nut-free', 'dairy-free', 'halal', 'kosher'].includes(preference))) {
    signals.push(Boolean(ingredients));
  }

  return {
    hasComparableData: signals.some(Boolean),
    hasMissingData: signals.some((signal) => !signal),
  };
}

function buildConflicts(
  product: OpenFoodFactsProduct,
  healthConditions: string[],
  dietaryPreferences: string[],
) {
  const nutrition: OpenFoodFactsNutrition = product.nutrition ?? {};
  const ingredients = ingredientText(product);
  const conflicts: Conflict[] = [];

  if (
    healthConditions.some((condition) => condition.startsWith('diabetes-')) &&
    nutrition.sugars100g !== undefined &&
    nutrition.sugars100g > 10
  ) {
    conflicts.push({
      label: 'Diabetes',
      detail: `Contains ${formatNumber(nutrition.sugars100g)}g sugar per 100g (high)`,
    });
  }

  if (
    (healthConditions.includes('hypertension') || dietaryPreferences.includes('low-sodium')) &&
    nutrition.sodium100g !== undefined &&
    nutrition.sodium100g > 300
  ) {
    conflicts.push({
      label: healthConditions.includes('hypertension') ? 'Hypertension' : 'Low-Sodium',
      detail: `Contains ${formatNumber(nutrition.sodium100g)}mg sodium per 100g (high)`,
    });
  }

  if (
    (healthConditions.includes('high-cholesterol') || healthConditions.includes('heart-disease')) &&
    nutrition.saturatedFat100g !== undefined &&
    nutrition.saturatedFat100g > 5
  ) {
    conflicts.push({
      label: healthConditions.includes('high-cholesterol') ? 'High Cholesterol' : 'Heart Disease',
      detail: `Contains ${formatNumber(nutrition.saturatedFat100g)}g saturated fat per 100g (high)`,
    });
  }

  if (
    (healthConditions.includes('celiac-disease') || dietaryPreferences.includes('gluten-free')) &&
    containsAny(ingredients, ['wheat', 'barley', 'rye', 'oat'])
  ) {
    conflicts.push({
      label: healthConditions.includes('celiac-disease') ? 'Celiac Disease' : 'Gluten-Free',
      detail: 'Ingredients mention wheat, barley, rye, or oats',
    });
  }

  if (healthConditions.includes('kidney-disease')) {
    if (nutrition.sodium100g !== undefined && nutrition.sodium100g > 200) {
      conflicts.push({
        label: 'Kidney Disease',
        detail: `Contains ${formatNumber(nutrition.sodium100g)}mg sodium per 100g (high)`,
      });
    } else if (nutrition.potassium100g !== undefined && nutrition.potassium100g > 350) {
      conflicts.push({
        label: 'Kidney Disease',
        detail: `Contains ${formatNumber(nutrition.potassium100g)}mg potassium per 100g (high)`,
      });
    }
  }

  if (healthConditions.includes('crohns-disease') || healthConditions.includes('ibs')) {
    const triggers: string[] = [];
    if (containsAny(ingredients, DAIRY_TERMS)) triggers.push('dairy');
    if (nutrition.fiber100g !== undefined && nutrition.fiber100g > 5) triggers.push('high fiber');
    if (containsAny(ingredients, SPICY_TERMS)) triggers.push('spicy ingredients');
    if (triggers.length > 0) {
      conflicts.push({
        label: healthConditions.includes('crohns-disease') ? "Crohn's Disease" : 'IBS',
        detail: `Contains ${triggers.join(', ')} (possible trigger)`,
      });
    }
  }

  if (
    (dietaryPreferences.includes('keto') || dietaryPreferences.includes('low-carb')) &&
    nutrition.carbohydrates100g !== undefined &&
    nutrition.carbohydrates100g > 10
  ) {
    conflicts.push({
      label: dietaryPreferences.includes('keto') ? 'Keto' : 'Low-Carb',
      detail: `Contains ${formatNumber(nutrition.carbohydrates100g)}g carbohydrates per 100g (high)`,
    });
  }

  if (
    dietaryPreferences.includes('low-sugar') &&
    nutrition.sugars100g !== undefined &&
    nutrition.sugars100g > 5
  ) {
    conflicts.push({
      label: 'Low-Sugar',
      detail: `Contains ${formatNumber(nutrition.sugars100g)}g sugar per 100g (high)`,
    });
  }

  if (
    dietaryPreferences.includes('low-fat') &&
    nutrition.fat100g !== undefined &&
    nutrition.fat100g > 10
  ) {
    conflicts.push({
      label: 'Low-Fat',
      detail: `Contains ${formatNumber(nutrition.fat100g)}g fat per 100g (high)`,
    });
  }

  if (dietaryPreferences.includes('vegan') && containsAny(ingredients, ANIMAL_TERMS)) {
    conflicts.push({
      label: 'Vegan',
      detail: 'Ingredients mention meat, dairy, eggs, or another animal-derived ingredient',
    });
  } else if (dietaryPreferences.includes('vegetarian') && containsAny(ingredients, MEAT_TERMS)) {
    conflicts.push({
      label: 'Vegetarian',
      detail: 'Ingredients mention meat, fish, or another animal-derived ingredient',
    });
  }

  if (
    dietaryPreferences.includes('nut-free') &&
    (containsAny((product.allergens ?? '').toLowerCase(), NUT_TERMS) || containsAny(ingredients, NUT_TERMS))
  ) {
    conflicts.push({
      label: 'Nut-Free',
      detail: 'Allergens or ingredients mention nuts',
    });
  }

  if (
    dietaryPreferences.includes('dairy-free') &&
    (containsAny((product.allergens ?? '').toLowerCase(), ['milk', 'dairy']) || containsAny(ingredients, DAIRY_TERMS))
  ) {
    conflicts.push({
      label: 'Dairy-Free',
      detail: 'Allergens or ingredients mention milk or dairy',
    });
  }

  if (
    (dietaryPreferences.includes('halal') || dietaryPreferences.includes('kosher')) &&
    containsAny(ingredients, HALAL_KOSHER_TERMS)
  ) {
    conflicts.push({
      label: dietaryPreferences.includes('halal') ? 'Halal' : 'Kosher',
      detail: 'Ingredients mention pork, alcohol, gelatin, or another item requiring certification review',
    });
  }

  return conflicts;
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
  const showGeneric = lookupFailed || !lookupProduct || !evaluation.hasComparableData || evaluation.hasMissingData;
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