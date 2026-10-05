export const RECALL_SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const RECALL_EMPTY_NEWS_CACHE_TTL_MS = 5 * 60 * 1_000;
export const RECALL_NEWS_QUERY_CACHE_VERSION = 5;

export function isRecallNewsQueryCacheCurrent(version: unknown) {
  return version === RECALL_NEWS_QUERY_CACHE_VERSION;
}

export function isRecallSearchCacheFresh(lastUpdated: string, now = Date.now()) {
  const timestamp = Date.parse(lastUpdated);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= RECALL_SEARCH_CACHE_TTL_MS;
}

export function shouldRefreshRecallNews(
  newsUnavailable: boolean | undefined,
  articleCount: number,
  newsCheckedAt: string | undefined,
  now = Date.now(),
) {
  if (newsUnavailable === true) return true;
  if (articleCount > 0) return false;

  const timestamp = Date.parse(newsCheckedAt ?? '');
  const age = now - timestamp;
  return (
    !Number.isFinite(timestamp) ||
    age < 0 ||
    age >= RECALL_EMPTY_NEWS_CACHE_TTL_MS
  );
}

export function shouldBypassEmptyNewsCache(
  articleCount: number,
  isRecentSearch: boolean,
) {
  return articleCount === 0 && isRecentSearch;
}

export function shouldFetchCachedRecallNews(
  newsUnavailable: boolean | undefined,
  articleCount: number,
  newsCheckedAt: string | undefined,
  isRecentSearch: boolean,
  hasDiagnostics: boolean,
  now = Date.now(),
) {
  return (
    shouldBypassEmptyNewsCache(articleCount, isRecentSearch) ||
    shouldRefreshRecallNews(newsUnavailable, articleCount, newsCheckedAt, now) ||
    !hasDiagnostics
  );
}