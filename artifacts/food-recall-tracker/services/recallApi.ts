import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  FoodRecall,
  RecallSearchResult,
} from '@/types/recall';
import { searchFdaRecalls, type FdaRecallSearchOptions } from './fdaRecalls';
import { searchFsisRecalls } from './fsisRecalls';
import { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';
import {
  getRecallRelevanceNotice,
  rankAndFilterRecalls,
  splitRecallGroups,
} from './recallRelevance';
export {
  lookupOpenFoodFactsProduct,
  searchOpenFoodFactsProduct,
} from './openFoodFacts';

export { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';

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

function buildSearchResult(term: string, cached: CachedSearch, fromCache: boolean): RecallSearchResult {
  const rankedRecalls = rankAndFilterRecalls(cached.recalls, term);
  const groups = splitRecallGroups(term, rankedRecalls);

  return {
    recalls: groups.directRecalls,
    relatedRecalls: groups.relatedRecalls,
    lastUpdated: cached.lastUpdated,
    fromCache,
    relevanceNotice: getRecallRelevanceNotice(term, rankedRecalls),
    isProduceSearch: groups.isProduceSearch,
    produceItem: groups.produceItem,
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
  if (apiMessage?.includes('USDA FSIS')) {
    return 'USDA FSIS recall data is unavailable right now. Please try again.';
  }
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
 * Searches FDA enforcement data and official recall notices alongside recent
 * USDA FSIS recalls, then uses the most recent local result if sources fail.
 */
export async function searchFoodRecalls(
  term: string,
  options: FdaRecallSearchOptions = {},
): Promise<RecallSearchResult> {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) {
    return { recalls: [], lastUpdated: new Date().toISOString(), fromCache: false };
  }
  const cached = await readCachedSearch(normalizedTerm);

  try {
    const [fdaResult, fsisResult] = await Promise.allSettled([
      searchFdaRecalls(normalizedTerm, options),
      searchFsisRecalls(),
    ]);
    const successfulResults = [fdaResult, fsisResult].filter(
      (result): result is PromiseFulfilledResult<FoodRecall[]> => result.status === 'fulfilled',
    );
    const failedResults = [fdaResult, fsisResult].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (successfulResults.length === 0) {
      throw (
        failedResults[0]?.reason ??
        new Error('Recall data sources are unavailable.')
      );
    }

    const recalls = successfulResults.flatMap((result) => result.value);
    if (failedResults.length > 0 && rankAndFilterRecalls(recalls, normalizedTerm).length === 0) {
      throw failedResults[0].reason;
    }
    const freshResult: CachedSearch = {
      recalls,
      lastUpdated: new Date().toISOString(),
    };
    await saveSearch(normalizedTerm, freshResult);
    return buildSearchResult(normalizedTerm, freshResult, false);
  } catch (error) {
    if (cached) {
      return buildSearchResult(normalizedTerm, cached, true);
    }

    throw new Error(formatRecallSearchError(error));
  }
}
