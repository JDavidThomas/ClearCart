import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  FoodRecall,
  RecallNewsArticle,
  RecallSearchResult,
} from '@/types/recall';
import { getRecallNews } from '@workspace/api-client-react';
import { searchFdaRecalls, type FdaRecallSearchOptions } from './fdaRecalls';
import { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';
import {
  getRecallRelevanceNotice,
  rankAndFilterRecalls,
  splitRecallGroups,
} from './recallRelevance';
import {
  isRecallSearchCacheFresh,
  RECALL_SEARCH_CACHE_TTL_MS,
} from './recallCache';
export {
  lookupOpenFoodFactsProduct,
  searchOpenFoodFactsProduct,
} from './openFoodFacts';

export { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch';

const CACHE_PREFIX = '@food-recall-tracker/recalls/';
const CACHE_INDEX_KEY = '@food-recall-tracker/recent-searches';
const MAX_CACHED_SEARCHES = 8;
const RECENT_NEWS_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;

interface CachedSearch {
  recalls: FoodRecall[];
  recentNews?: RecallNewsArticle[];
  newsUnavailable?: boolean;
  lastUpdated: string;
  relevanceNotice?: string;
  fdaUnavailable?: boolean;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNewsArticles(value: unknown): RecallNewsArticle[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.title !== 'string' ||
      typeof item.url !== 'string' ||
      typeof item.publishedAt !== 'string' ||
      typeof item.source !== 'string'
    ) {
      return [];
    }

    return [{
      title: item.title,
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
      url: item.url,
      publishedAt: item.publishedAt,
      source: item.source,
    }];
  });
}

function filterRecentNews(articles: RecallNewsArticle[], now = Date.now()) {
  const cutoff = now - RECENT_NEWS_WINDOW_MS;
  return articles.filter((article) => {
    const publishedAt = Date.parse(article.publishedAt);
    return Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now;
  });
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
        recentNews: normalizeNewsArticles(candidate.recentNews),
        newsUnavailable: candidate.newsUnavailable === true,
        lastUpdated,
        relevanceNotice:
          typeof candidate.relevanceNotice === 'string' ? candidate.relevanceNotice : undefined,
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
    recentNews: filterRecentNews(cached.recentNews ?? []),
    newsUnavailable: cached.newsUnavailable,
    lastUpdated: cached.lastUpdated,
    fromCache,
    relevanceNotice: getRecallRelevanceNotice(term, rankedRecalls),
    isProduceSearch: groups.isProduceSearch,
    produceItem: groups.produceItem,
    fdaUnavailable: cached.fdaUnavailable,
  };
}

async function searchRecentRecallNews(term: string): Promise<{
  articles: RecallNewsArticle[];
  unavailable: boolean;
}> {
  try {
    const response = await getRecallNews({ term });
    const articles = filterRecentNews(response.articles ?? []);
    console.info('[RecallNews] search completed', {
      term,
      from: response.dateRange?.from,
      to: response.dateRange?.to,
      articleCount: articles.length,
      unavailable: response.unavailable,
    });
    return { articles, unavailable: response.unavailable };
  } catch {
    console.warn('[RecallNews] source unavailable; continuing without news', { term });
    return { articles: [], unavailable: true };
  }
}

function normalizeCacheOption(value?: string) {
  const normalized = value ? cleanRecallSearchTerm(value) : '';
  return /^(unknown|unclear|none|null)$/i.test(normalized) ? '' : normalized;
}

function cacheKey(
  term: string,
  options: FdaRecallSearchOptions,
) {
  const brand = normalizeCacheOption(options.brand).toLowerCase();
  const productType = normalizeCacheOption(options.productType).toLowerCase();
  const optionIdentity = [brand, productType].filter(Boolean).join('|');
  const identity = [
    term.toLowerCase(),
    optionIdentity,
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

export async function searchFoodRecalls(
  term: string,
  options: FdaRecallSearchOptions = {},
): Promise<RecallSearchResult> {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) {
    return { recalls: [], lastUpdated: new Date().toISOString(), fromCache: false };
  }
  const key = cacheKey(normalizedTerm, options);
  const cached = await readCachedSearch(key);
  if (cached) {
    console.info('[RecallSearch] fresh cache hit', {
      term: normalizedTerm,
      ageMs: Math.max(0, Date.now() - Date.parse(cached.lastUpdated)),
      ttlMs: RECALL_SEARCH_CACHE_TTL_MS,
    });
    if (cached.newsUnavailable) {
      const news = await searchRecentRecallNews(normalizedTerm);
      const refreshedCache = {
        ...cached,
        recentNews: news.articles,
        newsUnavailable: news.unavailable,
      };
      if (!news.unavailable) {
        await saveSearch(key, normalizedTerm, refreshedCache);
      }
      return buildSearchResult(normalizedTerm, refreshedCache, true);
    }
    return buildSearchResult(normalizedTerm, cached, true);
  }

  try {
    let recalls: FoodRecall[];
    let recentNews: RecallNewsArticle[] = [];
    let newsUnavailable = true;
    let fdaUnavailable: boolean | undefined;

    const [fdaResult, newsResult] = await Promise.allSettled([
      searchFdaRecalls(normalizedTerm, options),
      searchRecentRecallNews(normalizedTerm),
    ]);
    if (newsResult.status === 'fulfilled') {
      recentNews = newsResult.value.articles;
      newsUnavailable = newsResult.value.unavailable;
    }

    if (fdaResult.status === 'rejected') {
      if (recentNews.length === 0) throw fdaResult.reason;
      recalls = [];
      fdaUnavailable = true;
      console.warn('[RecallSearch] FDA unavailable; showing recent news mentions', {
        term: normalizedTerm,
        articleCount: recentNews.length,
      });
    } else {
      recalls = fdaResult.value;
    }

    const freshResult: CachedSearch = {
      recalls,
      recentNews,
      newsUnavailable,
      lastUpdated: new Date().toISOString(),
      fdaUnavailable,
    };
    if (!fdaUnavailable) {
      await saveSearch(key, normalizedTerm, freshResult);
    }
    return buildSearchResult(normalizedTerm, freshResult, false);
  } catch (error) {
    const diagnostics = {
      term: normalizedTerm,
      hasCachedResult: false,
      ...getRecallSearchErrorDiagnostics(error),
    };

    console.error('[RecallSearch] live lookup failed', diagnostics);
    throw new Error(formatRecallSearchError(error));
  }
}
