import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFdaRecalls, getFsisRecalls } from '@workspace/api-client-react';
import type {
  FoodRecall,
  OpenFoodFactsProduct,
  RecallSearchResult,
} from '@/types/recall';
import { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';

export { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';

const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v3/product/';
const FDA_NOTICES_URL =
  'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';
const CACHE_PREFIX = '@food-recall-tracker/recalls/';
const CACHE_INDEX_KEY = '@food-recall-tracker/recent-searches';
const MAX_CACHED_SEARCHES = 8;

interface CachedSearch {
  recalls: FoodRecall[];
  lastUpdated: string;
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

function toRecall(record: Awaited<ReturnType<typeof getFdaRecalls>>['results'][number]): FoodRecall {
  return {
    recallNumber: record.recallNumber,
    productDescription: record.productDescription,
    reasonForRecall: record.reasonForRecall,
    recallingFirm: record.recallingFirm,
    recallDate: record.recallDate,
    classification: record.classification,
    status: record.status,
    officialUrl: record.officialUrl || FDA_NOTICES_URL,
    source: 'FDA',
  };
}

function toFsisRecall(record: Awaited<ReturnType<typeof getFsisRecalls>>['recalls'][number]): FoodRecall {
  return {
    recallNumber: `fsis-${record.id}`,
    productDescription: record.productName,
    reasonForRecall: record.reason,
    recallingFirm: record.companyName,
    recallDate: record.date,
    classification: record.classification,
    status: record.recallType,
    officialUrl: record.officialUrl,
    source: 'USDA FSIS',
    summary: record.summary,
    recallType: record.recallType,
    relatedToOutbreak: record.relatedToOutbreak,
  };
}

function isActiveRecall(record: Awaited<ReturnType<typeof getFdaRecalls>>['results'][number]) {
  const status = record.status?.toLowerCase() ?? '';
  return !status.includes('terminated') && !status.includes('completed');
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
  if (/network request failed|failed to fetch|fetch failed|timeout/i.test(message)) {
    return 'FDA API is unreachable right now. Check your connection and try again.';
  }
  return 'FDA API returned an unexpected error. Please try again.';
}

async function readCachedSearch(term: string): Promise<CachedSearch | null> {
  try {
    const cached = await AsyncStorage.getItem(cacheKey(term));
    return cached ? (JSON.parse(cached) as CachedSearch) : null;
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
    const primaryQuery = buildOpenFdaSearchQuery(normalizedTerm);
    const primaryResult = await getFdaRecalls({ search: primaryQuery, limit: 20 });
    let endpointResults = primaryResult.results;
    if (endpointResults.length === 0) {
      const firstWord = normalizedTerm.split(' ')[0];
      const fallbackQuery = buildOpenFdaSearchQuery(firstWord);
      if (fallbackQuery && fallbackQuery !== primaryQuery) {
        endpointResults = (await getFdaRecalls({ search: fallbackQuery, limit: 20 })).results;
      }
    }
    const seenRecallKeys = new Set<string>();
    const fdaRecalls = endpointResults
      .filter(isActiveRecall)
      .map(toRecall)
      .filter((recall) => {
        const key = recall.recallNumber ?? [
          recall.productDescription,
          recall.recallingFirm,
          recall.recallDate,
        ].join('|');
        if (seenRecallKeys.has(key)) return false;
        seenRecallKeys.add(key);
        return true;
      });
    let fsisRecalls: FoodRecall[] = [];
    try {
      const fsisResult = await getFsisRecalls();
      const searchNeedle = normalizedTerm.toLowerCase();
      fsisRecalls = fsisResult.recalls
        .filter(
          (record) =>
            record.productName.toLowerCase().includes(searchNeedle) ||
            record.summary.toLowerCase().includes(searchNeedle),
        )
        .map(toFsisRecall);
    } catch {
      // FSIS is an additive source. FDA results remain available if its proxy is down.
    }
    const recalls = [...fdaRecalls, ...fsisRecalls];
    const freshResult: CachedSearch = {
      recalls,
      lastUpdated: new Date().toISOString(),
    };
    await saveSearch(normalizedTerm, freshResult);
    return { ...freshResult, fromCache: false };
  } catch (error) {
    if (cached) {
      return { ...cached, fromCache: true };
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
