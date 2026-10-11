import type { UserProfile } from '@/context/AuthContext';
import {
  classifyAllergenVerdict,
  evaluateAllergenMatches,
} from './allergenMatching.ts';
import {
  buildConflicts,
  nutritionSignals,
  shouldUseGenericLabelCheck,
  type Conflict,
} from './nutritionInsights.ts';
import type {
  OpenFoodFactsProduct,
  RecallNewsArticle,
  RecallSearchResult,
} from '@/types/recall';
import {
  areEquivalentSingleIngredientFoodNames,
  getSingleIngredientFoodCategory,
  isSingleIngredientFoodName,
} from './singleIngredientFoods.ts';

export const SHOPPING_LIST_CHECK_TTL_MS = 60 * 60 * 1000;
export const SHOPPING_LIST_CHECK_VERSION = 2;

export type ShoppingListRecallStatus =
  | 'active'
  | 'possibly-related'
  | 'clear'
  | 'unavailable';
export type ShoppingListAllergenStatus =
  | 'match'
  | 'possible-match'
  | 'clear'
  | 'unavailable'
  | 'not-configured';
export type ShoppingListAllergenEvidence = 'ingredient-data' | 'product-name';
export type ShoppingListHealthStatus = 'conflicts' | 'clear' | 'unavailable' | 'not-configured';

export interface ShoppingListCheckResult {
  recallStatus: ShoppingListRecallStatus;
  recallCount: number;
  allergenStatus: ShoppingListAllergenStatus;
  allergenMatches: string[];
  allergenEvidence?: ShoppingListAllergenEvidence;
  allergenNotice?: string;
  checkVersion?: number;
  healthStatus: ShoppingListHealthStatus;
  healthConflicts: Conflict[];
  newsArticleCount: number;
  newsArticles: RecallNewsArticle[];
  newsUnavailable: boolean;
}

export interface ShoppingListItem {
  id: string;
  user_id: string;
  term: string;
  added_at: string;
  last_checked_at: string | null;
  last_check_result: ShoppingListCheckResult | null;
  is_checked: boolean;
}

export interface FrequentItem extends ShoppingListItem {
  last_used_at: string;
}

type RecallCheckData = Pick<
  RecallSearchResult,
  'recalls' | 'recentNews' | 'newsUnavailable' | 'fdaUnavailable'
>;

export interface ShoppingListProfile {
  allergies: UserProfile['allergies'];
  customAllergy: UserProfile['customAllergy'];
  severity: UserProfile['severity'];
  healthConditions: UserProfile['healthConditions'];
  dietaryPreferences: UserProfile['dietaryPreferences'];
  healthConsentGiven: UserProfile['healthConsentGiven'];
}

export function buildShoppingListCheckResult(
  term: string,
  profile: ShoppingListProfile,
  {
    recallResult,
    product,
    recallLookupFailed = false,
    productLookupFailed = false,
  }: {
    recallResult?: RecallCheckData;
    product?: OpenFoodFactsProduct | null;
    recallLookupFailed?: boolean;
    productLookupFailed?: boolean;
  },
): ShoppingListCheckResult {
  const recallCount = recallResult?.recalls.length ?? 0;
  const exactRecallCount =
    recallResult?.recalls.filter((recall) => recall.searchMatch !== 'word-fallback').length ?? 0;
  const recallUnavailable = recallLookupFailed || !recallResult || recallResult.fdaUnavailable === true;
  const newsArticles = recallResult?.recentNews ?? [];
  const newsUnavailable = recallLookupFailed || !recallResult || recallResult.newsUnavailable === true;

  const singleIngredientCategory = getSingleIngredientFoodCategory(term);
  const matchedProduct =
    !singleIngredientCategory ||
    (product && areEquivalentSingleIngredientFoodNames(term, product.name))
      ? product ?? null
      : null;
  const ingredientText =
    `${matchedProduct?.ingredients ?? ''} ${matchedProduct?.allergens ?? ''}`.trim();
  const allergenEvaluation = evaluateAllergenMatches(
    profile.allergies,
    profile.customAllergy,
    term,
    ingredientText,
  );
  const hasAllergyProfile = profile.allergies.length > 0 || Boolean(profile.customAllergy.trim());
  const hasAllergenData = Boolean(
    matchedProduct?.ingredients?.trim() || matchedProduct?.allergens?.trim(),
  );
  const allergenMatches = hasAllergenData
    ? allergenEvaluation.productDataMatches
    : allergenEvaluation.nameMatches;
  const allergenVerdict = classifyAllergenVerdict({
    matches: allergenMatches,
    dataAvailable: hasAllergenData,
    hasProfile: hasAllergyProfile,
    severe: profile.severity === 'severe',
  });
  const allergenStatus: ShoppingListAllergenStatus =
    allergenVerdict === 'allergen-alert' || allergenVerdict === 'severe-allergen-alert'
      ? hasAllergenData
        ? 'match'
        : 'possible-match'
      : allergenVerdict === 'no-matching-allergens'
        ? 'clear'
        : allergenVerdict === 'allergen-data-unavailable'
          ? 'unavailable'
          : 'not-configured';
  const allergenEvidence: ShoppingListAllergenEvidence | undefined = hasAllergenData
    ? 'ingredient-data'
    : allergenMatches.length > 0
      ? 'product-name'
      : undefined;
  const allergenNotice =
    allergenStatus === 'unavailable' && isSingleIngredientFoodName(term)
      ? 'Ingredient data not available — verify the package label.'
      : undefined;

  const hasHealthProfile =
    profile.healthConsentGiven &&
    (profile.healthConditions.length > 0 || profile.dietaryPreferences.length > 0);
  const healthProduct =
    singleIngredientCategory === 'raw-meat' && matchedProduct
      ? { ...matchedProduct, nutrition: {} }
      : matchedProduct;
  const healthSignals = nutritionSignals(
    healthProduct,
    profile.healthConditions,
    profile.dietaryPreferences,
  );
  const healthConflicts = hasHealthProfile
    ? buildConflicts(healthProduct, profile.healthConditions, profile.dietaryPreferences, term)
    : [];
  const healthDataUnavailable =
    !hasHealthProfile ||
    shouldUseGenericLabelCheck(healthProduct, productLookupFailed, healthSignals);

  return {
    recallStatus: recallUnavailable
      ? 'unavailable'
      : exactRecallCount > 0
        ? 'active'
        : recallCount > 0
          ? 'possibly-related'
          : 'clear',
    recallCount,
    allergenStatus,
    allergenMatches,
    allergenEvidence,
    allergenNotice,
    checkVersion: SHOPPING_LIST_CHECK_VERSION,
    healthStatus: !hasHealthProfile
      ? 'not-configured'
      : healthConflicts.length > 0
        ? 'conflicts'
        : healthDataUnavailable
          ? 'unavailable'
          : 'clear',
    healthConflicts,
    newsArticleCount: newsArticles.length,
    newsArticles,
    newsUnavailable,
  };
}

