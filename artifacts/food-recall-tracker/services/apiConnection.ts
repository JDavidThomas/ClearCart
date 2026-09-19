export const API_BASE_URL_CACHE_KEY = '@food-recall-tracker/api-base-url';

export const HEALTH_RETRY_DELAYS_MS = [500, 1000, 2000] as const;

export interface ApiUrlStorage {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

export function normalizeApiBaseUrl(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getCurrentApiBaseUrl(
  apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL,
) {
  return normalizeApiBaseUrl(apiBaseUrl);
}

export function resolveApiBaseUrl(
  currentApiBaseUrl: string | null | undefined,
  cachedApiBaseUrl: string | null | undefined,
) {
  // The stale-URL regression happened when a previous server address won over
  // the current Replit environment. Always prefer the current injected URL.
  return normalizeApiBaseUrl(currentApiBaseUrl) ?? normalizeApiBaseUrl(cachedApiBaseUrl);
}

export function getHealthRetryDelay(retryIndex: number) {
  return HEALTH_RETRY_DELAYS_MS[Math.min(retryIndex, HEALTH_RETRY_DELAYS_MS.length - 1)];
}
