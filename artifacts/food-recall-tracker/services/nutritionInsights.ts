import type { OpenFoodFactsNutrition, OpenFoodFactsProduct } from '@/types/recall';

export interface Conflict {
  label: string;
  detail: string;
}

const DAIRY_TERMS = ['milk', 'cheese', 'butter', 'cream', 'whey', 'casein', 'lactose', 'yogurt'];
const MEAT_TERMS = ['beef', 'pork', 'chicken', 'turkey', 'ham', 'bacon', 'meat', 'fish', 'chicken', 'gelatin', 'lard', 'anchovy', 'tuna'];
const ANIMAL_TERMS = [...MEAT_TERMS, ...DAIRY_TERMS, 'egg', 'honey', 'animal'];
const NUT_TERMS = ['nut', 'peanut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut'];
const SPICY_TERMS = ['chili', 'chilli', 'jalapeno', 'pepper', 'cayenne', 'hot sauce', 'sriracha', 'spicy'];
const HALAL_KOSHER_TERMS = ['pork', 'bacon', 'ham', 'lard', 'alcohol', 'wine', 'beer', 'gelatin'];

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function ingredientText(product: OpenFoodFactsProduct | null) {
  return `${product?.ingredients ?? ''} ${product?.allergens ?? ''}`
    .toLowerCase()
    .replace(/gluten[- ]free/g, '');
}

export function nutritionSignals(
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

export function shouldUseGenericLabelCheck(
  product: OpenFoodFactsProduct | null,
  lookupFailed: boolean,
  signals: ReturnType<typeof nutritionSignals>,
) {
  return lookupFailed || !product || !signals.hasComparableData || signals.hasMissingData;
}

export function buildConflicts(
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