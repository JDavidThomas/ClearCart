import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  FoodRecall,
  OpenFoodFactsProduct,
  RecallSearchResult,
} from '@/types/recall';
import { searchFdaRecalls } from './fdaRecalls';
import { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';
import { getRecallRelevanceNotice, rankAndFilterRecalls } from './recallRelevance';

export { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';

const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v3/product/';
const CACHE_PREFIX = '@food-recall-tracker/recalls/';
const CACHE_INDEX_KEY = '@food-recall-tracker/recent-searches';
const MAX_CACHED_SEARCHES = 8;

interface CachedSearch {
  recalls: FoodRecall[];
  lastUpdated: string;
  relevanceNotice?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCachedSearch(value: unknown): CachedSearch | null {
  let candidate: unknown = value;

  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(candidate)) return null;

    if (Array.isArray(candidate.recalls)) {
      const lastUpdated =
        typeof candidate.lastUpdated === 'string' && candidate.lastUpdated.trim()
          ? candidate.lastUpdated
          : typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
            ? candidate.updatedAt
            : null;

      if (!lastUpdated) return null;

      return {
        recalls: candidate.recalls as FoodRecall[],
        lastUpdated,
        relevanceNotice:
          typeof candidate.relevanceNotice === 'string' ? candidate.relevanceNotice : undefined,
      };
    }

    candidate = candidate.data ?? candidate.result;
  }

  return null;
}

interface OpenFoodFactsResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    ingredients_text?: string;
  };
}

function cacheKey(term: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(term.toLowerCase())}`;
}

function messageFromApiError(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

function formatRecallSearchError(error: unknown) {
  const apiMessage = messageFromApiError(error);
  if (apiMessage?.includes('FDA API is unreachable')) {
    return 'FDA API is unreachable right now. Check your connection and try again.';
  }
  if (apiMessage?.includes('FDA API returned an error')) {
    return apiMessage;
  }
  if (apiMessage?.includes('FDA API configuration')) {
    return apiMessage;
  }

  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('FDA API ')) {
    return message;
  }
  if (/network request failed|failed to fetch|fetch failed|timeout/i.test(message)) {
    return 'FDA API is unreachable right now. Check your connection and try again.';
  }
  return 'FDA API returned an unexpected error. Please try again.';
}

async function readCachedSearch(term: string): Promise<CachedSearch | null> {
  try {
    const cached = await AsyncStorage.getItem(cacheKey(term));
    return cached ? normalizeCachedSearch(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
}

async function saveSearch(term: string, value: CachedSearch) {
  try {
    const indexValue = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    const previousTerms = indexValue ? (JSON.parse(indexValue) as string[]) : [];
    const nextTerms = [
      term.toLowerCase(),
      ...previousTerms.filter((item) => item !== term.toLowerCase()),
    ].slice(0, MAX_CACHED_SEARCHES);

    await Promise.all([
      AsyncStorage.setItem(cacheKey(term), JSON.stringify(value)),
      AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(nextTerms)),
    ]);
  } catch {
    // A cache failure should never stop a live recall search from completing.
  }
}

/**
 * Searches both openFDA food and drug enforcement records, then falls back to
 * the most recent local result if the device is offline or the public API is
 * temporarily unavailable.
 */
export async function searchFoodRecalls(term: string): Promise<RecallSearchResult> {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) {
    return { recalls: [], lastUpdated: new Date().toISOString(), fromCache: false };
  }
  const cached = await readCachedSearch(normalizedTerm);

  try {
    // FDA searches are intentionally direct so an unavailable Replit API server
    // cannot block the primary recall experience. USDA/FSIS can be added later
    // as an optional source without becoming a prerequisite for FDA results.
    const recalls = await searchFdaRecalls(normalizedTerm);
    const freshResult: CachedSearch = {
      recalls,
      lastUpdated: new Date().toISOString(),
      relevanceNotice: getRecallRelevanceNotice(normalizedTerm, recalls),
    };
    await saveSearch(normalizedTerm, freshResult);
    return { ...freshResult, fromCache: false };
  } catch (error) {
    if (cached) {
      const recalls = rankAndFilterRecalls(cached.recalls, normalizedTerm);
      return {
        ...cached,
        recalls,
        relevanceNotice: getRecallRelevanceNotice(normalizedTerm, recalls),
        fromCache: true,
      };
    }

    throw new Error(formatRecallSearchError(error));
  }
}

/**
 * Finds the consumer-facing product name and brand for a scanned barcode.
 * Open Food Facts returns status 0 when the barcode is not in its database.
 */
export async function lookupOpenFoodFactsProduct(
  barcode: string,
): Promise<OpenFoodFactsProduct | null> {
  const response = await fetch(
    `${OPEN_FOOD_FACTS_URL}${encodeURIComponent(barcode)}.json`,
  );

  if (!response.ok) {
    throw new Error('The product database is unavailable right now.');
  }

  const payload = (await response.json()) as OpenFoodFactsResponse;
  const name =
    payload.product?.product_name?.trim() ||
    payload.product?.product_name_en?.trim();

  if (payload.status !== 1 || !name) {
    return null;
  }

  return {
    barcode,
    name,
    brand: payload.product?.brands?.split(',')[0]?.trim() || 'Brand not listed',
    ingredients: payload.product?.ingredients_text?.trim(),
  };
}
