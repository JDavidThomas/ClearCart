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
  shouldBypassEmptyNewsCache,
  isRecallNewsQueryCacheCurrent,
  isRecallSearchCacheFresh,
  shouldRefreshRecallNews,
  RECALL_NEWS_QUERY_CACHE_VERSION,
  RECALL_SEARCH_CACHE_TTL_MS,
} from './recallCache';
import { filterRecentNews } from './recallNewsFilters';
import { getCurrentApiBaseUrl } from './apiConnection';
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
  recentNews?: RecallNewsArticle[];
  newsUnavailable?: boolean;
  newsCheckedAt?: string;
  newsQueryVersion: number;
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
      const recentNews = normalizeNewsArticles(candidate.recentNews);

      return {
        recalls: candidate.recalls as FoodRecall[],
        recentNews,
        newsUnavailable:
          candidate.newsUnavailable === true ||
          !isRecallNewsQueryCacheCurrent(candidate.newsQueryVersion),
        newsCheckedAt:
          typeof candidate.newsCheckedAt === 'string' ? candidate.newsCheckedAt : undefined,
        newsQueryVersion: RECALL_NEWS_QUERY_CACHE_VERSION,
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
  console.log(`[RecallNews] NEWS FETCH PATH ENTERED term=${term}`);
  try {
    const response = await getRecallNews({ term });
    const rawArticles = Array.isArray(response.articles) ? response.articles : [];
    console.log('[RecallNews] response returned to search service', {
      term,
      rawArticleCount: rawArticles.length,
      rawUnavailable: response.unavailable,
    });
    const articles = filterRecentNews(rawArticles);
    const unavailable = response.unavailable === true;
    console.log('[RecallNews] response normalized', {
      term,
      apiBaseUrl: getCurrentApiBaseUrl(),
      endpointPath: '/api/recalls/news',
      from: response.dateRange?.from,
      to: response.dateRange?.to,
      rawArticleCount: rawArticles.length,
      filteredArticleCount: articles.length,
      firstRawArticleTitle: rawArticles[0]?.title ?? null,
      firstFilteredArticleTitle: articles[0]?.title ?? null,
      rawUnavailable: response.unavailable,
      computedUnavailable: unavailable,
    });
    return { articles, unavailable };
  } catch (error) {
    const errorDetails =
      error && typeof error === 'object'
        ? (error as { name?: unknown; message?: unknown; status?: unknown; statusCode?: unknown })
        : null;
    const rawMessage =
      typeof errorDetails?.message === 'string'
        ? errorDetails.message
        : error instanceof Error
          ? error.message
          : String(error);
    const message = rawMessage
      .replace(/([?&]api_key=)[^&\s]*/gi, '$1[REDACTED]')
      .replace(/("api_key"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');
    console.warn('[RecallNews] request failed; continuing without news', {
      term,
      errorName: typeof errorDetails?.name === 'string' ? errorDetails.name : 'UnknownError',
      status: errorDetails?.status ?? errorDetails?.statusCode ?? null,
      message,
    });
    return { articles: [], unavailable: true };
  }
}

async function isRecentSearchTerm(term: string) {
  try {
    const indexValue = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    const parsedIndex: unknown = indexValue ? JSON.parse(indexValue) : [];
    return (
      Array.isArray(parsedIndex) &&
      parsedIndex.some(
        (item) => typeof item === 'string' && item === term.toLowerCase(),
      )
    );
  } catch {
    return false;
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
  console.log(`[RecallNews] SEARCH FOOD RECALLS ENTERED term=${term}`);
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) {
    console.log('[RecallNews] search stopped after empty-term guard', { term });
    return { recalls: [], lastUpdated: new Date().toISOString(), fromCache: false };
  }
  const key = cacheKey(normalizedTerm, options);
  const cached = await readCachedSearch(key);
  const cachedNewsArticleCount = cached?.recentNews?.length ?? 0;
  const recentSearchTerm =
    Boolean(cached) && cachedNewsArticleCount === 0
      ? await isRecentSearchTerm(normalizedTerm)
      : false;
  const isRecentTermWithEmptyNews = shouldBypassEmptyNewsCache(
    cachedNewsArticleCount,
    recentSearchTerm,
  );
  console.log('[RecallNews] cache check completed', {
    term,
    normalizedTerm,
    cacheHit: Boolean(cached),
    cacheValue: cached
      ? {
          lastUpdated: cached.lastUpdated,
          recentNewsArticleCount: cachedNewsArticleCount,
          recentNews: (cached.recentNews ?? [])
            .slice(0, 3)
            .map((article) => ({
              title: article.title,
              publishedAt: article.publishedAt,
            })),
          visibleRecentNewsArticleCount: filterRecentNews(
            cached.recentNews ?? [],
          ).length,
          newsUnavailable: cached.newsUnavailable,
          newsCheckedAt: cached.newsCheckedAt,
          newsQueryVersion: cached.newsQueryVersion,
        }
      : null,
    isRecentSearchTerm: recentSearchTerm,
    bypassEmptyNewsCache: isRecentTermWithEmptyNews,
  });
  if (cached) {
    console.log('[RecallSearch] fresh cache hit', {
      term: normalizedTerm,
      ageMs: Math.max(0, Date.now() - Date.parse(cached.lastUpdated)),
      ttlMs: RECALL_SEARCH_CACHE_TTL_MS,
    });
    if (isRecentTermWithEmptyNews) {
      console.log('[RecallSearch] bypassing empty news cache for recent term', {
        term: normalizedTerm,
        cachedNewsArticleCount,
      });
    }
    if (
      isRecentTermWithEmptyNews ||
      shouldRefreshRecallNews(
        cached.newsUnavailable,
        cachedNewsArticleCount,
        cached.newsCheckedAt,
      )
    ) {
      const news = await searchRecentRecallNews(normalizedTerm);
      const refreshedCache = {
        ...cached,
        recentNews: news.articles,
        newsUnavailable: news.unavailable,
        newsCheckedAt: new Date().toISOString(),
        newsQueryVersion: RECALL_NEWS_QUERY_CACHE_VERSION,
      };
      if (!news.unavailable) {
        await saveSearch(key, normalizedTerm, refreshedCache);
      }
      return buildSearchResult(normalizedTerm, refreshedCache, true);
    }
    return buildSearchResult(normalizedTerm, cached, true);
  }

  try {
    console.log('[RecallNews] no cached search; starting live FDA and news requests', {
      term: normalizedTerm,
    });
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
      if (newsUnavailable) throw fdaResult.reason;
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
      newsCheckedAt: new Date().toISOString(),
      newsQueryVersion: RECALL_NEWS_QUERY_CACHE_VERSION,
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
