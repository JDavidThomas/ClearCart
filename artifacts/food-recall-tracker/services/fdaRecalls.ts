import type { FoodRecall } from '../types/recall';
import {
  buildRecallSearchStrategies,
  cleanRecallSearchTerm,
} from './recallSearch.ts';
import { rankAndFilterRecalls } from './recallRelevance';
import {
  FdaDnsResolutionError,
  fetchOpenFdaWithDnsRetry,
} from './openFdaNetwork.ts';
import {
  addOpenFdaReportDateRange,
  getOpenFdaReportDateRange,
} from './openFdaDateRange.ts';

const OPENFDA_ENDPOINT = 'https://api.fda.gov/food/enforcement.json';
const DEFAULT_FDA_NOTICES_URL =
  'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';
const OPENFDA_RESULT_LIMIT = 100;
const MAX_SEARCH_ATTEMPTS = 3;
const SEARCH_ATTEMPT_DELAY_MS = 500;

/**
 * This key is intentionally exposed in the Expo app bundle. openFDA is a free
 * public API with a 120,000-request daily limit, and direct calls avoid the
 * Replit API-server URL issues that previously blocked recall searches.
 */
const OPENFDA_API_KEY = process.env.EXPO_PUBLIC_OPENFDA_API_KEY?.trim();

function redactOpenFdaValue(value: string) {
  const key = OPENFDA_API_KEY;
  if (!key) {
    return value.replace(/([?&]api_key=)[^&\s]*/gi, '$1[REDACTED]');
  }

  return value
    .split(key)
    .join('[REDACTED]')
    .split(encodeURIComponent(key))
    .join('[REDACTED]')
    .replace(/([?&]api_key=)[^&\s]*/gi, '$1[REDACTED]');
}

interface OpenFdaRecord {
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
  results?: unknown;
  error?: unknown;
}

function isOpenFdaRecord(value: unknown): value is OpenFdaRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export interface FdaRecallSearchOptions {
  brand?: string;
  productType?: string;
}

function valueOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeRecord(record: OpenFdaRecord): FoodRecall {
  return {
    recallNumber: record.recall_number?.trim() || undefined,
    productDescription: valueOrFallback(
      record.product_description,
      'Product description unavailable',
    ),
    reasonForRecall: valueOrFallback(record.reason_for_recall, 'Reason not provided'),
    recallingFirm: valueOrFallback(record.recalling_firm, 'Recalling firm not provided'),
    recallDate: valueOrFallback(record.report_date, 'Date not provided'),
    classification: valueOrFallback(record.classification, 'Classification not provided'),
    status: record.status?.trim() || undefined,
    officialUrl: valueOrFallback(record.url, DEFAULT_FDA_NOTICES_URL),
    source: 'FDA',
  };
}

