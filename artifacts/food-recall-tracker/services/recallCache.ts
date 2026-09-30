export const RECALL_SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const RECALL_NEWS_QUERY_CACHE_VERSION = 2;

export function isRecallNewsQueryCacheCurrent(version: unknown) {
  return version === RECALL_NEWS_QUERY_CACHE_VERSION;
}

export function isRecallSearchCacheFresh(lastUpdated: string, now = Date.now()) {
  const timestamp = Date.parse(lastUpdated);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= RECALL_SEARCH_CACHE_TTL_MS;
}