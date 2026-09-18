import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FoodRecall, RecallSearchResult } from '@/types/recall';

const OPENFDA_URL = 'https://api.fda.gov/food/enforcement.json';
const FDA_NOTICES_URL =
  'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';
const CACHE_PREFIX = '@food-recall-tracker/recalls/';
const CACHE_INDEX_KEY = '@food-recall-tracker/recent-searches';
const MAX_CACHED_SEARCHES = 8;

interface CachedSearch {
  recalls: FoodRecall[];
  lastUpdated: string;
}

interface OpenFdaRecall {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  report_date?: string;
  classification?: string;
  status?: string;
  url?: string;
}

interface OpenFdaResponse {
  results?: OpenFdaRecall[];
}

function cacheKey(term: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(term.toLowerCase())}`;
}

function toRecall(record: OpenFdaRecall): FoodRecall {
  return {
    recallNumber: record.recall_number,
    productDescription: record.product_description?.trim() || 'Product description unavailable',
    reasonForRecall: record.reason_for_recall?.trim() || 'Reason not provided',
    recallingFirm: record.recalling_firm?.trim() || 'Recalling firm not provided',
    recallDate: record.report_date?.trim() || 'Date not provided',
    classification: record.classification?.trim() || 'Classification not provided',
    status: record.status,
    officialUrl: record.url?.trim() || FDA_NOTICES_URL,
  };
}

function isActiveRecall(record: OpenFdaRecall) {
  const status = record.status?.toLowerCase() ?? '';
  return !status.includes('terminated') && !status.includes('completed');
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
 * Searches openFDA and falls back to the most recent local result if the
 * device is offline or the public API is temporarily unavailable.
 */
export async function searchFoodRecalls(term: string): Promise<RecallSearchResult> {
  const normalizedTerm = term.trim();
  const cached = await readCachedSearch(normalizedTerm);

  try {
    const params = new URLSearchParams({
      search: `product_description:"${normalizedTerm}"`,
      limit: '20',
    });

    const response = await fetch(`${OPENFDA_URL}?${params.toString()}`);
    if (response.status === 404) {
      const emptyResult: CachedSearch = {
        recalls: [],
        lastUpdated: new Date().toISOString(),
      };
      await saveSearch(normalizedTerm, emptyResult);
      return { ...emptyResult, fromCache: false };
    }

    if (!response.ok) {
      throw new Error(`openFDA returned ${response.status}`);
    }

    const payload = (await response.json()) as OpenFdaResponse;
    const recalls = (payload.results ?? [])
      .filter(isActiveRecall)
      .map(toRecall);
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

    throw new Error(
      error instanceof Error && error.message.includes('Network request failed')
        ? 'Unable to connect. Check your internet connection and try again.'
        : 'We could not reach the recall database right now. Please try again.',
    );
  }
}