export function isShoppingListCheckStale(
  lastCheckedAt: string | null,
  now = Date.now(),
  checkVersion?: number | null,
) {
  if (!lastCheckedAt) return true;
  if (checkVersion !== undefined && checkVersion !== SHOPPING_LIST_CHECK_VERSION) return true;
  const checkedAt = Date.parse(lastCheckedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt >= SHOPPING_LIST_CHECK_TTL_MS;
}

function urgencyRank(item: Pick<ShoppingListItem, 'last_check_result'>) {
  const result = item.last_check_result;
  if (!result) return 5;
  if (result.recallStatus === 'active') return 0;
  if (result.recallStatus === 'possibly-related') return 1;
  if (result.allergenStatus === 'match' && result.allergenEvidence === 'ingredient-data') return 2;
  if (result.healthStatus === 'conflicts') return 3;
  if (
    result.allergenStatus === 'possible-match' ||
    (result.allergenStatus === 'match' && result.allergenEvidence !== 'ingredient-data')
  ) {
    return 4;
  }
  if (result.newsArticleCount > 0) return 5;
  if (
    result.recallStatus === 'unavailable' ||
    result.allergenStatus === 'unavailable' ||
    result.healthStatus === 'unavailable'
  ) {
    return 6;
  }
  return 7;
}

export function sortShoppingListItems(items: ShoppingListItem[]) {
  return [...items].sort((first, second) => {
    if (first.is_checked !== second.is_checked) return first.is_checked ? 1 : -1;
    const urgencyDifference = urgencyRank(first) - urgencyRank(second);
    if (urgencyDifference !== 0) return urgencyDifference;
    return Date.parse(second.added_at) - Date.parse(first.added_at);
  });
}

export function sortFrequentItems(items: FrequentItem[]) {
  return [...items].sort(
    (first, second) => Date.parse(second.added_at) - Date.parse(first.added_at),
  );
}

export function summarizeShoppingList(items: ShoppingListItem[]) {
  return items.reduce(
    (summary, item) => {
      const result = item.last_check_result;
      if (!result) return summary;
      if (result.recallStatus === 'active') summary.activeRecallItems += 1;
      if (result.recallStatus === 'possibly-related') summary.possiblyRelatedRecallItems += 1;
      if (result.allergenStatus === 'match' && result.allergenEvidence === 'ingredient-data') {
        summary.allergenMatchItems += 1;
      } else if (
        result.allergenStatus === 'possible-match' ||
        result.allergenStatus === 'match'
      ) {
        summary.possibleAllergenItems += 1;
      }
      if (result.healthStatus === 'conflicts') summary.healthConflictItems += 1;
      if (result.newsArticleCount > 0) summary.newsItems += 1;
      return summary;
    },
    {
      activeRecallItems: 0,
      possiblyRelatedRecallItems: 0,
      allergenMatchItems: 0,
      possibleAllergenItems: 0,
      healthConflictItems: 0,
      newsItems: 0,
    },
  );
}

function formatAllergenName(allergen: string) {
  return allergen
    .split(/[-\s]+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getShoppingListAllergenLabel(
  result: Pick<
    ShoppingListCheckResult,
    'allergenStatus' | 'allergenMatches' | 'allergenEvidence' | 'allergenNotice'
  > | null,
  displayName = '',
) {
  const prefix = displayName.trim() ? `${displayName.trim()} — ` : '';
  if (!result) return 'Allergen check pending';
  if (result.allergenNotice) return result.allergenNotice;
  if (result.allergenStatus === 'match' && result.allergenEvidence === 'ingredient-data') {
    return `${prefix}Contains your allergens: ${result.allergenMatches.map(formatAllergenName).join(', ')}`;
  }
  if (
    result.allergenStatus === 'possible-match' ||
    (result.allergenStatus === 'match' && result.allergenEvidence !== 'ingredient-data')
  ) {
    const matches = result.allergenMatches.map(formatAllergenName).join(', ');
    const detail = matches ? `: ${matches}` : '';
    return `${prefix}Possible allergen match based on product name${detail}. Verify the package label — this is not a confirmed match.`;
  }
  if (result.allergenStatus === 'clear') return 'No allergen matches';
  if (result.allergenStatus === 'unavailable') return 'Allergen data unavailable';
  return 'Allergy profile not set up';
}
