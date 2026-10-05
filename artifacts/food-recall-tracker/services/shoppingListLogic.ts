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

export const SHOPPING_LIST_CHECK_TTL_MS = 60 * 60 * 1000;

export type ShoppingListRecallStatus = 'active' | 'clear' | 'unavailable';
export type ShoppingListAllergenStatus = 'match' | 'clear' | 'unavailable' | 'not-configured';
export type ShoppingListHealthStatus = 'conflicts' | 'clear' | 'unavailable' | 'not-configured';

export interface ShoppingListCheckResult {
  recallStatus: ShoppingListRecallStatus;
  recallCount: number;
  allergenStatus: ShoppingListAllergenStatus;
  allergenMatches: string[];
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
  const recallUnavailable = recallLookupFailed || !recallResult || recallResult.fdaUnavailable === true;
  const newsArticles = recallResult?.recentNews ?? [];
  const newsUnavailable = recallLookupFailed || !recallResult || recallResult.newsUnavailable === true;

  const ingredientText = `${product?.ingredients ?? ''} ${product?.allergens ?? ''}`.trim();
  const allergenEvaluation = evaluateAllergenMatches(
    profile.allergies,
    profile.customAllergy,
    term,
    ingredientText,
  );
  const hasAllergyProfile = profile.allergies.length > 0 || Boolean(profile.customAllergy.trim());
  const hasAllergenData = Boolean(product?.ingredients?.trim() || product?.allergens?.trim());
  const allergenVerdict = classifyAllergenVerdict({
    matches: allergenEvaluation.matches,
    dataAvailable: hasAllergenData,
    hasProfile: hasAllergyProfile,
    severe: profile.severity === 'severe',
  });

  const hasHealthProfile =
    profile.healthConsentGiven &&
    (profile.healthConditions.length > 0 || profile.dietaryPreferences.length > 0);
  const healthSignals = nutritionSignals(
    product ?? null,
    profile.healthConditions,
    profile.dietaryPreferences,
  );
  const healthConflicts = hasHealthProfile
    ? buildConflicts(product ?? null, profile.healthConditions, profile.dietaryPreferences, term)
    : [];
  const healthDataUnavailable =
    !hasHealthProfile ||
    shouldUseGenericLabelCheck(product ?? null, productLookupFailed, healthSignals);

  return {
    recallStatus: recallUnavailable ? 'unavailable' : recallCount > 0 ? 'active' : 'clear',
    recallCount,
    allergenStatus:
      allergenVerdict === 'allergen-alert' || allergenVerdict === 'severe-allergen-alert'
        ? 'match'
        : allergenVerdict === 'no-matching-allergens'
          ? 'clear'
          : allergenVerdict === 'allergen-data-unavailable'
            ? 'unavailable'
            : 'not-configured',
    allergenMatches: allergenEvaluation.matches,
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
) {
  if (!lastCheckedAt) return true;
  const checkedAt = Date.parse(lastCheckedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt >= SHOPPING_LIST_CHECK_TTL_MS;
}

function urgencyRank(item: Pick<ShoppingListItem, 'last_check_result'>) {
  const result = item.last_check_result;
  if (!result) return 4;
  if (result.recallStatus === 'active') return 0;
  if (result.allergenStatus === 'match') return 1;
  if (result.healthStatus === 'conflicts') return 2;
  if (result.newsArticleCount > 0) return 3;
  if (
    result.recallStatus === 'unavailable' ||
    result.allergenStatus === 'unavailable' ||
    result.healthStatus === 'unavailable'
  ) {
    return 4;
  }
  return 5;
}

export function sortShoppingListItems(items: ShoppingListItem[]) {
  return [...items].sort((first, second) => {
    if (first.is_checked !== second.is_checked) return first.is_checked ? 1 : -1;
    const urgencyDifference = urgencyRank(first) - urgencyRank(second);
    if (urgencyDifference !== 0) return urgencyDifference;
    return Date.parse(second.added_at) - Date.parse(first.added_at);
  });
}

export function summarizeShoppingList(items: ShoppingListItem[]) {
  return items.reduce(
    (summary, item) => {
      const result = item.last_check_result;
      if (!result) return summary;
      if (result.recallStatus === 'active') summary.activeRecallItems += 1;
      if (result.allergenStatus === 'match') summary.allergenMatchItems += 1;
      if (result.healthStatus === 'conflicts') summary.healthConflictItems += 1;
      if (result.newsArticleCount > 0) summary.newsItems += 1;
      return summary;
    },
    {
      activeRecallItems: 0,
      allergenMatchItems: 0,
      healthConflictItems: 0,
      newsItems: 0,
    },
  );
}
