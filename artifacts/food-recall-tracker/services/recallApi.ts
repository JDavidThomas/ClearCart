import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  FoodRecall,
  RecallSearchResult,
} from '@/types/recall';
import { searchFdaRecalls, type FdaRecallSearchOptions } from './fdaRecalls';
import { searchFsisRecalls } from './fsisRecalls';
import {
  buildOpenFdaSearchQuery,
  cleanRecallSearchTerm,
  isFsisRecallSearch,
} from './recallSearch';
import {
  getRecallRelevanceNotice,
  rankAndFilterRecalls,
  splitRecallGroups,
} from './recallRelevance';
import {
  isRecallSearchCacheFresh,
  RECALL_SEARCH_CACHE_TTL_MS,
} from './recallCache';
import { combineRecallSourceResults } from './recallSourceResults';
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
  sourceUnavailable?: 'fsis';
  fdaUnavailable?: boolean;
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
        sourceUnavailable:
          candidate.sourceUnavailable === 'fsis' ? 'fsis' : undefined,
        fdaUnavailable: candidate.fdaUnavailable === true ? true : undefined,
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
    sourceUnavailable: cached.sourceUnavailable,
    fdaUnavailable: cached.fdaUnavailable,
  };
}

function normalizeCacheOption(value?: string) {
  const normalized = value ? cleanRecallSearchTerm(value) : '';
  return /^(unknown|unclear|none|null)$/i.test(normalized) ? '' : normalized;
}

function cacheKey(
  term: string,
  options: FdaRecallSearchOptions,
  source: 'fda' | 'fda+fsis',
) {
  const brand = normalizeCacheOption(options.brand).toLowerCase();
  const productType = normalizeCacheOption(options.productType).toLowerCase();
  const optionIdentity = [brand, productType].filter(Boolean).join('|');
  const identity = [
    term.toLowerCase(),
    optionIdentity,
    source === 'fda+fsis' ? 'source:fda+fsis' : '',
  ]
    .filter(Boolean)
    .join('|');
  return `${CACHE_PREFIX}${encodeURIComponent(identity)}`;
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
  if (message.startsWith('USDA FSIS ')) {
    return message;
  }
  if (/network request failed|failed to fetch|fetch failed|timeout/i.test(message)) {
    return 'FDA API is unreachable right now. Check your connection and try again.';
  }
  return 'Recall data is unavailable right now. Please try again.';
}

function getRecallSearchErrorDiagnostics(error: unknown) {
  const details = error && typeof error === 'object'
    ? (error as {
        name?: unknown;
        message?: unknown;
        status?: unknown;
        statusCode?: unknown;
        response?: { status?: unknown };
      })
    : null;
  const rawMessage =
    typeof details?.message === 'string'
      ? details.message
      : error instanceof Error
        ? error.message
        : String(error);
  const message = rawMessage
    .replace(/([?&]api_key=)[^&\s]*/gi, '$1[REDACTED]')
    .replace(/("api_key"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');

  return {
    name: typeof details?.name === 'string' ? details.name : 'UnknownError',
    message,
    status:
      details?.status ??
      details?.statusCode ??
      details?.response?.status ??
      null,
  };
}

async function readCachedSearch(key: string): Promise<CachedSearch | null> {
  try {
    const cached = await AsyncStorage.getItem(key);
    const normalized = cached ? normalizeCachedSearch(JSON.parse(cached)) : null;
    return normalized && isRecallSearchCacheFresh(normalized.lastUpdated)
      ? normalized
      : null;
  } catch {
    return null;
  }
}

async function saveSearch(key: string, term: string, value: CachedSearch) {
  try {
    const indexValue = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    const parsedIndex = indexValue ? JSON.parse(indexValue) : [];
    const previousTerms = Array.isArray(parsedIndex)
      ? parsedIndex.filter((item): item is string => typeof item === 'string')
      : [];
    const nextTerms = [
      term.toLowerCase(),
      ...previousTerms.filter((item) => item !== term.toLowerCase()),
    ].slice(0, MAX_CACHED_SEARCHES);

    await Promise.all([
      AsyncStorage.setItem(key, JSON.stringify(value)),
      AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(nextTerms)),
    ]);
  } catch {
    // A cache failure should never stop a live recall search from completing.
  }
}

/**
 * Searches FDA for every product and adds USDA FSIS for meat, poultry, and egg
 * products. A failed FSIS lookup is returned as a source status, not a search error.
 */
export async function searchFoodRecalls(
  term: string,
  options: FdaRecallSearchOptions = {},
): Promise<RecallSearchResult> {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) {
    return { recalls: [], lastUpdated: new Date().toISOString(), fromCache: false };
  }
  const needsFsis = isFsisRecallSearch(normalizedTerm, options.productType);
  const source = needsFsis ? 'fda+fsis' : 'fda';
  const key = cacheKey(normalizedTerm, options, source);
  const cached = await readCachedSearch(key);
  if (cached) {
    console.info('[RecallSearch] fresh cache hit', {
      term: normalizedTerm,
      source,
      ageMs: Math.max(0, Date.now() - Date.parse(cached.lastUpdated)),
      ttlMs: RECALL_SEARCH_CACHE_TTL_MS,
    });
    return buildSearchResult(normalizedTerm, cached, true);
  }

  try {
    let recalls: FoodRecall[];
    let sourceUnavailable: 'fsis' | undefined;
    let fdaUnavailable: boolean | undefined;

    if (needsFsis) {
      const [fdaResult, fsisResult] = await Promise.allSettled([
        searchFdaRecalls(normalizedTerm, options),
        searchFsisRecalls(),
      ]);
      const combined = combineRecallSourceResults(fdaResult, fsisResult);
      recalls = combined.recalls;
      sourceUnavailable = combined.sourceUnavailable;
      fdaUnavailable = combined.fdaUnavailable;
      if (fdaUnavailable) {
        console.warn('[RecallSearch] FDA results unavailable during FSIS search', {
          term: normalizedTerm,
          fsisUnavailable: sourceUnavailable === 'fsis',
        });
      }
    } else {
      recalls = await searchFdaRecalls(normalizedTerm, options);
    }

    const freshResult: CachedSearch = {
      recalls,
      lastUpdated: new Date().toISOString(),
      sourceUnavailable,
      fdaUnavailable,
    };
    if (!fdaUnavailable && !sourceUnavailable) {
      await saveSearch(key, normalizedTerm, freshResult);
    }
    return buildSearchResult(normalizedTerm, freshResult, false);
  } catch (error) {
    const diagnostics = {
      term: normalizedTerm,
      source,
      hasCachedResult: false,
      ...getRecallSearchErrorDiagnostics(error),
    };

    console.error('[RecallSearch] live lookup failed', diagnostics);
    throw new Error(formatRecallSearchError(error));
  }
}