class FdaErrorPayloadError extends Error {
  constructor(status: number) {
    super(`FDA API returned an error payload (HTTP ${status}).`);
    this.name = 'FdaErrorPayloadError';
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function searchEndpoint(search: string, attempt: number) {
  if (!OPENFDA_API_KEY) {
    throw new Error(
      'FDA API configuration is missing. EXPO_PUBLIC_OPENFDA_API_KEY is not available in the app bundle.',
    );
  }

  const params = new URLSearchParams({
    search,
    limit: String(OPENFDA_RESULT_LIMIT),
    sort: 'report_date:desc',
    api_key: OPENFDA_API_KEY,
  });
  const encodedParams = params.toString().replace(/\+/g, '%20').replace(/\*/g, '%2A');
  const requestUrl = `${OPENFDA_ENDPOINT}?${encodedParams}`;
  const safeRequestUrl = redactOpenFdaValue(requestUrl);
  const apiKeyIncluded = params.has('api_key');
  console.info('[OpenFDA] request', {
    attempt,
    maxAttempts: MAX_SEARCH_ATTEMPTS,
    url: safeRequestUrl,
    apiKeyConfigured: Boolean(OPENFDA_API_KEY),
    apiKeyIncluded,
  });

  let response: Response;
  try {
    response = await fetchOpenFdaWithDnsRetry(requestUrl, {
      onDnsRetry: (error) => {
        console.warn('[OpenFDA] DNS lookup failed; retrying once', {
          attempt,
          delayMs: 2_000,
          url: safeRequestUrl,
          error: redactOpenFdaValue(
            error instanceof Error ? error.message : String(error),
          ),
        });
      },
    });
  } catch (error) {
    console.error('[OpenFDA] fetch failed before receiving a response', {
      attempt,
      url: safeRequestUrl,
      apiKeyConfigured: Boolean(OPENFDA_API_KEY),
      apiKeyIncluded,
      error: redactOpenFdaValue(
        error instanceof Error ? error.message : String(error),
      ),
    });
    throw error;
  }

  const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
  if (rateLimitRemaining !== null) {
    console.info('[OpenFDA] rate limit status', {
      attempt,
      status: response.status,
      remaining: rateLimitRemaining,
    });
  }

  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (error) {
    console.error('[OpenFDA] response body could not be read', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      error: redactOpenFdaValue(error instanceof Error ? error.message : String(error)),
    });
    throw new Error('FDA API returned an unreadable response. Please try again.');
  }

  const safeResponseBody = redactOpenFdaValue(responseBody);
  if (response.status === 404) {
    console.info('[OpenFDA] response', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      body: safeResponseBody,
    });
    return [];
  }
  if (!response.ok) {
    console.error('[OpenFDA] error response', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      body: safeResponseBody,
    });
    throw new Error(`FDA API returned an error (HTTP ${response.status}). Please try again.`);
  }

  let payload: OpenFdaResponse;
  try {
    payload = JSON.parse(responseBody) as OpenFdaResponse;
  } catch {
    console.error('[OpenFDA] response was not valid JSON', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      body: safeResponseBody,
    });
    throw new Error('FDA API returned an unreadable response. Please try again.');
  }

  if (!isOpenFdaRecord(payload)) {
    console.warn('[OpenFDA] response was not an object; treating as no results', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      body: safeResponseBody,
    });
    return [];
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'error')) {
    console.error('[OpenFDA] error payload', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      body: safeResponseBody,
    });
    throw new FdaErrorPayloadError(response.status);
  }
  if (!Array.isArray(payload.results)) {
    console.warn('[OpenFDA] response results were not an array; treating as no results', {
      attempt,
      url: safeRequestUrl,
      status: response.status,
      body: safeResponseBody,
    });
    return [];
  }
  const results = payload.results.filter(isOpenFdaRecord);
  console.info('[OpenFDA] response', {
    attempt,
    url: safeRequestUrl,
    status: response.status,
    resultCount: results.length,
  });
  return results;
}

function deduplicateRecalls(records: OpenFdaRecord[]) {
  const seenRecallKeys = new Set<string>();
  return records
    .map(normalizeRecord)
    .filter((recall) => {
      const key =
        recall.recallNumber ??
        [recall.productDescription, recall.recallingFirm, recall.recallDate].join('|');
      if (seenRecallKeys.has(key)) return false;
      seenRecallKeys.add(key);
      return true;
    });
}

export async function searchFdaRecalls(
  term: string,
  options: FdaRecallSearchOptions = {},
): Promise<FoodRecall[]> {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) return [];

  const strategies = buildRecallSearchStrategies(normalizedTerm, options).slice(
    0,
    MAX_SEARCH_ATTEMPTS,
  );
  const dateRange = getOpenFdaReportDateRange();
  console.info('[OpenFDA] applying rolling report_date window', {
    from: dateRange.from,
    to: dateRange.to,
    sort: 'report_date:desc',
  });
  const records: OpenFdaRecord[] = [];
  let completedSearch = false;
  let lastErrorPayload: FdaErrorPayloadError | null = null;

  for (const [index, strategy] of strategies.entries()) {
    if (index > 0) await wait(SEARCH_ATTEMPT_DELAY_MS);
    try {
      const results = await searchEndpoint(
        addOpenFdaReportDateRange(strategy.query, dateRange),
        index + 1,
      );
      completedSearch = true;
      records.push(...results);
      const relevantResults = rankAndFilterRecalls(
        deduplicateRecalls(records),
        normalizedTerm,
      );
      if (relevantResults.length > 0) return relevantResults;
    } catch (error) {
      if (error instanceof FdaDnsResolutionError) throw error;
      if (!(error instanceof FdaErrorPayloadError)) throw error;
      console.warn('[OpenFDA] search strategy failed', {
        attempt: index + 1,
        field: strategy.field,
        term: strategy.term,
        search: strategy.query,
        error: redactOpenFdaValue(error.message),
      });
      lastErrorPayload = error;
    }
  }

  if (!completedSearch && lastErrorPayload) {
    throw lastErrorPayload;
  }

  return rankAndFilterRecalls(deduplicateRecalls(records), normalizedTerm);
}
